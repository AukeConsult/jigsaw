import { describe, expect, it } from "vitest";
import { openAiSettings } from "../src/common/openai-settings";
import { configuredClassifier, openAiClassifier } from "../src/jigsaw/classifier";
import { Classifications } from "../src/models";
import { AiUnavailable } from "../src/common/openai-chat";

// None of these calls OpenAI: the one thing that does, `fetch`, is replaced by a fake that remembers what it was asked and says what the test wants.

const KEY = "test-key-not-a-real-key";
const settings = { apiKey: KEY, model: "some-model", detail: "low" as const };
const picture = { data: Buffer.from("not really a picture"), mime: "image/jpeg" };

/** a fake `fetch` that answers with this (status and JSON body) and remembers the request */
function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit & { headers: Record<string, string> } }[] = [];
  const fetchFn = (async (url: string, init: RequestInit & { headers: Record<string, string> }) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  }) as unknown as typeof fetch;
  return { fetchFn, calls };
}
const answer = (content: unknown) => ({ choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content) } }] });

describe("the settings of the AI", () => {
  it("need a key and a model, and say where to put them", () => {
    expect(openAiSettings({})).toEqual({ error: expect.stringMatching(/OPENAI_API_KEY and OPENAI_MODEL are not set.*\.env.*sync:env/) });
    expect(openAiSettings({ OPENAI_API_KEY: "k" })).toEqual({ error: expect.stringMatching(/^OPENAI_MODEL is not set/) });
    expect(openAiSettings({ JIGSAW_OPENAI_API_KEY: "k", OPENAI_MODEL: "m" })).toMatchObject({ apiKey: "k", model: "m" }); // the deployed function has the key as its Firebase secret
    expect(openAiSettings({ OPENAI_MODEL: "m" })).toEqual({ error: expect.stringMatching(/^OPENAI_API_KEY is not set/) });
    expect(openAiSettings({ OPENAI_API_KEY: "  ", OPENAI_MODEL: "m" })).toEqual({ error: expect.stringMatching(/OPENAI_API_KEY/) }); // spaces are nothing
  });

  it("look at the picture closely as little as can be (low) unless it is said, and take the organization and the project when they are given", () => {
    expect(openAiSettings({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m" })).toEqual({ apiKey: "k", model: "m", detail: "low" });
    expect(openAiSettings({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m", OPENAI_IMAGE_DETAIL: "high", OPENAI_ORG_ID: "org-1", OPENAI_PROJECT_ID: "proj-1" })).toEqual({ apiKey: "k", model: "m", detail: "high", orgId: "org-1", projectId: "proj-1" });
    expect(openAiSettings({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m", OPENAI_IMAGE_DETAIL: "" })).toMatchObject({ detail: "low" });
    expect(openAiSettings({ OPENAI_API_KEY: "k", OPENAI_MODEL: "m", OPENAI_IMAGE_DETAIL: "huge" })).toEqual({ error: expect.stringMatching(/OPENAI_IMAGE_DETAIL/) });
  });
});

describe("the classifier that asks OpenAI", () => {
  it("sends the picture and the strict schema to the model of the settings, with the key, and gives back what was said, checked", async () => {
    const { fetchFn, calls } = fakeFetch(200, answer({ categories: ["nature/forest", "boats"], name: "Forest path", description: "A path in a forest." }));
    const found = await openAiClassifier({ ...settings, orgId: "org-1", projectId: "proj-1" }, fetchFn).classify(picture, "nb");
    expect(found).toEqual({ categories: ["nature/forest"], name: "Forest path", description: "A path in a forest." }); // "boats" is not a category
    expect(calls).toHaveLength(1);
    const { url, init } = calls[0];
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(init.headers["OpenAI-Organization"]).toBe("org-1");
    expect(init.headers["OpenAI-Project"]).toBe("proj-1");
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe("some-model");
    expect(body.messages[0]).toEqual({ role: "system", content: Classifications.prompt("nb") }); // in the language of the jigsaw
    const image = body.messages[1].content[1];
    expect(image.image_url).toEqual({ url: `data:image/jpeg;base64,${picture.data.toString("base64")}`, detail: "low" });
    expect(body.response_format).toEqual({ type: "json_schema", json_schema: { name: "jigsaw_classification", strict: true, schema: Classifications.schema() } });
  });

  it("leaves out the organization and the project when there are none", async () => {
    const { fetchFn, calls } = fakeFetch(200, answer({ categories: [], name: "", description: "" }));
    await openAiClassifier(settings, fetchFn).classify(picture, "en");
    expect(Object.keys(calls[0].init.headers).sort()).toEqual(["Authorization", "Content-Type"]);
  });

  it("fails with what OpenAI said and the status, and never with the key", async () => {
    const { fetchFn } = fakeFetch(401, { error: { message: "Incorrect API key provided." } });
    const error = await openAiClassifier(settings, fetchFn).classify(picture, "en").catch((e: Error) => e);
    expect((error as Error).message).toBe("OpenAI answered 401: Incorrect API key provided.");
    expect((error as Error).message).not.toContain(KEY);
    const noBody = await openAiClassifier(settings, fakeFetch(500, null).fetchFn).classify(picture, "en").catch((e: Error) => e);
    expect((noBody as Error).message).toBe("OpenAI answered 500");
  });

  it("fails when it refuses, or does not answer with JSON, or the answer is not an object", async () => {
    const refusal = fakeFetch(200, { choices: [{ message: { refusal: "I can't help with that." } }] });
    await expect(openAiClassifier(settings, refusal.fetchFn).classify(picture, "en")).rejects.toThrow(/would not classify.*can't help/);
    await expect(openAiClassifier(settings, fakeFetch(200, answer("not json")).fetchFn).classify(picture, "en")).rejects.toThrow("did not answer with JSON");
    await expect(openAiClassifier(settings, fakeFetch(200, { choices: [] }).fetchFn).classify(picture, "en")).rejects.toThrow("did not answer with JSON");
    await expect(openAiClassifier(settings, fakeFetch(200, answer("5")).fetchFn).classify(picture, "en")).rejects.toThrow("not an object");
  });
});

describe("the classifier that reads its settings when it is asked", () => {
  it("is unavailable, with what is missing, until the settings are there", async () => {
    const { fetchFn, calls } = fakeFetch(200, answer({}));
    const error = await configuredClassifier({}, fetchFn).classify(picture, "en").catch((e: Error) => e);
    expect(error).toBeInstanceOf(AiUnavailable);
    expect((error as Error).message).toMatch(/OPENAI_API_KEY and OPENAI_MODEL/);
    expect(calls).toHaveLength(0); // nothing was asked
  });

  it("asks OpenAI with the settings of the environment when they are there", async () => {
    const { fetchFn, calls } = fakeFetch(200, answer({ categories: ["art"], name: "A painting", description: "Colours." }));
    const found = await configuredClassifier({ OPENAI_API_KEY: KEY, OPENAI_MODEL: "m2" }, fetchFn).classify(picture, "en");
    expect(found.categories).toEqual(["art"]);
    expect(JSON.parse(calls[0].init.body as string).model).toBe("m2");
  });
});

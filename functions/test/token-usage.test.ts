import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { openAiClassifier, type Classifier } from "../src/jigsaw/classifier";
import type { ImageStore } from "../src/jigsaw/jigsaw-image";
import type { TokenUsageStore } from "../src/jigsaw/token-usage";
import { TokenUsages, type AiUsage, type JigsawSpec, type TokenUsageSpec } from "../src/models";
import { memoryPlays, memoryUsers } from "./memory-plays";
import { AiFailed, AiUnavailable } from "../src/common/openai-chat";

// What the AI uses is kept for the user who pays: the rules (on the class), what OpenAI says, and the route. Nothing here calls OpenAI.

const usage: AiUsage = { provider: "openai", model: "some-model", responseModel: "some-model-2026-01-01", requestId: "chatcmpl-1", inputTokens: 1200, outputTokens: 80, totalTokens: 1280, cachedInputTokens: 100, reasoningTokens: 20, imageDetail: "low" };

describe("what the AI used, as it is kept", () => {
  it("reads the use from an OpenAI answer, with the model and the closeness of the look that were asked for", () => {
    const body = { id: "chatcmpl-1", model: "some-model-2026-01-01", usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280, prompt_tokens_details: { cached_tokens: 100 }, completion_tokens_details: { reasoning_tokens: 20 } } };
    expect(TokenUsages.fromOpenAi(body, { model: "some-model", imageDetail: "low" })).toEqual(usage);
    expect(TokenUsages.fromOpenAi({ usage: { prompt_tokens: 5, completion_tokens: 2 } }, { model: "m" })).toEqual({ provider: "openai", model: "m", inputTokens: 5, outputTokens: 2, totalTokens: 7 }); // the total when it says none
    expect(TokenUsages.fromOpenAi({ choices: [] }, { model: "m" })).toBeUndefined(); // it says nothing: nothing to keep
    expect(TokenUsages.fromOpenAi({ usage: { prompt_tokens: -3, completion_tokens: "x" } }, { model: "m" })).toMatchObject({ inputTokens: 0, outputTokens: 0 });
  });

  it("makes the document for a user: who, what for, when, and not yet paid for", () => {
    const kept = TokenUsages.record(usage, { userId: "u1", kind: "classify", jigsawId: "jig1", status: "ok", applied: true, now: Date.UTC(2026, 10, 22, 12, 0, 0) });
    expect(kept).toEqual({ ...usage, userId: "u1", kind: "classify", jigsawId: "jig1", status: "ok", applied: true, createdAt: Date.UTC(2026, 10, 22, 12, 0, 0), date: "2026-11-22T12:00:00.000Z", billed: false });
  });

  it("adds up what is used and what is not yet paid for", () => {
    const one = (over: Partial<TokenUsageSpec>): TokenUsageSpec => ({ ...TokenUsages.record(usage, { userId: "u1", kind: "classify", status: "ok", applied: false, now: 1 }), id: "x", ...over });
    expect(TokenUsages.totals([one({}), one({ billed: true }), one({ inputTokens: 10, outputTokens: 5, totalTokens: 15 })])).toEqual({ calls: 3, inputTokens: 2410, outputTokens: 165, totalTokens: 2575, unbilledTokens: 1295 });
    expect(TokenUsages.totals([])).toEqual({ calls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0, unbilledTokens: 0 });
  });
});

describe("the classifier that asks OpenAI says what it used", () => {
  const picture = { data: Buffer.from("p"), mime: "image/jpeg" };
  const asking = (content: unknown, extra: object = {}) =>
    openAiClassifier({ apiKey: "k", model: "some-model", detail: "low" }, (async () => ({ ok: true, status: 200, json: async () => ({ id: "chatcmpl-1", model: "some-model-2026-01-01", usage: { prompt_tokens: 1200, completion_tokens: 80, total_tokens: 1280 }, choices: [{ message: { content: typeof content === "string" ? content : JSON.stringify(content), ...extra } }] }) })) as unknown as typeof fetch);

  it("gives the use with the answer", async () => {
    const found = await asking({ categories: [], name: "A", description: "" }).classify(picture, "en");
    expect(found.usage).toMatchObject({ model: "some-model", responseModel: "some-model-2026-01-01", inputTokens: 1200, outputTokens: 80, imageDetail: "low" });
  });

  it("says what was used also when the answer cannot be used (the tokens are spent all the same)", async () => {
    const err = await asking("not json").classify(picture, "en").catch((e) => e);
    expect(err).toBeInstanceOf(AiFailed);
    expect((err as AiFailed).usage).toMatchObject({ inputTokens: 1200, outputTokens: 80 });
  });
});

describe("the use of the AI is kept under the user", () => {
  const jigsaw: JigsawSpec = { id: "jig1", name: "J", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], createdAt: 7, ownerUid: "u1", author: "Owner" };
  function setup(classify: Classifier["classify"]) {
    const kept: { userId: string; usage: Omit<TokenUsageSpec, "id"> }[] = [];
    const tokenUsage: TokenUsageStore = {
      async add(userId, usage) {
        kept.push({ userId, usage });
        return { id: `t${kept.length}`, ...usage };
      },
      async list(userId) {
        return kept.filter((k) => k.userId === userId).map((k, i) => ({ id: `t${i}`, ...k.usage }));
      },
    };
    const store = { list: async () => [jigsaw], add: async () => jigsaw, update: async (id: string, input: object) => ({ ...input, id, createdAt: 7 }) as unknown as JigsawSpec, remove: async () => true };
    const images: ImageStore = { async put() {}, async get() { return { data: Buffer.from("x"), mime: "image/jpeg", etag: "e" }; }, async remove() {} };
    const app = createJigsawApp({ jigsaw: store as never, jigsawImages: images, classifier: { classify }, tokenUsage, plays: memoryPlays(), users: memoryUsers("u1", "u2"), now: () => 1_000 });
    return { app, kept };
  }
  const ok: Classifier["classify"] = async () => ({ categories: ["family"], name: "N", description: "D", usage });

  it("keeps a call for the user who asked, with what it used, and does not give it to the page", async () => {
    const { app, kept } = setup(ok);
    const res = await request(app).post("/jigsaw/api/jigsaw/jig1/classify?apply=true").set("X-Jigsaw-User", "u1");
    expect(res.status).toBe(200);
    expect("usage" in res.body).toBe(false);
    expect(kept).toHaveLength(1);
    expect(kept[0].userId).toBe("u1");
    expect(kept[0].usage).toMatchObject({ ...usage, userId: "u1", kind: "classify", jigsawId: "jig1", status: "ok", applied: true, createdAt: 1_000, billed: false });
  });

  it("keeps a call that was only asked for (not applied), and one whose answer could not be used (failed)", async () => {
    const asked = setup(ok);
    await request(asked.app).post("/jigsaw/api/jigsaw/jig1/classify").set("X-Jigsaw-User", "u1");
    expect(asked.kept[0].usage).toMatchObject({ status: "ok", applied: false });
    const failed = setup(async () => {
      throw new AiFailed("no JSON", usage);
    });
    const res = await request(failed.app).post("/jigsaw/api/jigsaw/jig1/classify?apply=true").set("X-Jigsaw-User", "u1");
    expect(res.status).toBe(502);
    expect(failed.kept[0].usage).toMatchObject({ status: "failed", applied: false, inputTokens: 1200 });
  });

  it("keeps nothing when the AI could not be asked at all, or the call is refused", async () => {
    const down = setup(async () => {
      throw new AiUnavailable("no settings");
    });
    expect((await request(down.app).post("/jigsaw/api/jigsaw/jig1/classify").set("X-Jigsaw-User", "u1")).status).toBe(503);
    expect(down.kept).toEqual([]);
    const refused = setup(ok);
    expect((await request(refused.app).post("/jigsaw/api/jigsaw/jig1/classify").set("X-Jigsaw-User", "u2")).status).toBe(403);
    expect(refused.kept).toEqual([]);
  });

  it("shows the user what was used and what it adds up to, to the user only", async () => {
    const { app } = setup(ok);
    await request(app).post("/jigsaw/api/jigsaw/jig1/classify?apply=true").set("X-Jigsaw-User", "u1");
    await request(app).post("/jigsaw/api/jigsaw/jig1/classify").set("X-Jigsaw-User", "u1");
    const mine = await request(app).get("/jigsaw/api/jigsaw-users/u1/token-usage").set("X-Jigsaw-User", "u1");
    expect(mine.status).toBe(200);
    expect(mine.body.items).toHaveLength(2);
    expect(mine.body.totals).toEqual({ calls: 2, inputTokens: 2400, outputTokens: 160, totalTokens: 2560, unbilledTokens: 2560 });
    expect((await request(app).get("/jigsaw/api/jigsaw-users/u1/token-usage").set("X-Jigsaw-User", "u2")).status).toBe(403);
    expect((await request(app).get("/jigsaw/api/jigsaw-users/u1/token-usage")).status).toBe(403);
  });
});

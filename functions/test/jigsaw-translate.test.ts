import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { Translator } from "../src/jigsaw/translator";
import { AiUnavailable } from "../src/common/openai-chat";
import type { JigsawSpec, TokenUsageSpec, Translations } from "../src/models";
import { PUBLISHER, TEST_KEY_SECRET, memoryPlays, memoryUsers } from "./memory-plays";

// Translating the words of a picture, through the routes, with a fake translator: nothing here calls OpenAI.

const picture = (over: Partial<JigsawSpec> = {}): JigsawSpec => ({ id: "pic12345", name: "Skog", description: "Trær.", language: "nb", kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], createdAt: 7, ownerUid: "u1", ...over });

/** one picture in memory, a translator that writes the language before the words, and what was asked and used */
function setup(over: Partial<JigsawSpec> = {}, translate?: Translator["translate"]) {
  let now: JigsawSpec = picture(over);
  const asked: { from: string; to: readonly string[]; limits: unknown }[] = [];
  const used: Omit<TokenUsageSpec, "id">[] = [];
  const store = {
    list: async () => [now],
    add: async (input: Record<string, unknown>) => (now = { ...(input as unknown as JigsawSpec), id: now.id, createdAt: 8 }),
    update: async (id: string, input: Record<string, unknown>) => (id === now.id ? (now = { ...(input as unknown as JigsawSpec), id, createdAt: now.createdAt }) : null),
    remove: async () => true,
    setTranslations: async (_id: string, translations: Translations) => void (now = { ...now, translations }),
  };
  const translator: Translator = {
    translate: async (words, from, to, limits) => {
      asked.push({ from, to, limits });
      if (translate) return translate(words, from, to, limits);
      return { made: Object.fromEntries(to.map((l) => [l, { title: `${l}: ${words.title}`, ...(words.text ? { text: `${l}: ${words.text}` } : {}) }])), usage: { provider: "openai", model: "m", inputTokens: 10, outputTokens: 20, totalTokens: 30 } as never };
    },
  };
  const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, levels: PUBLISHER, jigsaw: store as never, translator, plays: memoryPlays(), users: memoryUsers("u1", "u2"), tokenUsage: { add: async (_u: string, u: Omit<TokenUsageSpec, "id">) => void used.push(u), list: async () => [] } as never });
  return { app, asked, used, saved: () => now };
}
const ask = (a: ReturnType<typeof setup>, who = "u2", id = "pic12345") => request(a.app).post(`/jigsaw/api/jigsaw/${id}/translate`).set("X-Jigsaw-User", who);
const change = (a: ReturnType<typeof setup>, over: Record<string, unknown>) => {
  const { id: _id, createdAt: _at, ...input } = a.saved();
  return request(a.app).put("/jigsaw/api/jigsaw/pic12345").set("X-Jigsaw-User", "u1").send({ ...input, ...over });
};

describe("translating the words of a picture", () => {
  it("makes every language it lacks from what is saved, keeps them, and the owner pays", async () => {
    const a = setup();
    const res = await ask(a);
    expect(res.status).toBe(200);
    expect(res.body.translations.en).toEqual({ name: "en: Skog", description: "en: Trær." });
    expect(Object.keys(res.body.translations)).toHaveLength(8);
    expect(a.saved().translations).toEqual(res.body.translations);
    expect(a.asked).toHaveLength(1);
    expect([a.asked[0].from, a.asked[0].to.includes("nb"), a.asked[0].limits]).toEqual(["nb", false, { title: 60, text: 500, label: 24 }]);
    expect(a.used).toMatchObject([{ userId: "u1", kind: "translate", jigsawId: "pic12345", status: "ok", applied: true }]);
  });

  it("asks the AI once: nothing is lacking afterwards, and several at once share one question", async () => {
    const a = setup();
    await Promise.all([ask(a), ask(a), ask(a)]);
    await ask(a);
    expect(a.asked).toHaveLength(1);
  });

  it("takes no words from the call, and is not there for who may not see the picture", async () => {
    const a = setup({ visibility: "hidden" });
    expect((await ask(a, "u2")).status).toBe(404);
    expect((await ask(a, "u2", "missing12")).status).toBe(404);
    expect(a.asked).toEqual([]);
    await ask(a, "u1").send({ name: "Translate my own text" });
    expect(a.saved().translations?.en.name).toBe("en: Skog");
  });

  it("says when the AI cannot be used or fails, keeps nothing, and leaves those words alone for a while", async () => {
    const down = setup({}, async () => { throw new AiUnavailable("OPENAI_API_KEY is not set"); });
    expect((await ask(down)).status).toBe(503);
    const failing = setup({}, async () => { throw new Error("OpenAI answered 429"); });
    expect((await ask(failing)).status).toBe(502);
    expect((await ask(failing)).status).toBe(503);
    expect(failing.asked).toHaveLength(1);
    expect(failing.saved().translations).toBeUndefined();
  });

  it("keeps nothing of words that were changed while the AI worked", async () => {
    const a: ReturnType<typeof setup> = setup({}, async (words, _from, to) => {
      await change(a, { name: "Fjell" });
      return { made: Object.fromEntries(to.map((l) => [l, { title: words.title }])) };
    });
    const res = await ask(a);
    expect(res.body.translations).toEqual({});
    expect(a.saved()).toMatchObject({ name: "Fjell" });
    expect(a.saved().translations).toBeUndefined();
  });
});

describe("saving a picture that has translations", () => {
  const translations = { en: { name: "Forest" } };

  it("keeps them and the base language while the words are the same, whatever the page sends", async () => {
    const a = setup({ translations });
    expect((await change(a, { language: "de", translations: { en: { name: "Made up" } } })).status).toBe(200);
    expect(a.saved()).toMatchObject({ language: "nb", translations });
  });

  it("throws them away when the name or the description changes", async () => {
    const a = setup({ translations });
    await change(a, { name: "Fjell" });
    expect(a.saved().translations).toBeUndefined();
    const b = setup({ translations });
    await change(b, { description: "Noe nytt" });
    expect(b.saved().translations).toBeUndefined();
  });

  it("makes a new one with none, whatever the page sends", async () => {
    const a = setup();
    const { id: _id, createdAt: _at, ...input } = a.saved();
    const res = await request(a.app).post("/jigsaw/api/jigsaw").set("X-Jigsaw-User", "u1").send({ ...input, visibility: "owner", translations });
    expect(res.status).toBe(201);
    expect(a.saved().translations).toBeUndefined();
  });
});

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { FeedStore } from "../src/jigsaw/jigsaw-feed";
import { configuredTranslator, openAiTranslator, readTranslations, Translator } from "../src/jigsaw/translator";
import { FeedItemData, FeedItemInput, JIGSAW_LANGUAGES, UserLevel } from "../src/models";
import type { AiUsage, TokenUsageSpec } from "../src/models";
import { memoryUsers } from "./memory-plays";
import { AiFailed, AiUnavailable } from "../src/common/openai-chat";

// Publishers and admins write the information and the offers of the home page: their own (an admin any), with the words in the master language that the author writes and in the others that the AI makes
// when the tile is saved. The home page reads the collections and shows what is active. No test calls Firestore or OpenAI.

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;
const OTHERS = JIGSAW_LANGUAGES.map((l) => l.code).filter((c) => c !== "en");

/** a collection in memory, as the Firestore one is: the newest first, an id and the time of making given by the store */
function memoryFeed(): FeedStore & { all: Map<string, FeedItemData> } {
  const all = new Map<string, FeedItemData>();
  let n = 0;
  return {
    all,
    async list() {
      return [...all.values()].reverse();
    },
    async get(id) {
      return all.get(id) ?? null;
    },
    async add(input: FeedItemInput) {
      const id = `t${++n}`;
      const item = { ...input, id, createdAt: NOW } as FeedItemData;
      all.set(id, item);
      return item;
    },
    async update(id, input) {
      const before = all.get(id);
      if (!before) return null;
      const item = { ...input, id, createdAt: before.createdAt } as FeedItemData;
      all.set(id, item);
      return item;
    },
    async remove(id) {
      return all.delete(id);
    },
  };
}

const usage: AiUsage = { provider: "openai", model: "m", inputTokens: 10, outputTokens: 20, totalTokens: 30 };

/** a translator that answers with the language written after the words, and remembers what it was asked */
function fakeTranslator(mode: "ok" | "unavailable" | "failed" = "ok"): Translator & { asked: { from: string; to: readonly string[]; title: string }[] } {
  const asked: { from: string; to: readonly string[]; title: string }[] = [];
  return {
    asked,
    async translate(words, from, to) {
      asked.push({ from, to, title: words.title });
      if (mode === "unavailable") throw new AiUnavailable("OPENAI_API_KEY is not set.");
      if (mode === "failed") throw new AiFailed("OpenAI did not answer with JSON.", usage);
      return { made: Object.fromEntries(to.map((l) => [l, { title: `${words.title} ${l}`, ...(words.text ? { text: `${words.text} ${l}` } : {}), ...(words.label ? { label: `${words.label} ${l}` } : {}) }])), usage };
    },
  };
}

function setup(mode: "ok" | "unavailable" | "failed" = "ok") {
  const levels: Record<string, UserLevel> = { boss: "admin", pub: "publisher", pub2: "publisher", plain: "user" };
  const feedInfo = memoryFeed();
  const feedOffers = memoryFeed();
  const feedPackages = memoryFeed();
  const translator = fakeTranslator(mode);
  const kept: { userId: string; usage: Omit<TokenUsageSpec, "id"> }[] = [];
  const app = createJigsawApp({
    users: memoryUsers("boss", "pub", "pub2", "plain"),
    levels: { of: async (id) => levels[id ?? ""] ?? "user", forget() {} },
    feedInfo,
    feedOffers,
    feedPackages,
    packagePictures: { list: async () => [] },
    translator,
    tokenUsage: { add: async (userId, u) => (kept.push({ userId, usage: u }), { ...u, id: `u${kept.length}` }), list: async () => [] },
    now: () => NOW,
  });
  const call = (method: "get" | "post" | "put" | "delete", path: string, as?: string) => {
    const r = request(app)[method](`/jigsaw/api${path}`);
    if (as) r.set("X-Jigsaw-User", as);
    return r;
  };
  return { call, feedInfo, feedOffers, feedPackages, translator, kept };
}

const info = { masterLanguage: "en", title: "Welcome", text: "Press a picture.", visibility: "everyone" };
const offer = { masterLanguage: "en", title: "Autumn", text: "Ten pictures.", label: "-20 %", link: "https://example.com", visibility: "everyone" };

describe("who may write the tiles", () => {
  it("is a publisher or an admin: not an account that plays, not nobody", async () => {
    const { call } = setup();
    expect((await call("post", "/jigsaw-info", "plain").send(info)).status).toBe(403);
    expect((await call("post", "/jigsaw-info").send(info)).status).toBe(403);
    expect((await call("get", "/jigsaw-info", "plain")).status).toBe(403);
    expect((await call("post", "/jigsaw-info", "pub").send(info)).status).toBe(201);
    expect((await call("post", "/jigsaw-offers", "boss").send(offer)).status).toBe(201);
  });

  it("is the one who made a tile, and an admin: another publisher neither sees, changes nor deletes it", async () => {
    const { call } = setup();
    const id = (await call("post", "/jigsaw-info", "pub").send(info)).body.item.id as string;
    expect((await call("get", `/jigsaw-info/${id}`, "pub2")).status).toBe(403);
    expect((await call("put", `/jigsaw-info/${id}`, "pub2").send({ ...info, title: "Mine now" })).status).toBe(403);
    expect((await call("delete", `/jigsaw-info/${id}`, "pub2")).status).toBe(403);
    expect((await call("put", `/jigsaw-info/${id}`, "boss").send({ ...info, title: "By an admin" })).status).toBe(200);
    expect((await call("get", `/jigsaw-info/${id}`, "boss")).body.item.ownerUid).toBe("pub"); // the owner stays the one who made it
    expect((await call("delete", `/jigsaw-info/${id}`, "boss")).status).toBe(204);
    expect((await call("get", `/jigsaw-info/${id}`, "pub")).status).toBe(404);
  });
});

describe("adding a tile", () => {
  it("saves it with the owner who asks, and has the AI make the words of the other languages", async () => {
    const { call, translator, kept } = setup();
    const res = await call("post", "/jigsaw-info", "pub").send({ ...info, ownerUid: "someone-else", id: "hack" });
    expect(res.status).toBe(201);
    expect(res.body.translation).toBe("done");
    const item = res.body.item as FeedItemData;
    expect(item).toMatchObject({ kind: "info", masterLanguage: "en", ownerUid: "pub", createdAt: NOW, updatedAt: NOW });
    expect(item.id).not.toBe("hack");
    expect(item.texts).toHaveLength(JIGSAW_LANGUAGES.length);
    expect(item.texts.find((t) => t.language === "en")).toMatchObject({ title: "Welcome", by: "author" });
    expect(item.texts.find((t) => t.language === "nb")).toMatchObject({ title: "Welcome nb", text: "Press a picture. nb", by: "ai" });
    expect(translator.asked).toEqual([{ from: "en", to: OTHERS, title: "Welcome" }]);
    expect(kept).toHaveLength(1); // what the AI used is kept for the account that saved
    expect(kept[0]).toMatchObject({ userId: "pub", usage: { kind: "translate", status: "ok", feedId: item.id, applied: true } });
  });

  it("writes the master words in the language of the author, which is then not translated", async () => {
    const { call, translator } = setup();
    const res = await call("post", "/jigsaw-info", "pub").send({ masterLanguage: "nb", title: "Velkommen", text: "Trykk på et bilde." });
    expect((res.body.item as FeedItemData).texts.find((t) => t.language === "nb")?.by).toBe("author");
    expect(translator.asked[0].from).toBe("nb");
    expect(translator.asked[0].to).not.toContain("nb");
    expect(translator.asked[0].to).toContain("en");
  });

  it("refuses what is not right, and saves nothing", async () => {
    const { call, feedInfo, feedOffers, translator } = setup();
    expect((await call("post", "/jigsaw-info", "pub").send({ masterLanguage: "en", title: "No words" })).status).toBe(400);
    expect((await call("post", "/jigsaw-info", "pub").send({ ...info, masterLanguage: "xx" })).body.error).toMatch(/language/);
    expect((await call("post", "/jigsaw-offers", "pub").send({ ...offer, link: undefined })).body.error).toMatch(/leads somewhere/);
    expect((await call("post", "/jigsaw-offers", "pub").send({ ...offer, link: "http://example.com" })).body.error).toMatch(/https/);
    expect((await call("post", "/jigsaw-offers", "pub").send({ ...offer, label: undefined })).body.error).toMatch(/mark/);
    expect((await call("post", "/jigsaw-info", "pub").send({ ...info, from: 5 * DAY, to: 1 * DAY })).body.error).toMatch(/expires before/);
    expect(feedInfo.all.size + feedOffers.all.size).toBe(0);
    expect(translator.asked).toHaveLength(0);
  });

  it("keeps a tile with only the master words when the AI cannot be asked or fails, and says so", async () => {
    for (const mode of ["unavailable", "failed"] as const) {
      const { call, kept } = setup(mode);
      const res = await call("post", "/jigsaw-info", "pub").send(info);
      expect(res.status).toBe(201);
      expect(res.body.translation).toBe(mode);
      expect(res.body.item.texts).toHaveLength(1);
      expect(kept.length).toBe(mode === "failed" ? 1 : 0); // tokens spent on an answer that was no use are kept all the same
    }
  });
});

describe("changing a tile", () => {
  it("makes the other languages again when the master words change, but not when only the dates change", async () => {
    const { call, translator } = setup();
    const id = (await call("post", "/jigsaw-info", "pub").send(info)).body.item.id as string;
    expect(translator.asked).toHaveLength(1);
    const dates = await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, from: 90 * DAY, to: 120 * DAY });
    expect(dates.body.translation).toBe("none");
    expect(translator.asked).toHaveLength(1); // nothing to translate
    const words = await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, text: "Other words." });
    expect(words.body.translation).toBe("done");
    expect(translator.asked).toHaveLength(2);
    expect(translator.asked[1].to).toEqual(OTHERS);
    expect((words.body.item as FeedItemData).texts.find((t) => t.language === "sv")).toMatchObject({ text: "Other words. sv", by: "ai" });
    expect((words.body.item as FeedItemData).updatedAt).toBe(NOW);
  });

  it("never overwrites a language an author wrote, and makes a language that was missing when the AI was away", async () => {
    const { call, feedInfo, translator } = setup();
    const id = (await call("post", "/jigsaw-info", "pub").send(info)).body.item.id as string;
    const stored = feedInfo.all.get(id) as FeedItemData;
    feedInfo.all.set(id, { ...stored, texts: stored.texts.map((t) => (t.language === "sv" ? { ...t, title: "Mitt eget", by: "author" } : t)) }); // an author corrected the Swedish
    const res = await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, text: "Changed." });
    expect(translator.asked[1].to).not.toContain("sv");
    expect((res.body.item as FeedItemData).texts.find((t) => t.language === "sv")).toMatchObject({ title: "Mitt eget", by: "author" });
    // the AI was away at the first save: the next save makes what is missing
    const { call: call2, translator: t2 } = setup("unavailable");
    const id2 = (await call2("post", "/jigsaw-offers", "pub").send(offer)).body.item.id as string;
    expect(t2.asked).toHaveLength(1);
    expect((await call2("put", `/jigsaw-offers/${id2}`, "pub").send(offer)).body.translation).toBe("unavailable");
    expect(t2.asked).toHaveLength(2);
  });

  it("refuses what is not right and says there is no such tile", async () => {
    const { call } = setup();
    const id = (await call("post", "/jigsaw-info", "pub").send(info)).body.item.id as string;
    expect((await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, text: "" })).status).toBe(400);
    expect((await call("put", "/jigsaw-info/nothing", "pub").send(info)).status).toBe(404);
    expect((await call("delete", "/jigsaw-info/nothing", "pub")).status).toBe(404);
    expect((await call("get", "/jigsaw-info/nothing", "pub")).status).toBe(404);
  });
});

describe("the list of a collection", () => {
  it("is the tiles of the account (an admin: all), searched in any language, and filtered by status", async () => {
    const { call } = setup();
    await call("post", "/jigsaw-info", "pub").send({ ...info, title: "Welcome", text: "Press a picture." });
    await call("post", "/jigsaw-info", "pub").send({ ...info, title: "Old news", text: "Gone.", from: 10 * DAY, to: 20 * DAY });
    await call("post", "/jigsaw-info", "pub").send({ ...info, title: "Soon", text: "Later.", from: 150 * DAY });
    await call("post", "/jigsaw-info", "pub2").send({ ...info, title: "Not mine", text: "Words." });
    await call("post", "/jigsaw-offers", "pub").send(offer);
    const titles = async (path: string, as: string) => ((await call("get", path, as)).body.items as FeedItemData[]).map((i) => i.texts[0].title).sort();
    expect(await titles("/jigsaw-info", "pub")).toEqual(["Old news", "Soon", "Welcome"]); // not the other publisher's, not the offers
    expect(await titles("/jigsaw-info", "boss")).toEqual(["Not mine", "Old news", "Soon", "Welcome"]);
    expect(await titles("/jigsaw-info?status=active", "pub")).toEqual(["Welcome"]);
    expect(await titles("/jigsaw-info?status=expired", "pub")).toEqual(["Old news"]);
    expect(await titles("/jigsaw-info?status=upcoming", "pub")).toEqual(["Soon"]);
    expect(await titles("/jigsaw-info?search=picture", "pub")).toEqual(["Welcome"]);
    expect(await titles("/jigsaw-info?search=press%20nb", "pub")).toEqual(["Welcome"]); // the words of the other languages are searched too
    expect(await titles("/jigsaw-offers", "pub")).toEqual(["Autumn"]);
    expect((await call("get", "/jigsaw-info", "pub")).body.now).toBe(NOW);
  });
});

describe("GET /jigsaw-feed: what the home page shows of the tiles", () => {
  it("is the information and the offers that are active, with their words in every language", async () => {
    const { call } = setup();
    await call("post", "/jigsaw-info", "pub").send({ ...info, title: "Now" });
    await call("post", "/jigsaw-info", "pub").send({ ...info, title: "Over", to: 5 * DAY });
    await call("post", "/jigsaw-info", "pub").send({ ...info, title: "Later", from: 150 * DAY });
    await call("post", "/jigsaw-offers", "boss").send(offer);
    const res = await call("get", "/jigsaw-feed");
    expect(res.status).toBe(200);
    const items = res.body.items as FeedItemData[];
    expect(items.map((i) => `${i.kind}:${i.texts[0].title}`).sort()).toEqual(["info:Now", "offer:Autumn"]);
    expect(items.find((i) => i.kind === "offer")?.texts).toHaveLength(JIGSAW_LANGUAGES.length);
    expect(items.find((i) => i.kind === "offer")).toMatchObject({ link: "https://example.com" });
  });

  it("answers that it cannot when a collection cannot be read", async () => {
    const down: FeedStore = { ...memoryFeed(), list: async () => Promise.reject(new Error("down")) };
    const app = createJigsawApp({ feedInfo: down, feedOffers: memoryFeed(), feedPackages: memoryFeed(), packagePictures: { list: async () => [] }, now: () => NOW });
    expect((await request(app).get("/jigsaw/api/jigsaw-feed")).status).toBe(503);
  });
});

describe("who sees a tile: public, private or hidden", () => {
  it("is private to begin with, so its owner looks at it first; public is what none says", async () => {
    const { call } = setup();
    const made = async (extra: Record<string, unknown>) => (await call("post", "/jigsaw-info", "pub").send({ ...info, visibility: undefined, ...extra })).body.item as FeedItemData;
    expect((await made({})).visibility).toBe("owner"); // nothing said: private
    expect(await made({ visibility: "everyone" })).not.toHaveProperty("visibility"); // public is what none says
    expect((await made({ visibility: "hidden" })).visibility).toBe("hidden");
    expect((await call("post", "/jigsaw-info", "pub").send({ ...info, visibility: "nobody" })).body.error).toMatch(/public, private or hidden/);
  });

  it("is kept when a change says nothing, and changed when it does", async () => {
    const { call } = setup();
    const id = (await call("post", "/jigsaw-info", "pub").send({ ...info, visibility: "hidden" })).body.item.id as string;
    expect((await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, visibility: undefined, title: "Changed" })).body.item.visibility).toBe("hidden");
    expect((await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, visibility: "owner" })).body.item.visibility).toBe("owner");
    expect((await call("put", `/jigsaw-info/${id}`, "pub").send({ ...info, visibility: "everyone" })).body.item).not.toHaveProperty("visibility");
  });

  it("is on the home page for everybody when public, for its owner only when private, and for nobody when hidden", async () => {
    const { call } = setup();
    for (const [title, visibility] of [["Public", "everyone"], ["Private", "owner"], ["Hidden", "hidden"]]) await call("post", "/jigsaw-info", "pub").send({ ...info, title, visibility });
    await call("post", "/jigsaw-offers", "pub").send({ ...offer, title: "Private offer", visibility: "owner" });
    const seenBy = async (as?: string) => ((await call("get", "/jigsaw-feed", as)).body.items as FeedItemData[]).map((i) => i.texts[0].title).sort();
    expect(await seenBy("pub")).toEqual(["Private", "Private offer", "Public"]); // the owner checks how a private one looks (it carries a banner on the page)
    expect(await seenBy()).toEqual(["Public"]); // a visitor
    expect(await seenBy("pub2")).toEqual(["Public"]); // another publisher
    expect(await seenBy("boss")).toEqual(["Public"]); // even an admin: private is for the owner, to look at
    expect(await seenBy("plain")).toEqual(["Public"]);
  });
});

describe("the translator", () => {
  const words = { title: "Autumn", text: "Ten pictures.", label: "-20 %" };
  const answer = (translations: unknown) => ({ ok: true, status: 200, json: async () => ({ id: "r1", model: "m-1", usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }, choices: [{ message: { content: JSON.stringify({ translations }) } }] }) }) as unknown as Response;

  it("asks OpenAI for the languages and reads the words of each, and what it used", async () => {
    let sent: { url: string; body: { model: string; messages: { content: string }[]; response_format: { json_schema: { strict: boolean } } }; auth: string } | undefined;
    const fetchFn = (async (url: string, init: RequestInit) => {
      sent = { url, body: JSON.parse(init.body as string), auth: (init.headers as Record<string, string>).Authorization };
      return answer([{ language: "nb", title: "Høst", text: "Ti bilder.", label: "-20 %" }, { language: "sv", title: "Höst", text: "Tio bilder.", label: "-20 %" }]);
    }) as unknown as typeof fetch;
    const out = await openAiTranslator({ apiKey: "k", model: "m", detail: "low" }, fetchFn).translate(words, "en", ["nb", "sv"]);
    expect(out.made).toEqual({ nb: { title: "Høst", text: "Ti bilder.", label: "-20 %" }, sv: { title: "Höst", text: "Tio bilder.", label: "-20 %" } });
    expect(out.usage).toMatchObject({ inputTokens: 10, outputTokens: 20, totalTokens: 30 });
    expect(sent?.url).toMatch(/chat\/completions/);
    expect(sent?.auth).toBe("Bearer k");
    expect(sent?.body.model).toBe("m");
    expect(sent?.body.response_format.json_schema.strict).toBe(true);
    expect(sent?.body.messages[0].content).toMatch(/Norsk \(nb\), Svenska \(sv\)/);
    expect(JSON.parse(sent?.body.messages[1].content ?? "{}")).toEqual({ title: "Autumn", text: "Ten pictures.", label: "-20 %" });
  });

  it("leaves a field that the original had not empty, and cuts what is too long", () => {
    const read = readTranslations({ translations: [{ language: "nb", title: "x".repeat(200), text: "Ord", label: "Merke" }] }, { title: "T" }, ["nb"]);
    expect(read).toEqual({ made: { nb: { title: "x".repeat(80) } } });
  });

  it("fails with what it used when the answer cannot be used, and with nothing when the call fails", async () => {
    const asked = (f: unknown) => openAiTranslator({ apiKey: "k", model: "m", detail: "low" }, f as typeof fetch).translate(words, "en", ["nb", "sv"]);
    await expect(asked(async () => answer([{ language: "nb", title: "Høst", text: "x", label: "y" }]))).rejects.toMatchObject({ message: expect.stringMatching(/nothing in sv/), usage: { totalTokens: 30 } });
    await expect(asked(async () => answer([{ language: "nb", title: "", text: "x", label: "y" }, { language: "sv", title: "H", text: "x", label: "y" }]))).rejects.toThrow(/no title in nb/);
    await expect(asked(async () => ({ ok: true, json: async () => ({ usage: { total_tokens: 3 }, choices: [{ message: { refusal: "no" } }] }) }))).rejects.toBeInstanceOf(AiFailed);
    await expect(asked(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: "not json" } }] }) }))).rejects.toThrow(/JSON/);
    await expect(asked(async () => ({ ok: false, status: 401, json: async () => ({ error: { message: "bad key" } }) }))).rejects.toThrow(/401: bad key/);
  });

  it("cannot be used without its settings, and says what is missing", async () => {
    await expect(configuredTranslator({}).translate(words, "en", ["nb"])).rejects.toBeInstanceOf(AiUnavailable);
  });
});

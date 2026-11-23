import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { firestoreJigsawSearch, type JigsawSearchStore, type SearchCollectionLike } from "../src/jigsaw/jigsaw-search";
import { JigsawIndex, JigsawSearch, NO_OWNER, SEARCH_MAX_READ, SEARCH_MAX_TEXT, SEARCH_PAGE, SUMMARY_FIELDS } from "../src/models";
import type { JigsawQuery, JigsawSpec, JigsawSummary } from "../src/models";
import { memoryPlays, memoryUsers } from "./memory-plays";

/** a jigsaw of these pieces (a grid of 50, so 800 × 600 is 16 × 12 = 192 pieces) */
const jigsaw = (id: string, over: Partial<JigsawSpec> = {}): JigsawSpec => ({ id, name: id, width: 800, height: 600, gridSize: 50, gridVisible: false, placed: [], createdAt: 1, ...over });
const summary = (j: JigsawSpec): JigsawSummary => JigsawIndex.summaryOf(j.id, j as unknown as Record<string, unknown>);
const query = (over: Partial<JigsawQuery> = {}): JigsawQuery => ({ sort: "new", limit: 36, page: 1, ...over });
const ids = (list: { id: string }[]) => list.map((j) => j.id);

describe("what a jigsaw is matched by", () => {
  it("is the difficulty of its snap range, nearest of the three, and the default when it says nothing", () => {
    expect(JigsawIndex.levelOf(10)).toBe("hard");
    expect(JigsawIndex.levelOf(25)).toBe("medium");
    expect(JigsawIndex.levelOf(40)).toBe("easy");
    expect(JigsawIndex.levelOf(18)).toBe("medium"); // nearest
    expect(JigsawIndex.levelOf(0)).toBe("hard");
    expect(JigsawIndex.levelOf(undefined)).toBe("medium"); // the default
  });

  it("is the size class of the number of pieces: up to 48, 150, 352, and more", () => {
    expect([1, 48, 49, 150, 151, 352, 353, 1000].map(JigsawIndex.sizeClassOf)).toEqual(["small", "small", "medium", "medium", "large", "large", "huge", "huge"]);
  });

  it("is the categories and the category of each sub-category, once each", () => {
    expect(JigsawIndex.tagsOf(["nature/forest", "family"])).toEqual(["family", "nature", "nature/forest"]);
    expect(JigsawIndex.tagsOf(["nature", "nature/forest"])).toEqual(["nature", "nature/forest"]);
    expect(JigsawIndex.tagsOf(undefined)).toEqual([]);
  });

  it("is worked out from the jigsaw: its difficulty, size, tags and language (nothing of it is kept in the document)", () => {
    expect(JigsawIndex.of(jigsaw("a", { snapPercent: 40, categories: ["nature/forest"] }))).toEqual({ tags: ["nature", "nature/forest"], level: "easy", sizeClass: "large", language: "en" });
    expect(JigsawIndex.of(jigsaw("b", { width: 200, height: 100 }))).toEqual({ level: "medium", sizeClass: "small", language: "en" }); // no tags when it is in no category
    expect(JigsawIndex.of(jigsaw("c", { language: "nb" })).language).toBe("nb");
  });

  it("is a summary of a stored document without the pieces, the objects and the details of the picture", () => {
    const doc = { name: "x", width: 800, height: 600, gridSize: 50, placed: [], description: "long", pictureName: "a.jpg", lineColor: "#ff0000", categories: ["art"], createdAt: 5, tags: ["art"], listed: true };
    const s = JigsawIndex.summaryOf("id1", doc) as unknown as Record<string, unknown>;
    expect(s).toMatchObject({ id: "id1", name: "x", categories: ["art"], createdAt: 5 });
    for (const left of ["placed", "pictureName", "lineColor", "tags", "listed"]) expect(left in s).toBe(false);
    expect(s.description).toBe("long"); // read, so that words in it can be looked for
  });
});

describe("the parameters of a search", () => {
  const ok = (raw: Record<string, unknown>) => (JigsawSearch.parse(raw) as { query: JigsawQuery }).query;
  const bad = (raw: Record<string, unknown>) => (JigsawSearch.parse(raw) as { error: string }).error;

  it("have a default: the newest, one page", () => {
    expect(ok({})).toEqual({ sort: "new", limit: SEARCH_PAGE, page: 1 });
    expect(ok({ favorites: "true" })).toMatchObject({ favorites: true });
    expect(ok({ favorites: "1" })).toMatchObject({ favorites: true });
    expect("favorites" in ok({})).toBe(false);
    expect(ok({ languages: "nb,en", sizes: "small" })).toMatchObject({ languages: ["nb", "en"], sizes: ["small"] });
    expect(ok({ categories: "", sizes: "", text: "  " })).toEqual({ sort: "new", limit: SEARCH_PAGE, page: 1 }); // an empty field says nothing
  });

  it("are read when they are right: lists written with commas, and a text", () => {
    expect(ok({ categories: "nature,nature/forest", sizes: "large,huge", difficulties: "easy", owners: "u1,u2", text: "  the   harbour ", sort: "pieces", limit: "10", page: "2" })).toEqual({
      categories: ["nature", "nature/forest"], sizes: ["large", "huge"], difficulties: ["easy"], owners: ["u1", "u2"], text: "the harbour", sort: "pieces", limit: 10, page: 2,
    });
  });

  it("are refused when they are not a category, a size, a difficulty, a user, a text of the right length, a sort or a whole number", () => {
    expect(bad({ categories: "nature,boats" })).toMatch(/"boats" is not allowed in categories/);
    expect(bad({ categories: "family,travel,nature,animals,flowers,food,art" })).toMatch(/At most 6/);
    expect(bad({ sizes: "small,tiny" })).toMatch(/"tiny" is not allowed in sizes/);
    expect(bad({ languages: "nb,xx" })).toMatch(/"xx" is not allowed in languages/);
    expect(bad({ favorites: "yes" })).toMatch(/favorites must be true/);
    expect(bad({ difficulties: "insane" })).toMatch(/is not allowed in difficulties/);
    expect(bad({ owners: "u1,a/b" })).toMatch(/is not allowed in owners/);
    expect(bad({ owners: "u1,~other" })).toMatch(/is not allowed in owners/);
    expect(ok({ owners: "u1,~none" })).toMatchObject({ owners: ["u1", "~none"] }); // "no owner" is one that can be asked for
    expect(bad({ owners: "u1,,u2" })).toMatch(/is not allowed in owners/);
    expect(bad({ owners: Array.from({ length: 11 }, (_, i) => `u${i}`).join(",") })).toMatch(/At most 10/);
    expect(ok({ owners: "u1,u1", sizes: "small,small" })).toMatchObject({ owners: ["u1"], sizes: ["small"] }); // once each
    expect(bad({ text: "x".repeat(SEARCH_MAX_TEXT + 1) })).toMatch(/text can be at most/);
    expect(bad({ sort: "random" })).toMatch(/sort must be/);
    expect(bad({ limit: "0" })).toMatch(/limit must be/);
    expect(bad({ limit: "101" })).toMatch(/limit must be/);
    expect(bad({ page: "1.5" })).toMatch(/page must be/);
    expect(bad({ sizes: ["small", "large"] })).toMatch(/must be text/);
  });

});

describe("matching and paging what came back", () => {
  const items = [
    summary(jigsaw("old-big", { createdAt: 1, name: "Zebra", categories: ["animals"], snapPercent: 10, width: 1000, height: 800 })),
    summary(jigsaw("mid", { createdAt: 2, name: "Apple", categories: ["nature/forest", "family"], ownerUid: "u1" })),
    summary(jigsaw("new-small", { createdAt: 3, name: "Mango", width: 200, height: 150, snapPercent: 40, ownerUid: "u2" })),
  ];
  const withNorwegian = [...items, summary(jigsaw("lang-nb", { createdAt: 4, name: "Fjord", language: "nb" }))];

  it("matches any of each list, and every list together: categories, sizes, difficulties and owners", () => {
    const found = (q: Partial<JigsawQuery>) => ids(items.filter((j) => JigsawSearch.matches(j, query(q))));
    expect(found({})).toEqual(["old-big", "mid", "new-small"]);
    expect(found({ categories: ["nature"] })).toEqual(["mid"]); // a category is every jigsaw in it, also in a sub-category
    expect(found({ categories: ["nature/forest"] })).toEqual(["mid"]);
    expect(found({ categories: ["nature/mountains"] })).toEqual([]);
    expect(found({ categories: ["animals", "family"] })).toEqual(["old-big", "mid"]); // any of them
    expect(found({ sizes: ["small"] })).toEqual(["new-small"]);
    expect(found({ sizes: ["small", "large"] })).toEqual(["old-big", "mid", "new-small"]);
    expect(found({ difficulties: ["hard"] })).toEqual(["old-big"]);
    expect(found({ difficulties: ["hard", "easy"] })).toEqual(["old-big", "new-small"]);
    const inLanguages = (languages: string[]) => ids(withNorwegian.filter((j) => JigsawSearch.matches(j, query({ languages }))));
    expect(inLanguages(["en"])).toEqual(["old-big", "mid", "new-small"]); // a jigsaw that says nothing is English
    expect(inLanguages(["nb"])).toEqual(["lang-nb"]);
    expect(inLanguages(["nb", "en"])).toEqual(["old-big", "mid", "new-small", "lang-nb"]); // any of them
    expect(inLanguages(["sv"])).toEqual([]);
    expect(found({ owners: ["u2"] })).toEqual(["new-small"]);
    expect(found({ owners: ["u1", "u2"] })).toEqual(["mid", "new-small"]);
    expect(found({ categories: ["family"], difficulties: ["medium"], owners: ["u1"] })).toEqual(["mid"]); // every list
    expect(found({ categories: ["family"], owners: ["u2"] })).toEqual([]);
    expect(found({ owners: [NO_OWNER] })).toEqual(["old-big"]); // no owner: from before owners
  });

  it("matches words of the name, the author or the description, in any order and case, a part of a word being enough, and every word having to be there", () => {
    const named = [summary(jigsaw("a", { name: "Harbour at dawn", author: "Karin Auke", description: "Taken on a cold morning" })), summary(jigsaw("b", { name: "Mountain", author: "Leif" }))];
    const found = (text: string) => ids(named.filter((j) => JigsawSearch.matches(j, query({ text }))));
    expect(found("harbour")).toEqual(["a"]);
    expect(found("DAWN HARB")).toEqual(["a"]); // any order, any case, a part of a word
    expect(found("karin")).toEqual(["a"]); // the author
    expect(found("mount leif")).toEqual(["b"]);
    expect(found("harbour leif")).toEqual([]); // every word
    expect(found("cold morning")).toEqual(["a"]); // the description
    expect(found("morn mountain")).toEqual([]); // the words of different jigsaws
    expect(found("")).toEqual(["a", "b"]);
    expect(JigsawSearch.hasWords({ name: "x" }, undefined)).toBe(true);
  });

  it("puts them in order, and gives a page with how many there are in all", () => {
    expect(ids(JigsawSearch.page(items, query()).items)).toEqual(["new-small", "mid", "old-big"]); // the newest first
    expect(ids(JigsawSearch.page(items, query({ sort: "name" })).items)).toEqual(["mid", "new-small", "old-big"]);
    expect(ids(JigsawSearch.page(items, query({ sort: "pieces" })).items)).toEqual(["new-small", "mid", "old-big"]); // the fewest pieces first
    const first = JigsawSearch.page(items, query({ limit: 2 }));
    expect([ids(first.items), first.total, first.hasMore]).toEqual([["new-small", "mid"], 3, true]);
    const second = JigsawSearch.page(items, query({ limit: 2, page: 2 }));
    expect([ids(second.items), second.total, second.hasMore]).toEqual([["old-big"], 3, false]);
    expect(JigsawSearch.page(items, query({ page: 9 })).items).toEqual([]);
  });
});

describe("the counts of a filter", () => {
  const items = [
    summary(jigsaw("a", { author: "Karin", ownerUid: "u1", categories: ["nature/forest"], snapPercent: 10, language: "nb" })),
    summary(jigsaw("b", { author: "Karin", ownerUid: "u1", categories: ["nature"], snapPercent: 40 })),
    summary(jigsaw("c", { author: "Leif", ownerUid: "u2", categories: ["family"], width: 200, height: 150 })),
  ];

  it("counts each choice over everything, and what matches, when nothing is chosen", () => {
    const f = JigsawSearch.facets(items, query());
    expect(f.total).toBe(3);
    expect(f.categories).toEqual({ nature: 2, "nature/forest": 1, family: 1 }); // a category counts its sub-categories
    expect(f.sizes).toEqual({ large: 2, small: 1 });
    expect(f.difficulties).toEqual({ hard: 1, easy: 1, medium: 1 });
    expect(f.languages).toEqual({ nb: 1, en: 2 });
    expect(f.owners).toEqual([{ id: "u1", name: "Karin", count: 2 }, { id: "u2", name: "Leif", count: 1 }]);
    // everything adds up: the sizes, the difficulties, the languages and the owners (those with no owner too) each come to all the jigsaws
    const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a, b) => a + b, 0);
    expect([sum(f.sizes), sum(f.difficulties), sum(f.languages), f.owners.reduce((a, o) => a + o.count, 0)]).toEqual([f.total, f.total, f.total, f.total]);
    const withNone = JigsawSearch.facets([...items, summary(jigsaw("old", { createdAt: 0 }))], query());
    expect(withNone.owners.at(-1)).toEqual({ id: NO_OWNER, name: "", count: 1 }); // from before owners: counted, last
    expect(withNone.owners.reduce((a, o) => a + o.count, 0)).toBe(withNone.total);
  });

  it("counts a list with the rest of the filter kept and that list left out, so a tick shows what ticking one more gives", () => {
    const f = JigsawSearch.facets(items, query({ categories: ["nature"], owners: ["u1"] }));
    expect(f.total).toBe(2);
    expect(f.categories).toEqual({ nature: 2, "nature/forest": 1 }); // owner kept, category left out: u1's jigsaws
    expect(f.owners).toEqual([{ id: "u1", name: "Karin", count: 2 }]); // category kept, owner left out: only Karin's are in nature
    expect(f.sizes).toEqual({ large: 2 }); // both lists kept
  });

  it("keeps the text in every count, and has nothing for a choice that no jigsaw has", () => {
    const f = JigsawSearch.facets(items, query({ text: "karin" }));
    expect(f.total).toBe(2);
    expect(f.owners).toEqual([{ id: "u1", name: "Karin", count: 2 }]);
    expect("family" in f.categories).toBe(false);
    expect(JigsawSearch.facets([], query())).toEqual({ total: 0, categories: {}, sizes: {}, difficulties: {}, motives: {}, languages: {}, owners: [] });
  });
});

describe("the search in Firestore", () => {
  type Ask = { kind: "newest" | "owner"; owner?: string; limit: number; select: string[] };
  /** a fake collection that remembers what it was asked, and answers when the test lets it (so that the questions can be seen to be in flight at the same time) */
  function fakeCollection(answers: Record<string, { id: string; data(): unknown }[]>) {
    const asked: Ask[] = [];
    const waiting: (() => void)[] = [];
    let held = false;
    const answer = (key: string) => ({ docs: answers[key] ?? [] });
    const ask = (kind: Ask["kind"], owner?: string) => ({
      limit: (limit: number) => ({
        select: (...select: string[]) => ({
          get: () => {
            asked.push({ kind, owner, limit, select });
            const key = owner ?? "newest";
            return held ? new Promise<ReturnType<typeof answer>>((resolve) => waiting.push(() => resolve(answer(key)))) : Promise.resolve(answer(key));
          },
        }),
      }),
    });
    const collection: SearchCollectionLike & { filters: string[] } = {
      filters: [],
      orderBy: (field, direction) => {
        collection.filters.push(`orderBy ${field} ${direction}`);
        return ask("newest");
      },
      where: (field, op, value) => {
        collection.filters.push(`where ${field} ${op} ${value}`);
        return ask("owner", value);
      },
    };
    return { collection, asked, waiting, hold: () => (held = true), release: () => waiting.splice(0).forEach((r) => r()) };
  }
  const doc = (id: string, createdAt: number, over: object = {}) => ({ id, data: () => ({ name: id, width: 800, height: 600, gridSize: 50, createdAt, ...over }) });

  it("asks for the newest and for each owner's, only the fields of a summary, each with the limit, and gives the summaries each once, the newest first", async () => {
    const { collection, asked } = fakeCollection({ newest: [doc("b", 3), doc("a", 2)], u1: [doc("a", 2), doc("old", 1)], u2: [doc("c", 5, { ownerUid: "u2" })] });
    const found = await firestoreJigsawSearch("jigsaw", () => collection).load(["u1", "u2"], 500);
    expect(found.map((j) => j.id)).toEqual(["c", "b", "a", "old"]); // a is in two answers and is there once
    expect(asked.map((a) => [a.kind, a.owner ?? "", a.limit])).toEqual([["newest", "", 500], ["owner", "u1", 500], ["owner", "u2", 500]]);
    for (const a of asked) {
      expect(a.select).toEqual([...SUMMARY_FIELDS]);
      expect(a.select).not.toContain("placed");
    }
    // an order only on its own, and an equality only on its own: neither needs a composite index
    expect(collection.filters).toEqual(["orderBy createdAt desc", "where ownerUid == u1", "where ownerUid == u2"]);
    expect(found.find((j) => j.id === "c")).toMatchObject({ ownerUid: "u2", createdAt: 5 });
  });

  it("makes all the questions before any is answered: in parallel", async () => {
    const { collection, waiting, hold, release } = fakeCollection({ newest: [doc("a", 1)] });
    hold();
    const loading = firestoreJigsawSearch("jigsaw", () => collection).load(["u1", "u2", "u3"], 500);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(waiting).toHaveLength(4); // the newest, and the three owners: all asked, none answered yet
    release();
    expect((await loading).map((j) => j.id)).toEqual(["a"]);
  });

  it("keeps what it read for a few seconds, reads again after that or when told to forget, and does not keep a read that failed", async () => {
    let time = 1000;
    const { collection, asked } = fakeCollection({ newest: [doc("a", 1)] });
    const search = firestoreJigsawSearch("jigsaw", () => collection, () => time);
    await search.load(["u1"], 500);
    await search.load(["u1"], 500);
    expect(asked).toHaveLength(2); // the newest and u1: once
    await search.load(["u2"], 500); // other owners: another read
    expect(asked).toHaveLength(4);
    time += 11_000;
    await search.load(["u1"], 500);
    expect(asked).toHaveLength(6); // a few seconds later: read again
    await search.load(["u1"], 500);
    expect(asked).toHaveLength(6);
    search.forget();
    await search.load(["u1"], 500);
    expect(asked).toHaveLength(8);
    let failing = true;
    const broken: SearchCollectionLike = {
      orderBy: () => ({ limit: () => ({ select: () => ({ get: () => (failing ? Promise.reject(new Error("down")) : Promise.resolve({ docs: [] })) }) }) }),
      where: () => ({ limit: () => ({ select: () => ({ get: () => Promise.resolve({ docs: [] }) }) }) }),
    };
    const unlucky = firestoreJigsawSearch("jigsaw", () => broken, () => time);
    await expect(unlucky.load([], 500)).rejects.toThrow("down");
    failing = false;
    await expect(unlucky.load([], 500)).resolves.toEqual([]);
  });
});

describe("the route", () => {
  /** the search store of a small fake: what Firestore gives (the newest, and the jigsaws of each owner, each once, the newest first, at most the limit of each) */
  function fakeSearch(all: JigsawSpec[], calls: { owners: string[]; limit: number }[] = [], forgot: number[] = []): JigsawSearchStore {
    return {
      async load(owners, limit) {
        calls.push({ owners: [...owners], limit });
        const newest = (list: JigsawSpec[]) => [...list].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
        const found = new Map<string, JigsawSpec>();
        for (const j of [...newest(all), ...owners.flatMap((o) => newest(all.filter((x) => x.ownerUid === o)))]) found.set(j.id, j);
        return [...found.values()].sort((a, b) => b.createdAt - a.createdAt).map(summary);
      },
      forget() {
        forgot.push(1);
      },
    };
  }
  const get = (app: ReturnType<typeof createJigsawApp>, qs: string, me?: string) => {
    const r = request(app).get(`/jigsaw/api/jigsaw-search${qs}`);
    return me ? r.set("X-Jigsaw-User", me) : r;
  };
  const all = [
    jigsaw("forest", { createdAt: 3, categories: ["nature/forest"], ownerUid: "u1", snapPercent: 10 }),
    jigsaw("family", { createdAt: 2, categories: ["family"], ownerUid: "u2", width: 200, height: 150 }),
    jigsaw("secret", { createdAt: 4, categories: ["nature"], ownerUid: "u1", visibility: "owner" }),
  ];

  it("finds by category, sub-category, size, difficulty and owner, and says how many", async () => {
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all), plays: memoryPlays(), users: memoryUsers() });
    const body = async (qs: string, me?: string) => (await get(app, qs, me)).body as { items: JigsawSummary[]; total: number; hasMore: boolean };
    expect(ids((await body("")).items)).toEqual(["forest", "family"]);
    expect(ids((await body("?categories=nature")).items)).toEqual(["forest"]);
    expect(ids((await body("?categories=nature/forest")).items)).toEqual(["forest"]);
    expect(ids((await body("?categories=nature,family")).items)).toEqual(["forest", "family"]); // a list of more than one is looked at on what came back
    expect(ids((await body("?sizes=small")).items)).toEqual(["family"]);
    expect(ids((await body("?sizes=small,large")).items)).toEqual(["forest", "family"]);
    expect(ids((await body("?difficulties=hard")).items)).toEqual(["forest"]);
    expect(ids((await body("?text=FOR")).items)).toEqual(["forest"]);
    expect(ids((await body("?owners=u2")).items)).toEqual(["family"]);
    expect(ids((await body("?owners=u1,u2")).items)).toEqual(["forest", "family"]);
    expect(ids((await body("?categories=nature&difficulties=hard&owners=u1,u3")).items)).toEqual(["forest"]);
    expect(ids((await body("?sort=name")).items)).toEqual(["family", "forest"]);
    const paged = await body("?limit=1");
    expect([ids(paged.items), paged.total, paged.hasMore]).toEqual([["forest"], 2, true]);
  });

  it("never finds a hidden jigsaw: not even for its owner (it is only in the list of the owner's own jigsaws)", async () => {
    const some = [jigsaw("open", { createdAt: 2, ownerUid: "u1" }), jigsaw("tucked", { createdAt: 3, ownerUid: "u1", visibility: "hidden" })];
    const app = createJigsawApp({ jigsawSearch: fakeSearch(some), plays: memoryPlays(), users: memoryUsers() });
    expect(ids((await get(app, "", "u1")).body.items)).toEqual(["open"]);
    expect(ids((await get(app, "?owners=u1", "u1")).body.items)).toEqual(["open"]);
    expect(ids((await get(app, "")).body.items)).toEqual(["open"]);
  });

  it("finds words in the description, and does not send the description on", async () => {
    const some = [jigsaw("harbour", { createdAt: 2, description: "A cold morning at the pier" }), jigsaw("other", { createdAt: 1 })];
    const res = await get(createJigsawApp({ jigsawSearch: fakeSearch(some), plays: memoryPlays(), users: memoryUsers() }), "?text=pier");
    expect(ids(res.body.items)).toEqual(["harbour"]);
    expect("description" in res.body.items[0]).toBe(false);
  });

  it("gives the summary of a jigsaw: never its objects", async () => {
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all), plays: memoryPlays(), users: memoryUsers() });
    const res = await get(app, "?categories=nature");
    expect(res.body.items[0]).toMatchObject({ id: "forest", name: "forest", categories: ["nature/forest"] });
    expect("placed" in res.body.items[0]).toBe(false);
  });

  it("counts the jigsaws for each choice of the filter, with the rest of the filter kept, and says who made them", async () => {
    const some = [
      jigsaw("a", { ownerUid: "u2", author: "Zoe", categories: ["nature/forest"], language: "nb" }),
      jigsaw("b", { ownerUid: "u1", author: "Ann", categories: ["family"] }),
      jigsaw("c", { ownerUid: "u2", author: "Zoe", width: 200, height: 150, snapPercent: 10 }),
      jigsaw("d"),
      jigsaw("e", { ownerUid: "u3", author: "Hidden", visibility: "owner", language: "sv" }),
    ];
    const app = createJigsawApp({ jigsawSearch: fakeSearch(some), plays: memoryPlays(), users: memoryUsers() });
    const all = (await get(app, "/facets")).body;
    expect(all.total).toBe(4); // not the private one
    expect(all.categories).toEqual({ nature: 1, "nature/forest": 1, family: 1 });
    expect(all.sizes).toEqual({ large: 3, small: 1 });
    expect(all.languages).toEqual({ nb: 1, en: 3 }); // only the languages there are, and a jigsaw that says nothing is English
    expect(all.owners).toEqual([{ id: "u1", name: "Ann", count: 1 }, { id: "u2", name: "Zoe", count: 2 }, { id: "~none", name: "", count: 1 }]); // the one with no owner is counted, last; not the private one
    const sum = (counts: Record<string, number>) => Object.values(counts).reduce((a: number, b: number) => a + b, 0);
    expect([sum(all.sizes), sum(all.difficulties), sum(all.languages), all.owners.reduce((a: number, o: { count: number }) => a + o.count, 0)]).toEqual([4, 4, 4, 4]); // each adds up to all
    // with the rest kept and the list itself not: an owner ticked does not take the other owners away
    const zoe = (await get(app, "/facets?owners=u2")).body;
    expect(zoe.total).toBe(2);
    expect(zoe.owners.map((o: { id: string }) => o.id)).toEqual(["u1", "u2", "~none"]);
    expect(zoe.categories).toEqual({ nature: 1, "nature/forest": 1 }); // the categories of Zoe's jigsaws
    expect(zoe.languages).toEqual({ nb: 1, en: 1 });
    const nb = (await get(app, "/facets?languages=nb")).body;
    expect([nb.total, nb.languages]).toEqual([1, { nb: 1, en: 3 }]);
    expect((await get(app, "/facets?sizes=tiny")).status).toBe(400);
    expect((await get(app, "/facets", "u3")).body.total).toBe(5); // the private one is seen by its owner
  });

  it("refuses what is not a search, with the reason", async () => {
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all), plays: memoryPlays(), users: memoryUsers() });
    const res = await get(app, "?sizes=tiny");
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not allowed in sizes/);
  });

  it("shows a jigsaw only its owner sees to its owner, and to nobody who does not say who they are", async () => {
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all), plays: memoryPlays(), users: memoryUsers() });
    const seen = async (me?: string) => ids((await get(app, "?sort=name", me)).body.items);
    expect(await seen()).toEqual(["family", "forest"]);
    expect(await seen("u2")).toEqual(["family", "forest"]); // not the owner, and no round on it
    expect(await seen("u1")).toEqual(["family", "forest", "secret"]);
  });

  it("reads once for each question, with the limit, the newest and each user's: what is found and what is counted are the same jigsaws", async () => {
    const calls: { owners: string[]; limit: number }[] = [];
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all, calls), plays: memoryPlays(), users: memoryUsers("u1", "u2") });
    await get(app, "?categories=nature");
    await get(app, "/facets?categories=nature", "u1");
    expect(calls).toEqual([{ owners: ["u1", "u2"], limit: SEARCH_MAX_READ }, { owners: ["u1", "u2"], limit: SEARCH_MAX_READ }]); // the users are the owners
  });

  it("reads up to the limit of each owner's jigsaws, and of the newest: an owner with few jigsaws is read whole even when they are old", async () => {
    const many = [
      ...Array.from({ length: SEARCH_MAX_READ + 20 }, (_, i) => jigsaw(`a${i}`, { createdAt: 1000 + i, ownerUid: "ua" })),
      ...Array.from({ length: 10 }, (_, i) => jigsaw(`b${i}`, { createdAt: 1 + i, ownerUid: "ub" })), // all older than every jigsaw of ua
    ];
    const big = createJigsawApp({ jigsawSearch: fakeSearch(many), plays: memoryPlays(), users: memoryUsers("ua", "ub") });
    const found = (await get(big, "?limit=100")).body;
    expect(found.total).toBe(SEARCH_MAX_READ + 10); // 500 of ua (the newest) and the 10 of ub, which the newest 500 overall would not have
    const facets = (await get(big, "/facets")).body;
    expect(facets.total).toBe(SEARCH_MAX_READ + 10);
    expect(facets.owners.map((o: { count: number }) => o.count).sort((x: number, y: number) => x - y)).toEqual([10, SEARCH_MAX_READ]);
    expect((await get(big, "?owners=ub")).body.total).toBe(10);
  });

  it("looks only at the favorites of the user who asks, in the search and in the counts, and at none for nobody", async () => {
    const favorites = { list: async (u: string) => (u === "u1" ? ["forest", "secret"] : []), add: async () => undefined, remove: async () => undefined, removeAllOf: async () => undefined };
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all), favorites, plays: memoryPlays(), users: memoryUsers("u1", "u2") });
    const found = async (qs: string, me?: string) => ids((await get(app, qs, me)).body.items);
    expect(await found("?favorites=true", "u1")).toEqual(["secret", "forest"]); // their own private jigsaw too: they may see it
    expect(await found("?favorites=true&categories=nature", "u1")).toEqual(["secret", "forest"]); // with the rest of the filter
    expect(await found("?favorites=true&categories=family", "u1")).toEqual([]);
    expect(await found("?favorites=true", "u2")).toEqual([]); // u2 has none
    expect(await found("?favorites=true")).toEqual([]); // nobody: none
    expect(await found("", "u2")).toEqual(["forest", "family"]); // without it, all the user may see
    const facets = (await get(app, "/facets?favorites=true", "u1")).body;
    expect([facets.total, facets.sizes]).toEqual([2, { large: 2 }]); // the counts are over the favorites
  });

  it("looks only at the jigsaws the user who asks has solved, in the search and in the counts, and at none for nobody", async () => {
    const plays = memoryPlays();
    const round = (userId: string, status: "solved" | "active") => ({ jigsawId: "x", userId, userName: userId, status, startedAt: 1, matched: 0, total: 1, overrides: {} }) as never;
    await plays.create("forest", round("u1", "solved"), {});
    await plays.create("family", round("u1", "active"), {}); // not solved yet
    await plays.create("forest", round("u2", "active"), {});
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all), plays, users: memoryUsers("u1", "u2") });
    const found = async (qs: string, me?: string) => ids((await get(app, qs, me)).body.items);
    expect(await found("?solved=true", "u1")).toEqual(["forest"]);
    expect(await found("?solved=true&categories=family", "u1")).toEqual([]); // with the rest of the filter
    expect(await found("?solved=true", "u2")).toEqual([]); // u2 has solved none
    expect(await found("?solved=true")).toEqual([]); // nobody: none
    expect((await get(app, "/facets?solved=true", "u1")).body.total).toBe(1);
    expect((await get(app, "?solved=maybe", "u1")).status).toBe(400);
  });

  it("makes the search forget what it read when a jigsaw is made, changed or deleted", async () => {
    const forgot: number[] = [];
    const users = memoryUsers("u1");
    const app = createJigsawApp({ jigsawSearch: fakeSearch(all, [], forgot), plays: memoryPlays(), users, jigsaw: { list: async () => [], add: async (i) => ({ id: "n", ...i, createdAt: 1 }) as JigsawSpec, update: async (id, i) => ({ id, ...i, createdAt: 1 }) as JigsawSpec, remove: async () => true } });
    const body = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [] };
    await request(app).post("/jigsaw/api/jigsaw").send(body);
    await request(app).put("/jigsaw/api/jigsaw/n").send(body);
    await request(app).delete("/jigsaw/api/jigsaw/n");
    expect(forgot.length).toBeGreaterThanOrEqual(3);
  });
});

describe("the jigsaws of one user, a page at a time", () => {
  const mine = [
    summary(jigsaw("a", { createdAt: 1, name: "Harbour", ownerUid: "u1" })),
    summary(jigsaw("b", { createdAt: 2, name: "Forest path", ownerUid: "u1", visibility: "owner" })),
    summary(jigsaw("c", { createdAt: 3, name: "Harbour at night", ownerUid: "u1", visibility: "hidden", width: 200, height: 150 })),
    summary(jigsaw("d", { createdAt: 4, name: "Apple", ownerUid: "u1" })),
  ];
  const q = (over: Record<string, unknown> = {}) => ({ text: undefined, sort: "new" as const, limit: 2, page: 1, ...over });

  it("gives a page of them, with how many there are in all, and counts of who sees them", () => {
    const first = JigsawSearch.mine(mine, q());
    expect(ids(first.items)).toEqual(["d", "c"]);
    expect([first.total, first.hasMore]).toEqual([4, true]);
    expect(first.counts).toEqual({ all: 4, everyone: 2, owner: 1, hidden: 1 }); // the hidden and the private ones are in it: they are the user's own
    expect(ids(JigsawSearch.mine(mine, q({ page: 2 })).items)).toEqual(["b", "a"]);
    expect(JigsawSearch.mine(mine, q({ page: 2 })).hasMore).toBe(false);
  });

  it("looks for words, and the counts follow the words but not the choice of who sees them", () => {
    const found = JigsawSearch.mine(mine, q({ text: "harbour", limit: 10 }));
    expect(ids(found.items)).toEqual(["c", "a"]);
    expect(found.counts).toEqual({ all: 2, everyone: 1, owner: 0, hidden: 1 });
    const hiddenOnly = JigsawSearch.mine(mine, q({ text: "harbour", limit: 10 }), "hidden");
    expect(ids(hiddenOnly.items)).toEqual(["c"]);
    expect(hiddenOnly.counts).toEqual(found.counts); // so the buttons still say what the other choices would give
    expect(ids(JigsawSearch.mine(mine, q({ limit: 10 }), "everyone").items)).toEqual(["d", "a"]);
  });

  it("puts them in the order asked for: newest, oldest, name, fewest pieces, most pieces", () => {
    const order = (sort: string) => ids(JigsawSearch.mine(mine, q({ sort, limit: 10 })).items);
    expect(order("new")).toEqual(["d", "c", "b", "a"]);
    expect(order("old")).toEqual(["a", "b", "c", "d"]);
    expect(order("name")).toEqual(["d", "b", "a", "c"]); // Apple, Forest path, Harbour, Harbour at night
    expect(order("pieces")[0]).toBe("c"); // the small one first
    expect(order("most")[3]).toBe("c");
  });
});

describe("the route of one user's jigsaws", () => {
  function store(list: JigsawSpec[]): JigsawSearchStore {
    return { async load() { return list.map(summary); }, forget() {} };
  }
  const owned = [
    jigsaw("a", { createdAt: 1, ownerUid: "u1" }),
    jigsaw("b", { createdAt: 2, ownerUid: "u1", visibility: "hidden" }),
    jigsaw("c", { createdAt: 3, ownerUid: "u2" }),
    jigsaw("d", { createdAt: 4, ownerUid: "u1", visibility: "owner" }),
  ];
  const app = () => createJigsawApp({ jigsawSearch: store(owned), plays: memoryPlays(), users: memoryUsers("u1", "u2") });
  const mineOf = (qs: string, me?: string) => {
    const r = request(app()).get(`/jigsaw/api/jigsaw-search/mine${qs}`);
    return me ? r.set("X-Jigsaw-User", me) : r;
  };

  it("gives only the jigsaws of the user who asks, the private and the hidden ones too, never another user's; 401 without a user", async () => {
    const res = await mineOf("", "u1");
    expect(res.status).toBe(200);
    expect(ids(res.body.items)).toEqual(["d", "b", "a"]);
    expect(res.body.counts).toEqual({ all: 3, everyone: 1, owner: 1, hidden: 1 });
    expect(ids((await mineOf("", "u2")).body.items)).toEqual(["c"]);
    expect((await mineOf("")).status).toBe(401);
  });

  it("pages, sorts, looks for words and chooses who sees them; refuses what is not allowed", async () => {
    expect(ids((await mineOf("?visibility=hidden", "u1")).body.items)).toEqual(["b"]);
    const page = (await mineOf("?limit=2&page=2&sort=old", "u1")).body;
    expect(ids(page.items)).toEqual(["d"]);
    expect(page.hasMore).toBe(false);
    expect((await mineOf("?visibility=secret", "u1")).status).toBe(400);
    expect((await mineOf("?sort=random", "u1")).status).toBe(400);
    expect((await mineOf("?limit=500", "u1")).status).toBe(400);
  });
});

import { describe, expect, it } from "vitest";
import { FeedItem, FeedItemData, FeedItems, FeedText, FeedTexts, HomeFeed, InfoItem, JIGSAW_LANGUAGES, KeptItem, OfferItem, PackageItem, PictureItem } from "../src/models";
import type { JigsawSummary } from "../src/models";

// The tiles of the home page: `FeedItem` is the parent and each kind overrides small hooks; a kept tile has its words in every language (the author's in the master language, the AI's in the others),
// is checked in one place, and has dates it is shown. The merge puts the tiles among the pictures so that a page loaded later never moves a tile that is already there.

const summary = (id: string, kind?: "picture"): JigsawSummary => ({ id, name: `Picture ${id}`, width: 100, height: 100, gridSize: 50, gridVisible: false, ...(kind ? { kind } : {}) }) as unknown as JigsawSummary;
const pictures = (n: number): FeedItem[] => Array.from({ length: n }, (_, i) => PictureItem.from(summary(`p${i}`)));
const ids = (items: readonly FeedItem[]) => items.map((i) => i.id).join(" ");
const en = (title: string, text?: string, label?: string): FeedText => ({ language: "en", title, ...(text ? { text } : {}), ...(label ? { label } : {}), by: "author" });
const info = (over: Partial<FeedItemData> = {}): InfoItem => new InfoItem({ id: "i", kind: "info", masterLanguage: "en", texts: [en("T", "Words")], ...over });
const offer = (over: Partial<FeedItemData> = {}): OfferItem => new OfferItem({ id: "o", kind: "offer", masterLanguage: "en", texts: [en("T", "Words", "-20 %")], link: "https://example.com", ...over });
const pack = (over: Partial<FeedItemData> = {}): PackageItem => new PackageItem({ id: "k", kind: "package", masterLanguage: "en", texts: [en("T")], ...over });
const DAY = 24 * 60 * 60 * 1000;

describe("the kinds of tile", () => {
  it("are all tiles (one parent), and each says where a press leads", () => {
    const picture = PictureItem.from(summary("a", "picture"));
    expect(picture).toBeInstanceOf(FeedItem);
    expect(info()).toBeInstanceOf(KeptItem);
    expect(picture.action()).toEqual({ type: "jigsaw", jigsawId: "a", asPicture: true });
    expect(PictureItem.from(summary("b")).action()).toEqual({ type: "jigsaw", jigsawId: "b", asPicture: false });
    expect(info().action()).toEqual({ type: "none" });
    expect(info({ route: "/play/info/help" }).action()).toEqual({ type: "route", to: "/play/info/help" });
    expect(offer().action()).toEqual({ type: "link", url: "https://example.com" });
    expect(offer({ link: undefined, route: "/play/list" }).action()).toEqual({ type: "route", to: "/play/list" });
    expect(pack().action()).toEqual({ type: "package", packageId: "k" });
  });

  it("have their own place among the pictures, which the kind says when the tile has none", () => {
    expect(info().defaultSlot(0)).toBe(0);
    expect(info().defaultSlot(2)).toBe(12);
    expect(pack().defaultSlot(1)).toBe(15);
    expect(offer().defaultSlot(0)).toBe(7);
  });

  it("are upcoming, active or expired, and shown only when active (the day it is shown from, the day it expires)", () => {
    const item = info({ from: 10 * DAY, to: 20 * DAY });
    expect(item.status(9 * DAY)).toBe("upcoming");
    expect(item.isShown(9 * DAY)).toBe(false);
    expect(item.status(10 * DAY)).toBe("active");
    expect(item.isShown(20 * DAY)).toBe(true);
    expect(item.status(20 * DAY + 1)).toBe("expired");
    expect(item.isShown(21 * DAY)).toBe(false);
    expect(info().status(1)).toBe("active");
  });

  it("are checked by one rule, the kind's own part included", () => {
    expect(info().error()).toBe("");
    expect(info({ id: "i d" }).error()).toMatch(/id/);
    expect(info({ masterLanguage: "xx" }).error()).toMatch(/language/);
    expect(info({ texts: [en(" ", "Words")] }).error()).toMatch(/title/);
    expect(info({ texts: [] }).error()).toMatch(/title/);
    expect(info({ texts: [en("T")] }).error()).toMatch(/words/);
    expect(info({ slot: -1 }).error()).toMatch(/place/);
    expect(info({ from: 5, to: 1 }).error()).toMatch(/expires before/);
    expect(info({ route: "//evil.example" }).error()).toMatch(/route/);
    expect(info({ texts: [en("T", "W"), en("Again", "W")] }).error()).toMatch(/One entry/);
    expect(offer().error()).toBe("");
    expect(offer({ texts: [en("T", "W")] }).error()).toMatch(/mark/);
    expect(offer({ link: undefined }).error()).toMatch(/leads somewhere/);
    expect(offer({ link: "http://example.com" }).error()).toMatch(/https/);
    expect(pack().error()).toBe("");
    expect(pack({ price: 4900, currency: "NOK" }).error()).toBe("");
    expect(pack({ price: -1 }).error()).toMatch(/price/);
    expect(pack({ price: 12.5 }).error()).toMatch(/price/);
    expect(pack({ price: 4900, currency: "kr" }).error()).toMatch(/currency/);
  });
});

describe("the words in every language", () => {
  const tile = info({ masterLanguage: "nb", texts: [{ language: "nb", title: "Hei", text: "Tekst", by: "author" }, { language: "en", title: "Hello", by: "ai" }, { language: "sv", title: "Hej", text: "Text", by: "ai" }] });

  it("show the entry of the language, and the master's where it has none (field by field)", () => {
    expect(tile.titleFor("sv")).toBe("Hej");
    expect(tile.textFor("sv")).toBe("Text");
    expect(tile.titleFor("en")).toBe("Hello");
    expect(tile.textFor("en")).toBe("Tekst"); // the English entry has no words: the master's are shown
    expect(tile.titleFor("fi")).toBe("Hei"); // no Finnish at all: the master's
    expect(tile.labelFor("sv")).toBeUndefined();
    expect(tile.title).toBe("Hei");
    expect(FeedTexts.pick(tile.data.texts, "de", "nb", "title")).toBe("Hei");
  });

  it("are read as they are kept: known languages only, one entry each, cut to size", () => {
    const read = FeedTexts.read([{ language: "en", title: "  A  " }, { language: "en", title: "Again" }, { language: "xx", title: "No" }, { language: "nb", title: "x".repeat(200), by: "ai" }, "no"]);
    expect(read.map((t) => t.language)).toEqual(["en", "nb"]);
    expect(read[0]).toEqual({ language: "en", title: "A", by: "author" });
    expect(read[1].title).toHaveLength(80);
    expect(read[1].by).toBe("ai");
    expect(FeedTexts.read("nothing")).toEqual([]);
  });

  it("have a fingerprint of the master words that changes when they do", () => {
    const a = FeedTexts.hashOf({ title: "T", text: "W" });
    expect(FeedTexts.hashOf({ title: "T", text: "W" })).toBe(a);
    expect(FeedTexts.hashOf({ title: "T", text: "W2" })).not.toBe(a);
    expect(FeedTexts.hashOf({ title: "T", label: "W" })).not.toBe(a);
  });
});

describe("the tiles that are kept", () => {
  it("keep only the known fields, and only for a kind that is kept", () => {
    const data = FeedItems.stored({ id: "x", kind: "info", masterLanguage: "nb", texts: [{ language: "nb", title: "Hei", text: "Tekst", by: "author" }], extra: "no", jigsawIds: ["a"], label: "no", slot: 3.9, route: " /play/list " });
    expect(data).toEqual({ id: "x", kind: "info", masterLanguage: "nb", texts: [{ language: "nb", title: "Hei", text: "Tekst", by: "author" }], slot: 3, route: "/play/list" });
    expect(FeedItems.stored({ id: "x", kind: "picture", texts: [] })).toBeNull();
    expect(FeedItems.stored({ id: "x", kind: "nothing" })).toBeNull();
    expect(FeedItems.stored({ id: "x", kind: "package", masterLanguage: "en", texts: [] })).not.toHaveProperty("price"); // free is what none says
  });

  it("read a document from before the words were in every language as the English words of its author", () => {
    const old = FeedItems.stored({ id: "x", kind: "offer", title: "Autumn", text: "Words", label: "-20 %", link: "https://example.com" });
    expect(old?.masterLanguage).toBe("en");
    expect(old?.texts).toEqual([{ language: "en", title: "Autumn", text: "Words", label: "-20 %", by: "author" }]);
    expect(FeedItems.of(old as FeedItemData).error()).toBe("");
  });

  it("are made into the class of their kind, and a document that is not right says why", () => {
    expect(FeedItems.of(info().data)).toBeInstanceOf(InfoItem);
    expect(FeedItems.of(offer().data)).toBeInstanceOf(OfferItem);
    expect(FeedItems.of(pack().data)).toBeInstanceOf(PackageItem);
    expect(FeedItems.error({ ...info().data })).toBe("");
    expect(FeedItems.error({ ...info({ texts: [en("T")] }).data })).toMatch(/words/);
    expect(FeedItems.error({ id: "a", kind: "picture" })).toMatch(/Not a kind/);
  });

  it("are the ones that are right and whose time it is, nothing else", () => {
    const docs = [
      { ...info({ id: "ok" }).data },
      { ...info({ id: "bad", texts: [en("T")] }).data },
      { ...info({ id: "later", from: 100 * DAY }).data },
      { ...info({ id: "over", to: 5 * DAY }).data },
      { id: "nokind", kind: "x" },
    ];
    expect(FeedItems.shown(docs, 50 * DAY).map((i) => i.id)).toEqual(["ok"]);
    expect(FeedItems.shown(docs, 150 * DAY).map((i) => i.id)).toEqual(["ok", "later"]);
  });

  it("match the words searched for, in any language, and who may change them", () => {
    const data = { ...info({ texts: [en("Welcome", "Press a picture"), { language: "nb", title: "Velkommen", text: "Trykk", by: "ai" }], ownerUid: "u1" }).data };
    expect(FeedItems.matches(data, "")).toBe(true);
    expect(FeedItems.matches(data, "WELCOME picture")).toBe(true);
    expect(FeedItems.matches(data, "velkommen")).toBe(true);
    expect(FeedItems.matches(data, "nothing like it")).toBe(false);
    expect(FeedItems.mayChange(data, "u1", false)).toBe(true);
    expect(FeedItems.mayChange(data, "u2", false)).toBe(false);
    expect(FeedItems.mayChange(data, "u2", true)).toBe(true);
    expect(FeedItems.mayChange({ ...data, ownerUid: undefined }, "u2", false)).toBe(true); // from before owners
  });
});

describe("what an author sends", () => {
  const body = { masterLanguage: "nb", title: "Hei", text: "Tekst", route: "/play/list", from: 5, to: 9, slot: 2, priority: 1, link: "https://example.com", label: "-10 %", ownerUid: "someone", id: "hack" };

  it("makes a new tile: the master words are the author's, the owner is who asks, only what the kind knows is kept", () => {
    const info1 = FeedItems.edited(null, "info", body, "u1", 1000);
    expect(info1).toMatchObject({ kind: "info", masterLanguage: "nb", ownerUid: "u1", createdAt: 1000, updatedAt: 1000, route: "/play/list", from: 5, to: 9, slot: 2, priority: 1 });
    expect(info1.texts).toEqual([{ language: "nb", title: "Hei", text: "Tekst", by: "author" }]); // an information has no mark
    expect(info1).not.toHaveProperty("link");
    expect(info1.id).toBe("");
    const offer1 = FeedItems.edited(null, "offer", body, "u1", 1000);
    expect(offer1.link).toBe("https://example.com");
    expect(offer1.texts[0].label).toBe("-10 %");
  });

  it("changes a tile: every other entry is kept, the owner and the time it was made stay", () => {
    const before = { ...info({ id: "x", ownerUid: "u1", createdAt: 1, texts: [en("Old", "Words"), { language: "sv", title: "Gammal", text: "Ord", by: "ai" }], sourceHash: "abc" }).data };
    const after = FeedItems.edited(before, "info", { title: "New", text: "New words" }, "admin1", 2000);
    expect(after).toMatchObject({ id: "x", ownerUid: "u1", createdAt: 1, updatedAt: 2000, masterLanguage: "en", sourceHash: "abc" });
    expect(after.texts.map((t) => `${t.language}:${t.title}:${t.by}`)).toEqual(["en:New:author", "sv:Gammal:ai"]);
  });

  it("changes the master language: the new master entry is the author's and the old one stays as it was", () => {
    const before = { ...info({ id: "x", texts: [en("Hello", "Words"), { language: "nb", title: "Hei", text: "Ord", by: "ai" }] }).data };
    const after = FeedItems.edited(before, "info", { masterLanguage: "nb", title: "Hei igjen", text: "Nye ord" }, "u1", 5);
    expect(after.masterLanguage).toBe("nb");
    expect(after.texts.map((t) => `${t.language}:${t.title}:${t.by}`)).toEqual(["nb:Hei igjen:author", "en:Hello:author"]);
  });
});

describe("what the AI has to translate", () => {
  const others = JIGSAW_LANGUAGES.map((l) => l.code).filter((c) => c !== "en");

  it("is every other language for a new tile, and nothing for the master language", () => {
    expect(FeedItems.toTranslate(info().data)).toEqual(others);
    expect(FeedItems.toTranslate({ ...info().data, texts: [] })).toEqual([]);
  });

  it("is made by the AI and then nothing is left; the entries say who made them", () => {
    const made = Object.fromEntries(others.map((c) => [c, { title: `T ${c}`, text: `W ${c}` }]));
    const done = FeedItems.withTranslations(info().data, made);
    expect(FeedItems.toTranslate(done)).toEqual([]);
    expect(done.texts).toHaveLength(JIGSAW_LANGUAGES.length);
    expect(FeedTexts.entryOf(done.texts, "nb")).toEqual({ language: "nb", title: "T nb", text: "W nb", by: "ai" });
    expect(FeedTexts.entryOf(done.texts, "en")?.by).toBe("author");
    expect(done.sourceHash).toBe(FeedTexts.hashOf({ title: "T", text: "Words" }));
  });

  it("is every AI entry again when the master words change, but never an entry the author wrote", () => {
    const made = Object.fromEntries(others.map((c) => [c, { title: `T ${c}`, text: `W ${c}` }]));
    const done = FeedItems.withTranslations(info().data, made);
    const mine = { ...done, texts: done.texts.map((t) => (t.language === "sv" ? { ...t, by: "author" as const } : t)) }; // the author corrected the Swedish
    const changed = { ...mine, texts: mine.texts.map((t) => (t.language === "en" ? { ...t, text: "Other words" } : t)) };
    expect(FeedItems.toTranslate(changed)).toEqual(others.filter((c) => c !== "sv"));
  });

  it("ignores what the AI gives for the master language or a language that is not one", () => {
    const done = FeedItems.withTranslations(info().data, { en: { title: "No" }, xx: { title: "No" }, nb: { title: "Ja" } });
    expect(done.texts.map((t) => t.language)).toEqual(["en", "nb"]);
    expect(done.texts[0].title).toBe("T");
  });
});

describe("a package: free or with a price", () => {
  it("is free when it says nothing or 0, and has a price in a currency otherwise (EUR when none is said)", () => {
    expect(pack().isFree).toBe(true);
    expect(pack().price).toBe(0);
    expect(pack({ price: 0 }).isFree).toBe(true);
    expect(pack({ price: 4900, currency: "NOK" }).isFree).toBe(false);
    expect(pack({ price: 4900 }).currency).toBe("EUR");
    expect(FeedItems.stored({ id: "x", kind: "package", masterLanguage: "en", texts: [], price: 0, currency: "NOK" })).not.toHaveProperty("currency");
    expect(FeedItems.stored({ id: "x", kind: "package", masterLanguage: "en", texts: [], price: 4900, currency: "nok" })).toMatchObject({ price: 4900, currency: "NOK" });
    expect(FeedItems.stored({ id: "x", kind: "package", masterLanguage: "en", texts: [], price: 4900 })).toMatchObject({ currency: "EUR" });
    expect(FeedItems.stored({ id: "x", kind: "info", masterLanguage: "en", texts: [], price: 4900 })).not.toHaveProperty("price"); // only a package has a price
  });

  it("is made from what an author sends: a price and a currency, not a link or a page, and not the derived fields", () => {
    const body = { masterLanguage: "en", title: "Summer", text: "Twelve pictures.", price: 4900, currency: "SEK", link: "https://example.com", route: "/x", pictureCount: 9, coverIds: ["a"] };
    const made = FeedItems.edited(null, "package", body, "u1", 1);
    expect(made).toMatchObject({ kind: "package", price: 4900, currency: "SEK", ownerUid: "u1" });
    expect(made).not.toHaveProperty("link");
    expect(made).not.toHaveProperty("route");
    expect(made).not.toHaveProperty("pictureCount");
    expect(FeedItems.edited(made, "package", { title: "Summer", text: "Twelve pictures." }, "u1", 2)).not.toHaveProperty("price"); // an author who sends no price makes it free
  });
});

describe("the categories of a package", () => {
  const filter = (categories: string[] = [], text = "") => ({ categories, text });

  it("are the categories of a picture, only the known ones, and only a package has them", () => {
    const stored = FeedItems.stored({ ...pack().data, categories: ["nature", "nothing", "animals"] });
    expect([...(stored?.categories ?? [])].sort()).toEqual(["animals", "nature"]);
    expect(FeedItems.stored({ ...pack().data, categories: [] })).not.toHaveProperty("categories");
    expect(FeedItems.stored({ ...info().data, categories: ["nature"] })).not.toHaveProperty("categories");
    expect(pack({ categories: ["nature"] }).categories).toEqual(["nature"]);
    expect(FeedItems.categoriesError(undefined)).toBe("");
    expect(FeedItems.categoriesError(["nature"])).toBe("");
    expect(FeedItems.categoriesError(["nothing"])).toMatch(/not a category/);
    expect(FeedItems.categoriesError(["nature", "animals", "travel", "art"])).toMatch(/at most/);
    expect(pack({ categories: ["nothing"] }).error()).toMatch(/not a category/);
  });

  it("are what the person's search finds a package by, with the words of any language", () => {
    const tile = pack({ categories: ["nature"], texts: [en("Summer forests", "Trees"), { language: "nb", title: "Sommerskog", by: "ai" }] });
    expect(tile.matchesFilter(filter())).toBe(true);
    expect(tile.matchesFilter(filter(["nature"]))).toBe(true);
    expect(tile.matchesFilter(filter(["animals", "nature"]))).toBe(true);
    expect(tile.matchesFilter(filter(["animals"]))).toBe(false);
    expect(tile.matchesFilter(filter([], "forest"))).toBe(true);
    expect(tile.matchesFilter(filter([], "sommerskog"))).toBe(true);
    expect(tile.matchesFilter(filter(["nature"], "winter"))).toBe(false);
    expect(pack().matchesFilter(filter(["nature"]))).toBe(false); // a package in no category is not found by one
  });

  it("do not filter an information or an offer: they are not content", () => {
    expect(info().matchesFilter(filter(["animals"], "nothing like it"))).toBe(true);
    expect(offer().matchesFilter(filter(["animals"]))).toBe(true);
  });
});

describe("public, private or hidden", () => {
  it("is public when it says nothing; a private tile is seen by its owner only, a hidden one by nobody", () => {
    const tile = (visibility?: "owner" | "hidden") => info({ ownerUid: "u1", ...(visibility ? { visibility } : {}) });
    expect(tile().isVisibleTo(undefined)).toBe(true);
    expect(tile().isVisibleTo("u2")).toBe(true);
    expect(tile("owner").isVisibleTo("u1")).toBe(true);
    expect(tile("owner").isVisibleTo("u2")).toBe(false);
    expect(tile("owner").isVisibleTo(undefined)).toBe(false);
    expect(tile("owner").isPrivate).toBe(true);
    expect(tile().isPrivate).toBe(false);
    expect(tile("hidden").isVisibleTo("u1")).toBe(false);
    expect(info({ visibility: "owner" }).isVisibleTo("u1")).toBe(false); // a private tile with no owner is nobody's
  });

  it("is kept as `owner` or `hidden`, and is public when it says anything else", () => {
    expect(FeedItems.stored({ ...info().data, visibility: "owner" })?.visibility).toBe("owner");
    expect(FeedItems.stored({ ...info().data, visibility: "hidden" })?.visibility).toBe("hidden");
    expect(FeedItems.stored({ ...info().data, visibility: "everyone" })).not.toHaveProperty("visibility");
    expect(FeedItems.stored({ ...info().data, visibility: "nonsense" })).not.toHaveProperty("visibility");
    expect(FeedItems.visibilityError("everyone")).toBe("");
    expect(FeedItems.visibilityError(undefined)).toBe("");
    expect(FeedItems.visibilityError("nobody")).toMatch(/public, private or hidden/);
  });

  it("is private for a new tile that says nothing, and what it was for a changed one", () => {
    const body = { masterLanguage: "en", title: "T", text: "W" };
    expect(FeedItems.edited(null, "info", body, "u1", 1).visibility).toBe("owner");
    expect(FeedItems.edited(null, "info", { ...body, visibility: "everyone" }, "u1", 1)).not.toHaveProperty("visibility");
    expect(FeedItems.edited(null, "info", { ...body, visibility: "hidden" }, "u1", 1).visibility).toBe("hidden");
    const before = { ...info({ id: "x", visibility: "hidden" }).data };
    expect(FeedItems.edited(before, "info", body, "u1", 2).visibility).toBe("hidden");
    expect(FeedItems.edited(before, "info", { ...body, visibility: "everyone" }, "u1", 2)).not.toHaveProperty("visibility");
  });

  it("is what decides who is shown a tile, with its time", () => {
    const docs = [{ ...info({ id: "pub1" }).data }, { ...info({ id: "mine", ownerUid: "u1", visibility: "owner" }).data }, { ...info({ id: "hid", ownerUid: "u1", visibility: "hidden" }).data }];
    expect(FeedItems.shown(docs, 1).map((i) => i.id)).toEqual(["pub1"]);
    expect(FeedItems.shown(docs, 1, "u1").map((i) => i.id)).toEqual(["pub1", "mine"]);
    expect(FeedItems.shown(docs, 1, "u2").map((i) => i.id)).toEqual(["pub1"]);
  });
});

describe("the home page: the pictures with the other tiles among them", () => {
  const tile = (id: string, slot?: number, priority = 0) => info({ id, slot, priority });

  it("puts a tile after as many pictures as its place says", () => {
    expect(ids(HomeFeed.merge(pictures(4), [tile("t", 2)], true))).toBe("p0 p1 t p2 p3");
    expect(ids(HomeFeed.merge(pictures(3), [tile("t", 0)], true))).toBe("t p0 p1 p2");
  });

  it("keeps a tile that is not loaded yet waiting, so a later page never moves one that is there", () => {
    const first = HomeFeed.merge(pictures(5), [tile("a", 2), tile("b", 8)], false);
    expect(ids(first)).toBe("p0 p1 a p2 p3 p4"); // b waits: its place is after the eighth picture
    const second = HomeFeed.merge(pictures(10), [tile("a", 2), tile("b", 8)], false);
    expect(ids(second)).toBe("p0 p1 a p2 p3 p4 p5 p6 p7 b p8 p9");
    expect(ids(second).startsWith(ids(first))).toBe(true); // what was shown is still where it was
  });

  it("puts what waits at the end when there are no more pictures", () => {
    expect(ids(HomeFeed.merge(pictures(2), [tile("t", 9)], true))).toBe("p0 p1 t");
    expect(ids(HomeFeed.merge(pictures(0), [tile("t", 3)], true))).toBe("t");
    expect(ids(HomeFeed.merge(pictures(0), [tile("t", 3)], false))).toBe("");
  });

  it("orders two on the same place by priority, then by id, and numbers the kind by priority", () => {
    expect(ids(HomeFeed.merge(pictures(2), [tile("b", 1), tile("a", 1), tile("c", 1, 5)], true))).toBe("p0 c a b p1");
    // no place of its own: the kind's (an information: 0, 6, 12 ...), the first by priority first
    expect(ids(HomeFeed.merge(pictures(8), [tile("low"), tile("high", undefined, 3)], true))).toBe("high p0 p1 p2 p3 p4 p5 low p6 p7");
  });

  it("is the pictures alone when there is nothing else", () => {
    expect(ids(HomeFeed.merge(pictures(3), [], false))).toBe("p0 p1 p2");
  });
});

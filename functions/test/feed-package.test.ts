import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { FeedStore, PackagePictures } from "../src/jigsaw/jigsaw-feed";
import type { Translator } from "../src/jigsaw/translator";
import { FeedItemData, FeedItemInput, JigsawSettings, JigsawSpec, UserLevel } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// A package is like an offer, free or with a price, and it holds pictures. The pictures are ordinary pictures in the same collection as all the others, each linked to the package by `packageId`; they
// are not in the general list. A tile of the home page shows a package with how many pictures it holds and a few of their ids (chosen at random), and its page has all of them.

const DAY = 24 * 60 * 60 * 1000;
const NOW = 100 * DAY;

function memoryFeed(): FeedStore {
  const all = new Map<string, FeedItemData>();
  let n = 0;
  return {
    async list() {
      return [...all.values()].reverse();
    },
    async get(id) {
      return all.get(id) ?? null;
    },
    async add(input: FeedItemInput) {
      const item = { ...input, id: `k${++n}`, createdAt: NOW } as FeedItemData;
      all.set(item.id, item);
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

const translator: Translator = { translate: async (words, _from, to) => ({ made: Object.fromEntries(to.map((l) => [l, { title: `${words.title} ${l}`, ...(words.text ? { text: `${words.text} ${l}` } : {}) }])) }) };

function setup() {
  const levels: Record<string, UserLevel> = { boss: "admin", pub: "publisher", pub2: "publisher", plain: "user" };
  const jigsaws = memoryJigsaws();
  const feedPackages = memoryFeed();
  /** the pictures of a package, read from the jigsaws that are kept (the real one asks Firestore for `packageId`) */
  const packagePictures: PackagePictures = { list: async (packageId) => ((await jigsaws.list()) as JigsawSpec[]).filter((j) => j.packageId === packageId).sort((a, b) => b.createdAt - a.createdAt) };
  const app = createJigsawApp({
    users: memoryUsers("boss", "pub", "pub2", "plain"),
    levels: { of: async (id) => levels[id ?? ""] ?? "user", forget() {} },
    jigsaw: jigsaws,
    jigsawPieces: memoryPieces(),
    plays: memoryPlays(),
    jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id),
    viewKeySecret: TEST_KEY_SECRET,
    accountPictures: memoryImages(),
    jigsawSearch: { load: async () => jigsaws.list() as never, forget() {} },
    feedInfo: memoryFeed(),
    feedOffers: memoryFeed(),
    feedPackages,
    packagePictures,
    bought: { list: async () => [], add: async () => {} },
    favorites: { list: async () => [], add: async () => {}, remove: async () => {}, removeAllOf: async () => {} },
    translator,
    tokenUsage: { add: async (userId, u) => ({ ...u, id: "u" }), list: async () => [] },
    random: () => 0,
    now: () => NOW,
  });
  const call = (method: "get" | "post" | "put" | "delete", path: string, as?: string) => {
    const r = request(app)[method](`/jigsaw/api${path}`);
    if (as) r.set("X-Jigsaw-User", as);
    return r;
  };
  const settings = { name: "Harbour", kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [] };
  const picture = (as: string, extra: Record<string, unknown> = {}) => call("post", "/jigsaw", as).send({ ...settings, ownerUid: as, ...extra });
  return { call, picture, jigsaws, feedPackages };
}

const pack = { masterLanguage: "en", title: "Summer holidays", text: "Pictures of sun and sea.", visibility: "everyone" };

describe("a package", () => {
  it("is free, or has a price in a currency, and is written like an offer: the words in every language, a date it is shown from and a date it expires", async () => {
    const { call } = setup();
    const free = await call("post", "/jigsaw-packages", "pub").send(pack);
    expect(free.status).toBe(201);
    expect(free.body.item).not.toHaveProperty("price");
    expect(free.body.item.texts).toHaveLength(9);
    expect(free.body.translation).toBe("done");
    const priced = await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Winter", price: 4900, currency: "nok", from: 5 * DAY, to: 200 * DAY });
    expect(priced.body.item).toMatchObject({ kind: "package", price: 4900, currency: "NOK", from: 5 * DAY, to: 200 * DAY, ownerUid: "pub" });
    expect((await call("post", "/jigsaw-packages", "pub").send({ ...pack, price: -5 })).body.error).toMatch(/price/);
    expect((await call("post", "/jigsaw-packages", "plain").send(pack)).status).toBe(403);
    // an author who takes the price away makes it free
    const id = priced.body.item.id as string;
    expect((await call("put", `/jigsaw-packages/${id}`, "pub").send({ ...pack, title: "Winter" })).body.item).not.toHaveProperty("price");
  });

  it("has the categories of a picture, which are checked, kept and sent to the home page", async () => {
    const { call } = setup();
    const made = await call("post", "/jigsaw-packages", "pub").send({ ...pack, categories: ["nature", "animals"] });
    expect(made.status).toBe(201);
    expect([...(made.body.item.categories as string[])].sort()).toEqual(["animals", "nature"]);
    expect((await call("post", "/jigsaw-packages", "pub").send({ ...pack, categories: ["nothing"] })).body.error).toMatch(/not a category/);
    expect((await call("put", `/jigsaw-packages/${made.body.item.id}`, "pub").send({ ...pack, categories: ["nature", "animals", "travel", "art"] })).body.error).toMatch(/at most/);
    const shown = ((await call("get", "/jigsaw-feed")).body.items as FeedItemData[])[0];
    expect(shown.categories).toHaveLength(2);
    expect((await call("put", `/jigsaw-packages/${made.body.item.id}`, "pub").send({ ...pack, categories: [] })).body.item).not.toHaveProperty("categories");
  });

  it("holds ordinary pictures, each linked to it by `packageId`, which only its owner (or an admin) can put there", async () => {
    const { call, picture, jigsaws } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send(pack)).body.item.id as string;
    const made = await picture("pub", { packageId: id, visibility: undefined });
    expect(made.status).toBe(201);
    expect(made.body.packageId).toBe(id);
    expect((await jigsaws.list()).filter((j) => (j as JigsawSpec).packageId === id)).toHaveLength(1); // in the same collection as the rest
    expect((await picture("pub2", { packageId: id })).status).toBe(403); // not another publisher's package
    expect((await picture("boss", { packageId: id })).status).toBe(201); // an admin's
    expect((await picture("pub", { packageId: "nothing" })).status).toBe(400); // a package that is not there
    expect((await picture("pub", { packageId: "bad id" })).status).toBe(400);
    expect(new JigsawSettings({ ...settings(), packageId: 5 }).error()).toMatch(/package id/);
    expect(new JigsawSettings({ ...settings(), packageId: "ok_id-1" }).error()).toBe("");
    expect(JigsawSettings.fromStored("x", { ...settings(), packageId: "k1" } as never).packageId).toBe("k1");
  });

  it("stamps its language on each new picture of it, whatever the page says, and the picture keeps it", async () => {
    const { call, picture } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send({ ...pack, masterLanguage: "nb" })).body.item.id as string;
    const made = (await picture("pub", { packageId: id, language: "de", visibility: undefined })).body as JigsawSpec;
    expect(made.language).toBe("nb");
    const { id: pictureId, createdAt: _at, ...input } = made;
    expect((await call("put", `/jigsaw/${pictureId}`, "pub").send({ ...input, language: "fr" })).body.language).toBe("nb");
    expect((await picture("pub", { language: "de" })).body.language).toBe("de"); // a picture in no package has the one it was made with
  });

  it("stays in it when the picture is changed, though the change does not say the package, and is not moved by one that names another", async () => {
    const { call, picture } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send(pack)).body.item.id as string;
    const other = (await call("post", "/jigsaw-packages", "pub").send(pack)).body.item.id as string;
    const one = (await picture("pub", { packageId: id })).body as JigsawSpec;
    const change = { ...settings(), kind: "picture", name: "Renamed", ownerUid: "pub" };
    const renamed = await call("put", `/jigsaw/${one.id}`, "pub").send(change);
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Renamed", packageId: id });
    expect((await call("put", `/jigsaw/${one.id}`, "pub").send({ ...change, packageId: other })).body.packageId).toBe(id);
    expect(((await call("get", `/jigsaw-packages/${id}/pictures`, "pub")).body.pictures as JigsawSpec[]).map((p) => p.name)).toEqual(["Renamed"]);
  });

  it("has a list of its pictures for its owner, and cannot be deleted while it has any", async () => {
    const { call, picture } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send(pack)).body.item.id as string;
    expect((await call("get", `/jigsaw-packages/${id}/pictures`, "pub")).body.pictures).toEqual([]);
    const one = (await picture("pub", { packageId: id })).body as JigsawSpec;
    expect(((await call("get", `/jigsaw-packages/${id}/pictures`, "pub")).body.pictures as JigsawSpec[]).map((p) => p.id)).toEqual([one.id]);
    expect((await call("get", `/jigsaw-packages/${id}/pictures`, "pub2")).status).toBe(403);
    expect((await call("delete", `/jigsaw-packages/${id}`, "pub")).status).toBe(409); // none is left without its package
    expect((await call("delete", `/jigsaw/${one.id}`, "pub")).status).toBe(204);
    expect((await call("delete", `/jigsaw-packages/${id}`, "pub")).status).toBe(204);
  });

  it("is not in the general list: its pictures are found only through it", async () => {
    const { call, picture } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send(pack)).body.item.id as string;
    const inside = (await picture("pub", { packageId: id, name: "Inside" })).body as JigsawSpec;
    const outside = (await picture("pub", { name: "Outside" })).body as JigsawSpec;
    const found = (await call("get", "/jigsaw-search?limit=50", "pub")).body.items as JigsawSpec[];
    expect(found.map((j) => j.id)).toContain(outside.id);
    expect(found.map((j) => j.id)).not.toContain(inside.id);
  });
});

describe("a package on the home page", () => {
  it("comes with how many pictures it holds and a few of their ids, only public ones; a package with none has none", async () => {
    const { call, picture } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send(pack)).body.item.id as string;
    const empty = (await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Empty" })).body.item.id as string;
    const a = (await picture("pub", { packageId: id, name: "A" })).body as JigsawSpec;
    const b = (await picture("pub", { packageId: id, name: "B" })).body as JigsawSpec;
    await picture("pub", { packageId: id, name: "Secret", visibility: "owner" }); // a private one is not shown
    const items = (await call("get", "/jigsaw-feed")).body.items as FeedItemData[];
    const shown = items.find((i) => i.id === id) as FeedItemData;
    expect(shown.pictureCount).toBe(2);
    expect([...(shown.coverIds ?? [])].sort()).toEqual([a.id, b.id].sort());
    const none = items.find((i) => i.id === empty) as FeedItemData;
    expect(none).toMatchObject({ pictureCount: 0, coverIds: [] });
  });

  it("is only shown while it is active", async () => {
    const { call } = setup();
    await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Over", to: 5 * DAY });
    await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Later", from: 150 * DAY });
    await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Now" });
    const titles = ((await call("get", "/jigsaw-feed")).body.items as FeedItemData[]).map((i) => i.texts[0].title);
    expect(titles).toEqual(["Now"]);
  });

  it("has a page with all its public pictures, for a package that is active and nothing else", async () => {
    const { call, picture } = setup();
    const id = (await call("post", "/jigsaw-packages", "pub").send({ ...pack, price: 990, currency: "EUR" })).body.item.id as string;
    const over = (await call("post", "/jigsaw-packages", "pub").send({ ...pack, to: 5 * DAY })).body.item.id as string;
    await picture("pub", { packageId: id, name: "A" });
    await picture("pub", { packageId: id, name: "B" });
    await picture("pub", { packageId: id, name: "Private", visibility: "owner" });
    const res = await call("get", `/jigsaw-feed/package/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({ id, price: 990, currency: "EUR", pictureCount: 2 });
    expect((res.body.pictures as JigsawSpec[]).map((p) => p.name).sort()).toEqual(["A", "B"]);
    expect((await call("get", `/jigsaw-feed/package/${over}`)).status).toBe(404);
    expect((await call("get", "/jigsaw-feed/package/nothing")).status).toBe(404);
  });
});

describe("a package that is private or hidden", () => {
  it("is shown, with its pictures, only to its owner when private, and to nobody when hidden: on the home page and on its page", async () => {
    const { call, picture } = setup();
    const secret = (await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Secret", visibility: "owner" })).body.item.id as string;
    const gone = (await call("post", "/jigsaw-packages", "pub").send({ ...pack, title: "Gone", visibility: "hidden" })).body.item.id as string;
    await picture("pub", { packageId: secret, name: "Inside" });
    const titles = async (as?: string) => ((await call("get", "/jigsaw-feed", as)).body.items as FeedItemData[]).map((i) => i.texts[0].title);
    expect(await titles("pub")).toEqual(["Secret"]);
    expect(await titles()).toEqual([]);
    expect(await titles("pub2")).toEqual([]);
    const mine = await call("get", `/jigsaw-feed/package/${secret}`, "pub");
    expect(mine.status).toBe(200);
    expect(mine.body.item.visibility).toBe("owner"); // the page says it is private
    expect((mine.body.pictures as JigsawSpec[]).map((p) => p.name)).toEqual(["Inside"]);
    expect((await call("get", `/jigsaw-feed/package/${secret}`)).status).toBe(404);
    expect((await call("get", `/jigsaw-feed/package/${secret}`, "pub2")).status).toBe(404);
    expect((await call("get", `/jigsaw-feed/package/${gone}`, "pub")).status).toBe(404);
  });
});

function settings() {
  return { name: "Harbour", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [] as never[] };
}

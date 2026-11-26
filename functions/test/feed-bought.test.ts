import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { BoughtStore } from "../src/jigsaw/jigsaw-bought";
import type { FeedStore, PackagePictures } from "../src/jigsaw/jigsaw-feed";
import type { Translator } from "../src/jigsaw/translator";
import { BoughtPackage, BoughtPackages, FeedItemData, FeedItemInput, FeedItems, HomeFeed, JigsawSpec, UserLevel } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// A package is got (a free one) or bought: it is then kept under the account (`bought-packages`), and its pictures are in the account's search, and the account may open and play them. Nobody else finds or
// opens them (but their owner, and an admin). No money is taken: payment is not built.

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

function memoryBought(): BoughtStore & { of: Map<string, Map<string, BoughtPackage>> } {
  const of = new Map<string, Map<string, BoughtPackage>>();
  return {
    of,
    async list(userId) {
      return [...(of.get(userId)?.values() ?? [])];
    },
    async add(userId, bought) {
      if (!of.has(userId)) of.set(userId, new Map());
      of.get(userId)!.set(bought.packageId, bought);
    },
  };
}

const translator: Translator = { translate: async (words, _from, to) => ({ made: Object.fromEntries(to.map((l) => [l, { title: words.title, ...(words.text ? { text: words.text } : {}) }])) }) };

function setup() {
  const levels: Record<string, UserLevel> = { boss: "admin", pub: "publisher", plain: "user", other: "user" };
  const jigsaws = memoryJigsaws();
  const store = memoryBought();
  // these accounts are verified (only a verified account adds packages, see account-limits.test.ts): the flag the page is told, so the gate of these tests asks nobody for a token
  const users = memoryUsers("boss", "pub", "plain", "other");
  const get_ = users.get.bind(users);
  users.get = async (id) => {
    const found = await get_(id);
    return found ? ({ ...found, protected: true } as typeof found) : found;
  };
  const packagePictures: PackagePictures = { list: async (packageId) => ((await jigsaws.list()) as JigsawSpec[]).filter((j) => j.packageId === packageId) };
  const app = createJigsawApp({
    users,
    levels: { of: async (id) => levels[id ?? ""] ?? "user", forget() {} },
    jigsaw: jigsaws,
    jigsawPieces: memoryPieces(),
    plays: memoryPlays(),
    jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id),
    viewKeySecret: TEST_KEY_SECRET,
    accountPictures: memoryImages(),
    jigsawSearch: { load: async () => jigsaws.list() as never, forget() {} },
    favorites: { list: async () => [], add: async () => {}, remove: async () => {}, removeAllOf: async () => {} },
    feedInfo: memoryFeed(),
    feedOffers: memoryFeed(),
    feedPackages: memoryFeed(),
    packagePictures,
    bought: store,
    translator,
    tokenUsage: { add: async (_u, u) => ({ ...u, id: "u" }), list: async () => [] },
    now: () => NOW,
  });
  const call = (method: "get" | "post" | "put" | "delete", path: string, as?: string) => {
    const r = request(app)[method](`/jigsaw/api${path}`);
    if (as) r.set("X-Jigsaw-User", as);
    return r;
  };
  const words = { masterLanguage: "en", title: "Forests", text: "Trees.", visibility: "everyone" };
  const pack = async (extra: Record<string, unknown> = {}) => (await call("post", "/jigsaw-packages", "pub").send({ ...words, ...extra })).body.item.id as string;
  const picture = async (packageId: string | undefined, name: string) =>
    (await call("post", "/jigsaw", "pub").send({ name, kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], ownerUid: "pub", ...(packageId ? { packageId } : {}) })).body as JigsawSpec;
  const get = (account: string, id: string, as: string | null = account) => call("put", `/jigsaw-users/${account}/bought-packages/${id}`, as ?? undefined);
  const found = async (as?: string) => ((await call("get", "/jigsaw-search?limit=50", as)).body.items as JigsawSpec[]).map((j) => j.name).sort();
  return { call, pack, picture, get, found, store, words };
}

describe("what a package that is got is (the model)", () => {
  it("is kept with its price, and is owed for while payment is not built", () => {
    expect(BoughtPackages.of({ id: "k", price: 0, currency: "EUR" }, 5)).toEqual({ packageId: "k", boughtAt: 5, price: 0, paid: true });
    expect(BoughtPackages.of({ id: "k", price: 4900, currency: "NOK" }, 5)).toEqual({ packageId: "k", boughtAt: 5, price: 4900, currency: "NOK", paid: false });
  });

  it("is read as it is kept: only the known fields, and nothing for a document that names no package", () => {
    expect(BoughtPackages.stored({ packageId: "k", boughtAt: 2, price: 100, currency: "EUR", paid: true, extra: 1 })).toEqual({ packageId: "k", boughtAt: 2, price: 100, currency: "EUR", paid: true });
    expect(BoughtPackages.stored({ packageId: "k" })).toEqual({ packageId: "k", boughtAt: 0, price: 0, paid: true });
    expect(BoughtPackages.stored({ price: 1 })).toBeNull();
  });

  it("gives the pictures of the package, which are otherwise only their owner's", () => {
    const none = new Set<string>();
    expect(BoughtPackages.mayUse({}, undefined, none)).toBe(true); // in no package: its visibility decides
    expect(BoughtPackages.mayUse({ packageId: "k", ownerUid: "pub" }, undefined, none)).toBe(false);
    expect(BoughtPackages.mayUse({ packageId: "k", ownerUid: "pub" }, "plain", none)).toBe(false);
    expect(BoughtPackages.mayUse({ packageId: "k", ownerUid: "pub" }, "plain", new Set(["k"]))).toBe(true);
    expect(BoughtPackages.mayUse({ packageId: "k", ownerUid: "pub" }, "pub", none)).toBe(true);
  });
});

describe("getting or buying a package", () => {
  it("keeps it under the account, once, with the price it had, and lists what the account has", async () => {
    const { call, pack, get, store } = setup();
    const free = await pack();
    const priced = await pack({ price: 4900, currency: "NOK" });
    expect((await get("plain", free)).status).toBe(201);
    expect((await get("plain", free)).status).toBe(200); // had already
    expect((await get("plain", priced)).status).toBe(201);
    expect(store.of.get("plain")?.get(free)).toMatchObject({ price: 0, paid: true, boughtAt: NOW });
    expect(store.of.get("plain")?.get(priced)).toMatchObject({ price: 4900, currency: "NOK", paid: false });
    expect([...(await call("get", "/jigsaw-users/plain/bought-packages", "plain")).body.packageIds].sort()).toEqual([free, priced].sort());
    expect((await call("get", "/jigsaw-users/other/bought-packages", "other")).body.packageIds).toEqual([]);
  });

  it("is for the account itself (or an admin), and only for a package that can be seen and is active", async () => {
    const { call, pack, get, store } = setup();
    const id = await pack();
    expect((await get("plain", id, "other")).status).toBe(403);
    expect((await get("plain", id, null)).status).toBe(403);
    expect((await call("get", "/jigsaw-users/plain/bought-packages", "other")).status).toBe(403);
    expect((await get("plain", id, "boss")).status).toBe(201);
    expect((await get("nobody", id)).status).toBe(404); // no such account
    expect((await get("plain", await pack({ visibility: "hidden" }))).status).toBe(404);
    expect((await get("plain", await pack({ visibility: "owner" }))).status).toBe(404); // private: the owner's only
    expect((await get("plain", await pack({ to: 5 * DAY }))).status).toBe(404); // expired
    expect((await get("plain", "nothing"))?.status).toBe(404);
    expect(store.of.get("plain")?.size).toBe(1);
  });
});

describe("the pictures of a package", () => {
  it("are in the search of those who have the package, and of nobody else", async () => {
    const { pack, picture, get, found } = setup();
    const id = await pack();
    await picture(id, "Inside");
    await picture(undefined, "Outside");
    expect(await found()).toEqual(["Outside"]);
    expect(await found("plain")).toEqual(["Outside"]);
    await get("plain", id);
    expect(await found("plain")).toEqual(["Inside", "Outside"]);
    expect(await found("other")).toEqual(["Outside"]);
    expect(await found()).toEqual(["Outside"]);
  });

  it("are opened, listed and played by those who have the package (their owner and an admin too), and by nobody else", async () => {
    const { call, pack, picture, get } = setup();
    const id = await pack();
    const inside = await picture(id, "Inside");
    const open = (as?: string) => call("get", `/jigsaw/${inside.id}`, as).then((r) => r.status);
    const rounds = (as?: string) => call("get", `/jigsaw/${inside.id}/plays`, as).then((r) => r.status);
    expect(await open()).toBe(404);
    expect(await open("plain")).toBe(404);
    expect(await rounds("plain")).toBe(404);
    expect((await call("post", `/jigsaw/${inside.id}/plays`, "plain").send({ userId: "plain" })).status).toBe(404);
    expect(((await call("get", "/jigsaw", "plain")).body as JigsawSpec[]).map((j) => j.id)).not.toContain(inside.id);
    expect(await open("pub")).toBe(200);
    expect(await open("boss")).toBe(200);
    await get("plain", id);
    expect(await open("plain")).toBe(200);
    expect(await rounds("plain")).toBe(200);
    expect((await call("post", `/jigsaw/${inside.id}/plays`, "plain").send({ userId: "plain" })).status).not.toBe(404);
    expect(((await call("get", "/jigsaw", "plain")).body as JigsawSpec[]).map((j) => j.id)).toContain(inside.id);
    expect(await open("other")).toBe(404);
  });

  it("are on the page of the package for everybody to see, which says who has it and who may play them", async () => {
    const { call, pack, picture, get, words } = setup();
    const id = await pack();
    await picture(id, "Inside");
    const page = (as?: string) => call("get", `/jigsaw-feed/package/${id}`, as);
    expect((await page("plain")).body).toMatchObject({ bought: false, mayPlay: false });
    expect((await page("plain")).body.pictures).toHaveLength(1); // looked at as what the package holds
    expect((await page("pub")).body).toMatchObject({ bought: false, mayPlay: true });
    expect((await page("boss")).body).toMatchObject({ bought: false, mayPlay: true });
    await get("plain", id);
    expect((await page("plain")).body).toMatchObject({ bought: true, mayPlay: true });
    // what was got stays there for the one who has it, also when it is not on the home page any more
    await call("put", `/jigsaw-packages/${id}`, "pub").send({ ...words, visibility: "hidden" });
    expect((await page("plain")).status).toBe(200);
    expect((await page("other")).status).toBe(404);
  });
});

describe("the home page and a package that is got", () => {
  it("says which packages the account has got, and keeps them on the list of all", async () => {
    const { call, pack, get } = setup();
    const id = await pack();
    const tiles = async (as?: string) => (await call("get", "/jigsaw-feed", as)).body.items as FeedItemData[];
    await get("plain", id);
    expect((await tiles("plain")).find((t) => t.id === id)?.had).toBe(true);
    expect((await tiles("other")).find((t) => t.id === id)?.had).toBeUndefined();
    expect((await tiles()).find((t) => t.id === id)?.had).toBeUndefined();
  });

  it("gives the packages the account has got, also one that is not on the home page any more", async () => {
    const { call, pack, get, words } = setup();
    const kept = await pack();
    const gone = await pack();
    await pack(); // not got
    await get("plain", kept);
    await get("plain", gone);
    await call("put", `/jigsaw-packages/${gone}`, "pub").send({ ...words, visibility: "hidden" });
    const mine = async (as?: string) => (await call("get", "/jigsaw-feed/mine", as)).body.items as FeedItemData[];
    expect((await mine("plain")).map((t) => t.id).sort()).toEqual([kept, gone].sort());
    expect((await mine("plain")).every((t) => t.had)).toBe(true);
    expect(await mine("other")).toEqual([]);
    expect(await mine()).toEqual([]);
  });

  it("does not offer a package again to the one who has it (the model)", () => {
    const tile = (had?: boolean) => FeedItems.of({ id: "k", kind: "package", masterLanguage: "en", texts: [{ language: "en", title: "Forests" }], ...(had ? { had } : {}) } as FeedItemData);
    expect(HomeFeed.merge([], [tile()], true).map((t) => t.id)).toEqual(["k"]);
    expect(HomeFeed.merge([], [tile(true)], true)).toEqual([]);
  });
});

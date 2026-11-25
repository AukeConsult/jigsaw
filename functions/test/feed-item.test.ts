import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { dummyFeedStore } from "../src/jigsaw/jigsaw-feed";
import { FeedItem, FeedItems, HomeFeed, InfoItem, OfferItem, PackageItem, PictureItem } from "../src/models";
import type { JigsawSummary } from "../src/models";

// The tiles of the home page: `FeedItem` is the parent and each kind overrides small hooks, the kept ones are checked in one place, and the merge puts them among the pictures so that a page loaded later
// never moves a tile that is already there. The route gives what is shown now. No test needs Firestore.

const summary = (id: string, kind?: "picture"): JigsawSummary => ({ id, name: `Picture ${id}`, width: 100, height: 100, gridSize: 50, gridVisible: false, ...(kind ? { kind } : {}) }) as unknown as JigsawSummary;
const pictures = (n: number): FeedItem[] => Array.from({ length: n }, (_, i) => PictureItem.from(summary(`p${i}`)));
const ids = (items: readonly FeedItem[]) => items.map((i) => i.id).join(" ");

describe("the kinds of tile", () => {
  it("are all tiles (one parent), and each says where a press leads", () => {
    const picture = PictureItem.from(summary("a", "picture"));
    expect(picture).toBeInstanceOf(FeedItem);
    expect(picture.action()).toEqual({ type: "jigsaw", jigsawId: "a", asPicture: true });
    expect(PictureItem.from(summary("b")).action()).toEqual({ type: "jigsaw", jigsawId: "b", asPicture: false });
    expect(new InfoItem({ id: "i", title: "T" }, "Words").action()).toEqual({ type: "none" });
    expect(new InfoItem({ id: "i", title: "T" }, "Words", "/play/info/help").action()).toEqual({ type: "route", to: "/play/info/help" });
    expect(new OfferItem({ id: "o", title: "T" }, "-20 %", undefined, undefined, "https://example.com").action()).toEqual({ type: "link", url: "https://example.com" });
    expect(new PackageItem({ id: "k", title: "T" }, undefined, []).action()).toEqual({ type: "package", packageId: "k" });
  });

  it("have their own place among the pictures, which the kind says when the tile has none", () => {
    expect(new InfoItem({ id: "i", title: "T" }, "W").defaultSlot(0)).toBe(0);
    expect(new InfoItem({ id: "i", title: "T" }, "W").defaultSlot(2)).toBe(12);
    expect(new PackageItem({ id: "k", title: "T" }, undefined, []).defaultSlot(1)).toBe(15);
    expect(new OfferItem({ id: "o", title: "T" }, "x", undefined, "/a").defaultSlot(0)).toBe(7);
  });

  it("are checked by one rule, the kind's own part included", () => {
    expect(new InfoItem({ id: "i", title: "T" }, "Words").error()).toBe("");
    expect(new InfoItem({ id: "i", title: " " }, "Words").error()).toMatch(/title/);
    expect(new InfoItem({ id: "i d", title: "T" }, "Words").error()).toMatch(/id/);
    expect(new InfoItem({ id: "i", title: "T" }, "").error()).toMatch(/words/);
    expect(new InfoItem({ id: "i", title: "T", slot: -1 }, "W").error()).toMatch(/place/);
    expect(new InfoItem({ id: "i", title: "T", from: 5, to: 1 }, "W").error()).toMatch(/ends before/);
    expect(new InfoItem({ id: "i", title: "T" }, "W", "//evil.example").error()).toMatch(/route/);
    expect(new OfferItem({ id: "o", title: "T" }, "", undefined, "/a").error()).toMatch(/mark/);
    expect(new OfferItem({ id: "o", title: "T" }, "x").error()).toMatch(/leads somewhere/);
    expect(new OfferItem({ id: "o", title: "T" }, "x", undefined, undefined, "http://example.com").error()).toMatch(/https/);
    expect(new OfferItem({ id: "o", title: "T" }, "x", undefined, undefined, "https://example.com").error()).toBe("");
    expect(new PackageItem({ id: "k", title: "T" }, undefined, ["a b"]).error()).toMatch(/package/);
    expect(new PackageItem({ id: "k", title: "T" }, "Words", ["a", "b"]).error()).toBe("");
  });

  it("are shown from and to a time", () => {
    const item = new InfoItem({ id: "i", title: "T", from: 10, to: 20 }, "W");
    expect(item.isShown(9)).toBe(false);
    expect(item.isShown(10)).toBe(true);
    expect(item.isShown(20)).toBe(true);
    expect(item.isShown(21)).toBe(false);
    expect(new InfoItem({ id: "i", title: "T" }, "W").isShown(1)).toBe(true);
  });
});

describe("the tiles that are kept", () => {
  it("keep only the known fields, trimmed, and only for a kind that is kept", () => {
    const data = FeedItems.stored({ id: "x", kind: "info", title: "  Hello  ", text: "Words", extra: "no", jigsawIds: ["a"], label: "a mark", slot: 3.9 });
    expect(data).toEqual({ id: "x", kind: "info", title: "Hello", text: "Words", label: "a mark", slot: 3 }); // jigsawIds only for a package
    expect(FeedItems.stored({ id: "x", kind: "picture", title: "T" })).toBeNull();
    expect(FeedItems.stored({ id: "x", kind: "nothing" })).toBeNull();
    expect(FeedItems.stored({ id: "x", kind: "package", title: "T" })).toEqual({ id: "x", kind: "package", title: "T", jigsawIds: [] });
  });

  it("are made into the class of their kind, and a document that is not right says why", () => {
    expect(FeedItems.of(FeedItems.stored({ id: "a", kind: "info", title: "T", text: "W" })!)).toBeInstanceOf(InfoItem);
    expect(FeedItems.of(FeedItems.stored({ id: "a", kind: "offer", title: "T", label: "x", route: "/a" })!)).toBeInstanceOf(OfferItem);
    expect(FeedItems.of(FeedItems.stored({ id: "a", kind: "package", title: "T" })!)).toBeInstanceOf(PackageItem);
    expect(FeedItems.error({ id: "a", kind: "info", title: "T", text: "W" })).toBe("");
    expect(FeedItems.error({ id: "a", kind: "info", title: "T" })).toMatch(/words/);
    expect(FeedItems.error({ id: "a", kind: "picture", title: "T" })).toMatch(/Not a kind/);
  });

  it("are the ones that are right and whose time it is, nothing else", () => {
    const docs = [
      { id: "ok", kind: "info", title: "T", text: "W" },
      { id: "bad", kind: "info", title: "T" },
      { id: "later", kind: "info", title: "T", text: "W", from: 100 },
      { id: "over", kind: "info", title: "T", text: "W", to: 5 },
      { id: "nokind", kind: "x", title: "T" },
    ];
    expect(FeedItems.shown(docs, 50).map((i) => i.id)).toEqual(["ok"]);
    expect(FeedItems.shown(docs, 150).map((i) => i.id)).toEqual(["ok", "later"]);
  });

  it("give plain data again for the API", () => {
    const item = FeedItems.of(FeedItems.stored({ id: "o", kind: "offer", title: "T", label: "-20 %", link: "https://example.com", priority: 2 })!);
    expect(FeedItems.dataOf(item)).toEqual({ id: "o", kind: "offer", title: "T", label: "-20 %", link: "https://example.com", priority: 2 });
  });
});

describe("the home page: the pictures with the other tiles among them", () => {
  const info = (id: string, slot?: number, priority = 0) => new InfoItem({ id, title: id, slot, priority }, "W");

  it("puts a tile after as many pictures as its place says", () => {
    expect(ids(HomeFeed.merge(pictures(4), [info("t", 2)], true))).toBe("p0 p1 t p2 p3");
    expect(ids(HomeFeed.merge(pictures(3), [info("t", 0)], true))).toBe("t p0 p1 p2");
  });

  it("keeps a tile that is not loaded yet waiting, so a later page never moves one that is there", () => {
    const first = HomeFeed.merge(pictures(5), [info("a", 2), info("b", 8)], false);
    expect(ids(first)).toBe("p0 p1 a p2 p3 p4"); // b waits: its place is after the eighth picture
    const second = HomeFeed.merge(pictures(10), [info("a", 2), info("b", 8)], false);
    expect(ids(second)).toBe("p0 p1 a p2 p3 p4 p5 p6 p7 b p8 p9");
    expect(ids(second).startsWith(ids(first))).toBe(true); // what was shown is still where it was
  });

  it("puts what waits at the end when there are no more pictures", () => {
    expect(ids(HomeFeed.merge(pictures(2), [info("t", 9)], true))).toBe("p0 p1 t");
    expect(ids(HomeFeed.merge(pictures(0), [info("t", 3)], true))).toBe("t");
    expect(ids(HomeFeed.merge(pictures(0), [info("t", 3)], false))).toBe("");
  });

  it("orders two on the same place by priority, then by id, and numbers the kind by priority", () => {
    expect(ids(HomeFeed.merge(pictures(2), [info("b", 1), info("a", 1), info("c", 1, 5)], true))).toBe("p0 c a b p1");
    // no place of its own: the kind's (an information: 0, 6, 12 ...), the first by priority first
    expect(ids(HomeFeed.merge(pictures(8), [info("low"), info("high", undefined, 3)], true))).toBe("high p0 p1 p2 p3 p4 p5 low p6 p7");
  });

  it("is the pictures alone when there is nothing else", () => {
    expect(ids(HomeFeed.merge(pictures(3), [], false))).toBe("p0 p1 p2");
  });
});

describe("GET /jigsaw-feed", () => {
  const get = (store = dummyFeedStore(), now = () => 1) => request(createJigsawApp({ feed: store, now })).get("/jigsaw/api/jigsaw-feed");

  it("gives the dummy tiles (information, a package, an offer), each in its own form", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const kinds = res.body.items.map((i: { kind: string }) => i.kind);
    expect(kinds).toEqual(expect.arrayContaining(["info", "package", "offer"]));
    const offer = res.body.items.find((i: { kind: string }) => i.kind === "offer");
    expect(offer).toMatchObject({ label: "-20 %", link: "https://karins-jigsaw.web.app" });
    expect(res.body.items.find((i: { kind: string }) => i.kind === "package")).toMatchObject({ jigsawIds: [] });
  });

  it("leaves out what is not right and what is not its time", async () => {
    const store = {
      list: async () => [
        { id: "ok", kind: "info", title: "T", text: "W" },
        { id: "wrong", kind: "offer", title: "T" },
        { id: "later", kind: "info", title: "T", text: "W", from: 1000 },
      ],
    };
    const res = await get(store);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual(["ok"]);
  });

  it("answers that it cannot when the tiles cannot be read, and does not take a body to change them", async () => {
    const down = { list: async () => Promise.reject(new Error("down")) };
    expect((await get(down)).status).toBe(503);
    expect((await request(createJigsawApp({ feed: dummyFeedStore() })).post("/jigsaw/api/jigsaw-feed").send({ id: "x" })).status).toBe(404);
  });
});

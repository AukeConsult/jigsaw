import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import { ListedRound, RoundsList } from "../src/models";
import type { JigsawSpec, PlaySpec } from "../src/models";
import { TEST_KEY_SECRET, memoryPlays, memoryUsers } from "./memory-plays";

// The list of rounds (the button "Rounds" on the front page): the rounds of every user, the person's own too, only those nobody has not moved a piece in left out, on the jigsaws the person may see;
// whose (everybody's, mine, the others'), which (all, finished, ongoing) and in what order (date, player, how far) are chosen, and it is paged. It needs a user (who asks) but no login.

const round = (userId: string, over: Partial<PlaySpec> = {}): ListedRound => ({
  play: { id: `p-${userId}`, jigsawId: "j", userId, userName: userId.toUpperCase(), status: "active", startedAt: 1000, matched: 3, total: 10, storeWidth: 0, overrides: {}, ...over } as PlaySpec,
  jigsaw: { id: "j", name: "J" },
});

describe("RoundsList (which rounds are shown, and in what order)", () => {
  it("has the rounds of everybody, the person's own too, and leaves out a round nobody has moved a piece in, and one with no player", () => {
    const rounds = [round("u2", { id: "a" }), round("u1", { id: "own" }), round("u3", { id: "new", fresh: true }), round("", { id: "nobody" })];
    expect(RoundsList.select(rounds).map((r) => r.play.id)).toEqual(["a", "own"]);
  });

  it("gives the page asked for, how many there are in all, and whether there are more", () => {
    const list = Array.from({ length: 5 }, (_, i) => round(`u${i + 2}`, { id: `r${i}` }));
    expect(RoundsList.page(list, 1, 2)).toMatchObject({ total: 5, hasMore: true, items: [{ play: { id: "r0" } }, { play: { id: "r1" } }] });
    expect(RoundsList.page(list, 3, 2)).toMatchObject({ total: 5, hasMore: false, items: [{ play: { id: "r4" } }] });
    expect(RoundsList.page(list, 9, 2)).toMatchObject({ total: 5, hasMore: false, items: [] });
  });

  it("takes the page, the size and the view from an address, with 1, 20, everybody's, all and the date when they are not said, and refuses what is not allowed", () => {
    expect(RoundsList.parse({})).toEqual({ page: 1, limit: 20, whose: "all", status: "all", sort: "date" });
    expect(RoundsList.parse({ page: "3", limit: "50", whose: "mine", status: "finished", sort: "user" })).toEqual({ page: 3, limit: 50, whose: "mine", status: "finished", sort: "user" });
    for (const bad of [{ page: "0" }, { page: "1.5" }, { page: "x" }, { page: "101" }, { limit: "0" }, { limit: "51" }, { limit: "-2" }, { whose: "me" }, { status: "done" }, { sort: "name" }]) expect(RoundsList.parse(bad)).toHaveProperty("error");
  });

  describe("the view", () => {
    // me is u2: "b" and "d" are theirs
    const rounds = [
      round("u3", { id: "a", userName: "Cy", updatedAt: 300, status: "solved", matched: 10, total: 10 }),
      round("u2", { id: "b", userName: "bo", updatedAt: 200, matched: 6, total: 10 }),
      round("u4", { id: "c", userName: "Anna", updatedAt: 100, matched: 2, total: 10 }),
      round("u2", { id: "d", userName: "bo", updatedAt: 400, matched: 2, total: 10 }),
      round("u5", { id: "e", userName: "Dan", updatedAt: 50, matched: 0, total: 0 }),
    ];
    const ids = (view: Partial<typeof RoundsList.DEFAULT_VIEW>) => RoundsList.arrange(rounds, { ...RoundsList.DEFAULT_VIEW, ...view }, "u2").map((r) => r.play.id);

    it("is everybody's rounds, all of them, the one worked on last first, to begin with", () => {
      expect(RoundsList.DEFAULT_VIEW).toEqual({ whose: "all", status: "all", sort: "date" });
      expect(ids({})).toEqual(["d", "a", "b", "c", "e"]);
    });

    it("keeps only the person's own rounds (mine), or only the others'", () => {
      expect(ids({ whose: "mine" })).toEqual(["d", "b"]);
      expect(ids({ whose: "others" })).toEqual(["a", "c", "e"]);
    });

    it("keeps the finished rounds (solved) or the ongoing ones, with any choice of whose", () => {
      expect(ids({ status: "finished" })).toEqual(["a"]);
      expect(ids({ status: "ongoing" })).toEqual(["d", "b", "c", "e"]);
      expect(ids({ whose: "mine", status: "ongoing" })).toEqual(["d", "b"]);
      expect(ids({ whose: "mine", status: "finished" })).toEqual([]);
    });

    it("puts the players in order of their names, in any case, and a player's own rounds by date", () => {
      expect(ids({ sort: "user" })).toEqual(["c", "d", "b", "a", "e"]);
    });

    it("puts the most finished first, by the pieces in place of all, then by date; a round without pieces is the least", () => {
      expect(ids({ sort: "progress" })).toEqual(["a", "b", "d", "c", "e"]);
      expect(RoundsList.progress({ matched: 5, total: 0 })).toBe(0);
      expect(RoundsList.progress({ matched: 12, total: 10 })).toBe(1);
    });

    it("does not change the list it is given", () => {
      const before = rounds.map((r) => r.play.id);
      RoundsList.arrange(rounds, { whose: "others", status: "ongoing", sort: "user" }, "u2");
      expect(rounds.map((r) => r.play.id)).toEqual(before);
    });

    it("knows a choice that is allowed (what is read back from the device is checked with it)", () => {
      expect(RoundsList.isView({ whose: "mine", status: "finished", sort: "progress" })).toBe(true);
      for (const bad of [null, undefined, "date", {}, { status: "all", sort: "date" }, { whose: "me", status: "all", sort: "date" }, { whose: "all", status: "done", sort: "date" }, { whose: "all", status: "all", sort: "name" }]) expect(RoundsList.isView(bad)).toBe(false);
    });
  });
});

const jigsawOf = (id: string, over: Partial<JigsawSpec> = {}): JigsawSpec => ({ id, name: `Jigsaw ${id}`, width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], createdAt: 1, ownerUid: "u1", ...over });

/** four jigsaws: two that everybody sees (one without a clock), a private one and a hidden one, all owned by u1 */
function memoryJigsaws(): JigsawStore {
  const items = [jigsawOf("pub-aaaaaaaa"), jigsawOf("noclock-bbbbb", { timed: false }), jigsawOf("priv-cccccccc", { visibility: "owner" }), jigsawOf("hid-dddddddd", { visibility: "hidden" })];
  return {
    async list() {
      return [...items];
    },
    async get(id) {
      return items.find((j) => j.id === id) ?? null;
    },
    async add() {
      throw new Error("not used");
    },
    async update() {
      return null;
    },
    async remove() {
      return false;
    },
  };
}

async function setup() {
  const plays = memoryPlays();
  const round = (jigsawId: string, userId: string, over: Partial<PlaySpec> = {}) =>
    plays.create(jigsawId, { jigsawId, userId, userName: userId.toUpperCase(), status: "active", startedAt: 1000, matched: 2, total: 10, storeWidth: 0, overrides: {}, ...over } as never, "{}" as never);
  await round("pub-aaaaaaaa", "u1", { updatedAt: 9999 }); // u1's own
  await round("pub-aaaaaaaa", "u2", { updatedAt: 5000, matched: 6 });
  await round("pub-aaaaaaaa", "u3", { updatedAt: 9000, status: "solved", solvedAt: 9000, matched: 10 });
  await round("noclock-bbbbb", "u2", { updatedAt: 8000, fresh: true }); // nobody has moved a piece
  await round("noclock-bbbbb", "u3", { updatedAt: 7000 });
  await round("priv-cccccccc", "u2", { updatedAt: 6000 }); // a player of the private jigsaw
  await round("hid-dddddddd", "u2", { updatedAt: 6500 }); // on a hidden jigsaw
  const app = createJigsawApp({ jigsaw: memoryJigsaws(), plays, users: memoryUsers("u1", "u2", "u3", "u4"), viewKeySecret: TEST_KEY_SECRET });
  const get = (path: string, user?: string) => request(app).get(`/jigsaw/api/jigsaw-rounds${path}`).set(user ? { "X-Jigsaw-User": user } : {});
  return { app, get, round, plays };
}

const ids = (body: { items: ListedRound[] }) => body.items.map((r) => `${r.play.jigsawId}/${r.play.userId}`);

describe("GET /jigsaw/api/jigsaw-rounds", () => {
  it("needs to know who asks (401 without), and refuses a page, a size or a choice that is not allowed (400)", async () => {
    const { get } = await setup();
    expect((await get("")).status).toBe(401);
    for (const bad of ["?page=0", "?limit=51", "?whose=me", "?status=done", "?sort=name"]) expect((await get(bad, "u1")).status).toBe(400);
  });

  it("gives the rounds of everybody, the person's own too, the one worked on last first, never a round nobody moved a piece in, never a hidden jigsaw's", async () => {
    const { get } = await setup();
    const res = await get("", "u1");
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual(["pub-aaaaaaaa/u1", "pub-aaaaaaaa/u3", "noclock-bbbbb/u3", "priv-cccccccc/u2", "pub-aaaaaaaa/u2"]);
    expect(res.body).toMatchObject({ total: 5, hasMore: false });
  });

  it("keeps only the person's own rounds (mine), or only the others'", async () => {
    const { get } = await setup();
    expect(ids((await get("?whose=mine", "u1")).body)).toEqual(["pub-aaaaaaaa/u1"]);
    expect(ids((await get("?whose=others", "u1")).body)).toEqual(["pub-aaaaaaaa/u3", "noclock-bbbbb/u3", "priv-cccccccc/u2", "pub-aaaaaaaa/u2"]);
    expect(ids((await get("?whose=mine", "u3")).body)).toEqual(["pub-aaaaaaaa/u3", "noclock-bbbbb/u3"]);
    expect(ids((await get("?whose=mine", "u4")).body)).toEqual([]);
  });

  it("does not show the rounds on a private jigsaw to somebody who is not its owner and has no round on it", async () => {
    const { get } = await setup();
    expect(ids((await get("", "u3")).body)).toEqual(["pub-aaaaaaaa/u1", "pub-aaaaaaaa/u3", "noclock-bbbbb/u3", "pub-aaaaaaaa/u2"]); // not u2's round on the private jigsaw
    expect(ids((await get("", "u4")).body)).toEqual(["pub-aaaaaaaa/u1", "pub-aaaaaaaa/u3", "noclock-bbbbb/u3", "pub-aaaaaaaa/u2"]);
  });

  it("shows the rounds on a private jigsaw to a player who has a round on it, theirs and the others'", async () => {
    const { get, round } = await setup();
    await round("priv-cccccccc", "u4", { updatedAt: 100 });
    const all = ids((await get("", "u4")).body);
    expect(all).toContain("priv-cccccccc/u2");
    expect(all).toContain("priv-cccccccc/u4");
    expect(ids((await get("?whose=mine", "u4")).body)).toEqual(["priv-cccccccc/u4"]);
  });

  it("says which jigsaw has no clock, and gives the key of the pictures only for a private jigsaw the person may see", async () => {
    const { get } = await setup();
    const items = (await get("", "u1")).body.items as ListedRound[];
    const of = (id: string) => items.find((r) => r.jigsaw.id === id)!.jigsaw;
    expect(of("noclock-bbbbb")).toMatchObject({ timed: false });
    expect(of("pub-aaaaaaaa")).not.toHaveProperty("timed");
    expect(of("priv-cccccccc").imageKey).toMatch(/^\d+\.[A-Za-z0-9_-]{22}$/);
    expect(of("pub-aaaaaaaa")).not.toHaveProperty("imageKey");
  });

  it("keeps only the finished rounds, or only the ongoing ones, with any choice of whose, and the count is of those", async () => {
    const { get } = await setup();
    const finished = (await get("?status=finished", "u1")).body;
    expect(ids(finished)).toEqual(["pub-aaaaaaaa/u3"]);
    expect(finished).toMatchObject({ total: 1, hasMore: false });
    expect(ids((await get("?status=ongoing", "u1")).body)).toEqual(["pub-aaaaaaaa/u1", "noclock-bbbbb/u3", "priv-cccccccc/u2", "pub-aaaaaaaa/u2"]);
    expect(ids((await get("?whose=mine&status=ongoing", "u1")).body)).toEqual(["pub-aaaaaaaa/u1"]);
    expect(ids((await get("?whose=mine&status=finished", "u1")).body)).toEqual([]);
    expect(ids((await get("?whose=others&status=finished", "u1")).body)).toEqual(["pub-aaaaaaaa/u3"]);
  });

  it("puts the rounds in order of the player's name, or of how far they are", async () => {
    const { get } = await setup();
    expect(ids((await get("?sort=user", "u1")).body)).toEqual(["pub-aaaaaaaa/u1", "priv-cccccccc/u2", "pub-aaaaaaaa/u2", "pub-aaaaaaaa/u3", "noclock-bbbbb/u3"]);
    expect(ids((await get("?sort=progress", "u1")).body)).toEqual(["pub-aaaaaaaa/u3", "pub-aaaaaaaa/u2", "pub-aaaaaaaa/u1", "noclock-bbbbb/u3", "priv-cccccccc/u2"]);
  });

  it("pages the list that was asked for, in its order, with the same total on every page", async () => {
    const { get } = await setup();
    const view = "?sort=user&status=ongoing&whose=all";
    const first = (await get(`${view}&limit=2`, "u1")).body;
    const second = (await get(`${view}&limit=2&page=2`, "u1")).body;
    expect([...ids(first), ...ids(second)]).toEqual(ids((await get(view, "u1")).body));
    expect([first.total, second.total, first.hasMore, second.hasMore]).toEqual([4, 4, true, false]);
  });

  it("has nothing to show when nobody has played", async () => {
    const plays = memoryPlays();
    const app = createJigsawApp({ jigsaw: memoryJigsaws(), plays, users: memoryUsers("u1"), viewKeySecret: TEST_KEY_SECRET });
    expect((await request(app).get("/jigsaw/api/jigsaw-rounds").set({ "X-Jigsaw-User": "u1" })).body).toEqual({ items: [], total: 0, hasMore: false });
  });
});

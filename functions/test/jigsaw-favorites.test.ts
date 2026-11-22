import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { FavoriteStore } from "../src/jigsaw/jigsaw-favorites";
import { JIGSAW_FAVORITES, JigsawFavorites } from "../src/models";
import type { JigsawSpec } from "../src/models";
import { memoryPlays, memoryUsers } from "./memory-plays";

/** the favorites in memory: what the collection `jigsaw-favorites` is in the app, one entry for each user and jigsaw */
function memoryFavorites(): FavoriteStore & { all: Map<string, { userId: string; jigsawId: string; at: number }> } {
  const all = new Map<string, { userId: string; jigsawId: string; at: number }>();
  return {
    all,
    async list(userId) {
      return [...all.values()].filter((f) => f.userId === userId).map((f) => f.jigsawId);
    },
    async add(userId, jigsawId, at) {
      all.set(JigsawFavorites.idOf(userId, jigsawId), { userId, jigsawId, at });
    },
    async remove(userId, jigsawId) {
      all.delete(JigsawFavorites.idOf(userId, jigsawId));
    },
    async removeAllOf(jigsawId) {
      for (const [id, f] of all) if (f.jigsawId === jigsawId) all.delete(id);
    },
  };
}

/** two jigsaws: one for everybody, and one only its owner (u1) sees */
function twoJigsaws() {
  const items: JigsawSpec[] = [
    { id: "open", name: "Open", width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], createdAt: 1, ownerUid: "u1" },
    { id: "secret", name: "Secret", width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], createdAt: 2, ownerUid: "u1", visibility: "owner" },
  ];
  return {
    async list() {
      return [...items];
    },
    async add(input: never) {
      return input as JigsawSpec;
    },
    async update() {
      return null;
    },
    async remove(id: string) {
      const i = items.findIndex((j) => j.id === id);
      if (i < 0) return false;
      items.splice(i, 1);
      return true;
    },
  };
}

describe("a favorite", () => {
  it("is one document for each user and jigsaw, in its own collection, so the same pair is the same document", () => {
    expect(JIGSAW_FAVORITES).toBe("jigsaw-favorites");
    expect(JigsawFavorites.idOf("u1", "j1")).toBe("u1~j1");
    expect(JigsawFavorites.idOf("u_1", "2")).not.toBe(JigsawFavorites.idOf("u", "1_2")); // the two pairs are not mixed up
    expect(JigsawFavorites.stored("u1", "j1", 5)).toEqual({ userId: "u1", jigsawId: "j1", createdAt: 5 });
  });

  it("needs a user and a jigsaw that are ids", () => {
    expect(JigsawFavorites.error("u1", "j1")).toBe("");
    expect(JigsawFavorites.error(undefined, "j1")).toMatch(/who you are/);
    expect(JigsawFavorites.error("a/b", "j1")).toMatch(/who you are/);
    expect(JigsawFavorites.error("u1", "a b")).toMatch(/jigsaw id/);
    expect(JigsawFavorites.error("u1", 5)).toMatch(/jigsaw id/);
  });
});

describe("the favorites of the users", () => {
  const app = (favorites = memoryFavorites(), jigsaw = twoJigsaws()) => ({ favorites, jigsaw, app: createJigsawApp({ favorites, jigsaw: jigsaw as never, plays: memoryPlays(), users: memoryUsers("u1", "u2"), now: () => 99 }) });
  const as = (a: ReturnType<typeof app>, who?: string) => (method: "get" | "put" | "delete", path = "") => {
    const r = request(a.app)[method](`/jigsaw/api/jigsaw-favorites${path}`);
    return who ? r.set("X-Jigsaw-User", who) : r;
  };

  it("makes a jigsaw a favorite, lists them, and takes one away: ticking twice is ticking once, and taking away what is not there is fine", async () => {
    const a = app();
    const u1 = as(a, "u1");
    expect((await u1("get")).body).toEqual({ ids: [] });
    expect((await u1("put", "/open")).status).toBe(204);
    expect((await u1("put", "/open")).status).toBe(204);
    expect((await u1("get")).body).toEqual({ ids: ["open"] });
    expect(a.favorites.all.get("u1~open")).toEqual({ userId: "u1", jigsawId: "open", at: 99 });
    expect((await u1("delete", "/open")).status).toBe(204);
    expect((await u1("delete", "/open")).status).toBe(204);
    expect((await u1("get")).body).toEqual({ ids: [] });
  });

  it("keeps the favorites of each user apart", async () => {
    const a = app();
    await as(a, "u1")("put", "/open");
    expect((await as(a, "u2")("get")).body).toEqual({ ids: [] });
    await as(a, "u2")("put", "/open");
    await as(a, "u1")("delete", "/open");
    expect((await as(a, "u2")("get")).body).toEqual({ ids: ["open"] });
  });

  it("needs a user that exists, a jigsaw that is there, and a jigsaw the user may see", async () => {
    const a = app();
    expect((await as(a)("get")).status).toBe(401); // nobody says who they are
    expect((await as(a, "nobody")("put", "/open")).status).toBe(404); // no such user
    expect((await as(a, "u2")("put", "/missing")).status).toBe(404); // no such jigsaw
    expect((await as(a, "u2")("put", "/secret")).status).toBe(404); // only its owner sees it
    expect((await as(a, "u2")("put", "/a b")).status).toBe(400);
    expect((await as(a, "u1")("put", "/secret")).status).toBe(204); // the owner does
    expect(a.favorites.all.size).toBe(1);
  });

  it("goes with a jigsaw that is deleted, for every user", async () => {
    const a = app();
    await as(a, "u1")("put", "/open");
    await as(a, "u2")("put", "/open");
    await as(a, "u1")("put", "/secret");
    expect((await request(a.app).delete("/jigsaw/api/jigsaw/open").set("X-Jigsaw-User", "u1")).status).toBe(204);
    expect((await as(a, "u1")("get")).body).toEqual({ ids: ["secret"] });
    expect((await as(a, "u2")("get")).body).toEqual({ ids: [] });
  });
});

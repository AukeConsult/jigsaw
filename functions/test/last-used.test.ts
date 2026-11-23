import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import { JigsawUsers } from "../src/models";
import { TEST_KEY_SECRET, memoryPlays, memoryUsers } from "./memory-plays";

// The accounts are listed with the one used last first: choosing an account writes down when (at most once a minute), and an account never chosen comes after those that were.

describe("the order of the accounts", () => {
  it("is the one used last first, then the ones never used, newest made first, then by name", () => {
    const list = [
      { name: "Bo", createdAt: 5 },
      { name: "Anna", createdAt: 1, lastUsedAt: 100 },
      { name: "Cy", createdAt: 9, lastUsedAt: 300 },
      { name: "Al", createdAt: 5 },
    ];
    expect(list.sort(JigsawUsers.byLastUsed).map((u) => u.name)).toEqual(["Cy", "Anna", "Al", "Bo"]);
  });
});

describe("choosing an account", () => {
  const none: JigsawStore = { list: async () => [], get: async () => null, add: async () => { throw new Error("not used"); }, update: async () => null, remove: async () => false };
  it("writes down when, once a minute at most, and the list tells it", async () => {
    const users = memoryUsers("u1");
    let time = 1_000_000;
    const app = createJigsawApp({ users, plays: memoryPlays(), jigsaw: none, viewKeySecret: TEST_KEY_SECRET, now: () => time });
    expect((await request(app).post("/jigsaw/api/jigsaw-users/u1/used")).status).toBe(204);
    expect((await users.get("u1"))?.lastUsedAt).toBe(1_000_000);
    time += 30_000;
    await request(app).post("/jigsaw/api/jigsaw-users/u1/used");
    expect((await users.get("u1"))?.lastUsedAt).toBe(1_000_000); // twice in a minute is one use
    time += 40_000;
    await request(app).post("/jigsaw/api/jigsaw-users/u1/used");
    expect((await users.get("u1"))?.lastUsedAt).toBe(1_070_000);
    expect((await request(app).get("/jigsaw/api/jigsaw-users")).body[0].lastUsedAt).toBe(1_070_000);
    expect((await request(app).post("/jigsaw/api/jigsaw-users/nobody/used")).status).toBe(404);
  });
});

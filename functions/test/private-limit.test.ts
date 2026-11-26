import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { AccountLimits, JigsawSpec, PRIVATE_PICTURES_MAX, UserLevel } from "../src/models";
import { TEST_KEY_SECRET, memoryJigsaws, memoryUsers } from "./memory-plays";

// A verified account that is no publisher has at most 20 pictures that are not public (private and hidden together); a publisher and an admin have no limit.

describe("the limit on pictures that are not public", () => {
  it("is only for a user, and only for what is private or hidden", () => {
    for (const visibility of ["owner", "hidden"]) {
      expect(AccountLimits.privateError("user", visibility, PRIVATE_PICTURES_MAX - 1)).toBe("");
      expect(AccountLimits.privateError("user", visibility, PRIVATE_PICTURES_MAX)).toContain("20");
      expect(AccountLimits.privateError("publisher", visibility, 100)).toBe("");
      expect(AccountLimits.privateError("admin", visibility, 100)).toBe("");
    }
    expect(AccountLimits.privateError("user", "everyone", 100)).toBe("");
    expect(AccountLimits.privateError("user", undefined, 100)).toBe("");
  });

  it("is enforced when a picture is made: the twenty-first is refused, and deleting one makes room", async () => {
    const levels: Record<string, UserLevel> = { pub: "publisher" };
    const users = memoryUsers("plain", "pub");
    const get = users.get.bind(users);
    users.get = async (id) => {
      const found = await get(id);
      return found ? ({ ...found, protected: true } as typeof found) : found; // verified (the flag the page is told, so the gate of this test asks nobody for a token)
    };
    const jigsaws = memoryJigsaws();
    const app = createJigsawApp({
      users,
      levels: { of: async (id) => levels[id ?? ""] ?? "user", forget() {} },
      jigsaw: jigsaws,
      jigsawExists: async () => true,
      viewKeySecret: TEST_KEY_SECRET,
      jigsawSearch: { load: async () => jigsaws.list() as never, forget() {} },
      favorites: { list: async () => [], add: async () => {}, remove: async () => {}, removeAllOf: async () => {} },
    });
    const add = (as: string, visibility: string, n: number) => request(app).post("/jigsaw/api/jigsaw").set("X-Jigsaw-User", as).send({ name: `P${n}`, kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], ownerUid: as, visibility });
    const made: JigsawSpec[] = [];
    for (let i = 0; i < PRIVATE_PICTURES_MAX; i++) made.push((await add("plain", i % 2 ? "hidden" : "owner", i).expect(201)).body as JigsawSpec);
    const refused = await add("plain", "owner", 20);
    expect(refused.status).toBe(403);
    expect(refused.body.error).toContain("20");
    await jigsaws.remove(made[0].id);
    await add("plain", "owner", 21).expect(201);
    for (let i = 0; i < PRIVATE_PICTURES_MAX + 2; i++) await add("pub", "owner", i).expect(201);
  });
});

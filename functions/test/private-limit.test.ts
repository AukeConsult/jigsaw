import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { AccountLimits, Classifications, JigsawSearch, JigsawSpec, PRIVATE_PICTURES_MAX, RECOMMENDED_PICTURES_MAX, UserLevel } from "../src/models";
import { TEST_KEY_SECRET, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

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

describe("the limit on recommended pictures", () => {
  it("is five, for everybody", () => {
    expect(AccountLimits.recommendedError(RECOMMENDED_PICTURES_MAX - 1)).toBe("");
    expect(AccountLimits.recommendedError(RECOMMENDED_PICTURES_MAX)).toContain("5");
  });

  it("is never taken up by the AI", () => {
    expect(Classifications.tidyCategories(["recommended", "nature"])).toEqual(["nature"]);
  });

  it("counts and lists the recommended ones of the user's own", () => {
    const items = [{ id: "a", categories: ["recommended"] }, { id: "b", categories: ["nature"] }].map((j) => ({ name: j.id, createdAt: 0, width: 1, height: 1, gridSize: 0, ...j })) as never;
    const answer = JigsawSearch.mine(items, { text: "", sort: "new", limit: 10, page: 1 }, "recommended");
    expect(answer.items.map((j) => j.id)).toEqual(["a"]);
    expect(answer.counts).toMatchObject({ all: 2, recommended: 1 });
  });

  it("is enforced when a picture is made or changed: the sixth is refused, one that is recommended is saved again, and taking one off makes room", async () => {
    const users = memoryUsers("pub");
    const get = users.get.bind(users);
    users.get = async (id) => {
      const found = await get(id);
      return found ? ({ ...found, protected: true } as typeof found) : found; // verified, so the number of pictures is not what stops it
    };
    const jigsaws = memoryJigsaws();
    const app = createJigsawApp({
      users,
      levels: { of: async () => "publisher" as UserLevel, forget() {} },
      jigsaw: jigsaws,
      jigsawPieces: memoryPieces(),
      plays: memoryPlays(),
      jigsawExists: async () => true,
      viewKeySecret: TEST_KEY_SECRET,
      jigsawSearch: { load: async () => jigsaws.list() as never, forget() {} },
      favorites: { list: async () => [], add: async () => {}, remove: async () => {}, removeAllOf: async () => {} },
    });
    const body = (n: number, categories: string[]) => ({ name: `P${n}`, kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], ownerUid: "pub", categories });
    const add = (n: number, categories: string[]) => request(app).post("/jigsaw/api/jigsaw").set("X-Jigsaw-User", "pub").send(body(n, categories));
    const save = (id: string, n: number, categories: string[]) => request(app).put(`/jigsaw/api/jigsaw/${id}`).set("X-Jigsaw-User", "pub").send(body(n, categories));
    const made: JigsawSpec[] = [];
    for (let i = 0; i < RECOMMENDED_PICTURES_MAX; i++) made.push((await add(i, ["recommended"]).expect(201)).body as JigsawSpec);
    expect((await add(5, ["recommended"])).status).toBe(403);
    const plain = (await add(6, []).expect(201)).body as JigsawSpec;
    expect((await save(plain.id, 6, ["recommended"])).status).toBe(403);
    await save(made[0].id, 0, ["recommended", "nature"]).expect(200);
    await save(made[1].id, 1, []).expect(200);
    await save(plain.id, 6, ["recommended"]).expect(200);
  });
});

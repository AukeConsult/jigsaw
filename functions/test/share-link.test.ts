import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { ShareStore } from "../src/jigsaw/share-link";
import { JigsawSpec, PlaySpec, UserLevel } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// The owner of a private picture sends a link to it: whoever has the link may see that picture and play it, and nothing else. A new link stops the old one.

function memoryShares(): ShareStore {
  const versions = new Map<string, number>();
  return {
    async version(id) {
      return versions.get(id) ?? 0;
    },
    async renew(id) {
      versions.set(id, (versions.get(id) ?? 0) + 1);
    },
  };
}

function setup() {
  const levels: Record<string, UserLevel> = { boss: "admin" };
  const jigsaws = memoryJigsaws();
  const app = createJigsawApp({
    users: memoryUsers("anna", "bo", "boss"),
    levels: { of: async (id) => levels[id ?? ""] ?? "user", forget() {} },
    jigsaw: jigsaws,
    jigsawPieces: memoryPieces(),
    plays: memoryPlays(),
    jigsawImages: memoryImages(),
    jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id),
    viewKeySecret: TEST_KEY_SECRET,
    shares: memoryShares(),
    jigsawSearch: { load: async () => jigsaws.list() as never, forget() {} },
    favorites: { list: async () => [], add: async () => {}, remove: async () => {}, removeAllOf: async () => {} },
  });
  const call = (method: "get" | "post" | "put" | "delete", path: string, as?: string, key?: string) => {
    const r = request(app)[method](`/jigsaw/api${path}`);
    if (as) r.set("X-Jigsaw-User", as);
    if (key) r.set("X-Jigsaw-Share", key);
    return r;
  };
  const picture = async (visibility: string, extra: Record<string, unknown> = {}) =>
    (await call("post", "/jigsaw", "anna").send({ name: "Ours", kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], ownerUid: "anna", visibility, ...extra })).body as JigsawSpec;
  const keyOf = async (id: string) => (await call("get", `/jigsaw/${id}/share`, "anna")).body.key as string;
  const choice = { columns: 5, rows: 4, snapPercent: 25 };
  return { call, picture, keyOf, choice, jigsaws };
}

describe("a link to a private picture", () => {
  it("is given to its owner only", async () => {
    const { call, picture } = setup();
    const p = await picture("owner");
    expect((await call("get", `/jigsaw/${p.id}/share`, "anna")).body.key).toMatch(/^[A-Za-z0-9_-]{32}$/);
    for (const other of ["bo", "boss", undefined]) {
      expect((await call("get", `/jigsaw/${p.id}/share`, other)).status).toBe(404);
      expect((await call("post", `/jigsaw/${p.id}/share`, other)).status).toBe(404);
    }
  });

  it("opens the picture and its file for whoever has it, also without an account", async () => {
    const { call, picture, keyOf } = setup();
    const p = await picture("owner");
    const key = await keyOf(p.id);
    expect((await call("get", `/jigsaw/${p.id}`, "bo")).status).toBe(404);
    expect((await call("get", `/jigsaw/${p.id}`)).status).toBe(404);
    const seen = await call("get", `/jigsaw/${p.id}`, undefined, key);
    expect(seen.status).toBe(200);
    expect(seen.body.imageKey).toBeTruthy(); // the key the picture itself is read with
    expect((await call("get", `/jigsaw/${p.id}`, "bo", "x".repeat(32))).status).toBe(404);
  });

  it("lets the person play it, in a private round, and go on without the link once the round is there", async () => {
    const { call, picture, keyOf, choice } = setup();
    const p = await picture("owner");
    const key = await keyOf(p.id);
    expect((await call("post", `/jigsaw/${p.id}/plays`, "bo").send({ userId: "bo", ...choice })).status).toBe(404); // no link
    const started = await call("post", `/jigsaw/${p.id}/plays`, "bo", key).send({ userId: "bo", ...choice, private: false });
    expect(started.status).toBe(201);
    expect((started.body as PlaySpec).private).toBe(true); // a round through a link is nobody else's to look at
    expect((await call("get", `/jigsaw/${p.id}`, "bo")).status).toBe(200); // a player of it sees it, as before
    expect((await call("get", `/jigsaw/${p.id}/plays/${started.body.id}`, "bo")).status).toBe(200);
  });

  it("opens only the picture it was made for", async () => {
    const { call, picture, keyOf } = setup();
    const p = await picture("owner");
    const other = await picture("owner");
    expect((await call("get", `/jigsaw/${other.id}`, "bo", await keyOf(p.id))).status).toBe(404);
  });

  it("stops working when the owner makes a new one", async () => {
    const { call, picture, keyOf, choice } = setup();
    const p = await picture("owner");
    const old = await keyOf(p.id);
    const renewed = (await call("post", `/jigsaw/${p.id}/share`, "anna")).body.key as string;
    expect(renewed).not.toBe(old);
    expect(await keyOf(p.id)).toBe(renewed);
    expect((await call("get", `/jigsaw/${p.id}`, "bo", old)).status).toBe(404);
    expect((await call("post", `/jigsaw/${p.id}/plays`, "bo", old).send({ userId: "bo", ...choice })).status).toBe(404);
    expect((await call("get", `/jigsaw/${p.id}`, "bo", renewed)).status).toBe(200);
  });

  it("gives no right to change or delete the picture, and does not put it in any list", async () => {
    const { call, picture, keyOf } = setup();
    const p = await picture("owner");
    const key = await keyOf(p.id);
    expect((await call("put", `/jigsaw/${p.id}`, "bo", key).send({ ...p, name: "Mine now" })).status).toBe(404);
    expect((await call("delete", `/jigsaw/${p.id}`, "bo", key)).status).toBe(403);
    expect(((await call("get", "/jigsaw", "bo", key)).body as JigsawSpec[]).map((j) => j.id)).not.toContain(p.id);
  });

  it("is not made for a hidden picture, and an old one does not open a picture that has become hidden", async () => {
    const { call, picture, keyOf, jigsaws } = setup();
    expect((await call("get", `/jigsaw/${(await picture("hidden")).id}/share`, "anna")).status).toBe(409);
    const p = await picture("owner");
    const key = await keyOf(p.id);
    await jigsaws.update(p.id, { ...p, visibility: "hidden" });
    expect((await call("get", `/jigsaw/${p.id}`, "bo", key)).status).toBe(404);
  });
});

import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import { TEST_KEY_SECRET, memoryPlays, memoryUsers } from "./memory-plays";
import { JIGSAW_MAX_PLACED, JigsawSettings } from "../src/models";
import type { JigsawSpec } from "../src/models";

function memoryStore(): JigsawStore {
  const items: JigsawSpec[] = [];
  return {
    async list() {
      return [...items].reverse();
    },
    async add(input) {
      const saved = { id: `id${items.length + 1}`, ...input, createdAt: items.length + 1 };
      items.push(saved);
      return saved;
    },
    async remove(id) {
      const index = items.findIndex((i) => i.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    },
    async update(id, input) {
      const index = items.findIndex((i) => i.id === id);
      if (index < 0) return null;
      items[index] = { ...input, id, createdAt: items[index].createdAt }; // the document is replaced, as Firestore does
      return items[index];
    },
  };
}

describe("jigsaw-list", () => {
  it("gives one jigsaw by its id, and 404 for one that is not there or that a private jigsaw hides", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays(), users: memoryUsers("u1") });
    const input = { name: "Poster", width: 800, height: 600, gridSize: 50, gridVisible: false, placed: [] };
    const open = (await request(app).post("/jigsaw/api/jigsaw").send(input)).body as JigsawSpec;
    const secret = (await request(app).post("/jigsaw/api/jigsaw").send({ ...input, name: "Secret", ownerUid: "u1", visibility: "hidden" })).body as JigsawSpec;
    expect((await request(app).get(`/jigsaw/api/jigsaw/${open.id}`)).body).toMatchObject({ id: open.id, name: "Poster" });
    expect((await request(app).get("/jigsaw/api/jigsaw/nothere")).status).toBe(404);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${secret.id}`)).status).toBe(404); // nobody says who asks
    expect((await request(app).get(`/jigsaw/api/jigsaw/${secret.id}`).set("X-Jigsaw-User", "u1")).body).toMatchObject({ name: "Secret", visibility: "hidden" });
  });

  it("saves a jigsaw and lists it", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const created = await request(app).post("/jigsaw/api/jigsaw").send({ name: " Poster ", width: 800, height: 600, gridSize: 5, gridVisible: false, placed: [] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Poster", width: 800, height: 600, gridSize: 5, gridVisible: false });

    const list = await request(app).get("/jigsaw/api/jigsaw");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Poster");
  });

  it("changes a saved jigsaw in place (autosave), keeping its id", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const made = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [] });
    const changed = { ...jigsaw, name: "Renamed", width: 300, placed: [{ id: "a", centerX: 20, centerY: 20, object: box, evil: 1 }] };
    const res = await request(app).put(`/jigsaw/api/jigsaw/${made.body.id}`).send(changed);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: made.body.id, name: "Renamed", width: 300 });

    const list = await request(app).get("/jigsaw/api/jigsaw");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: "Renamed", width: 300 });
    expect(list.body[0].placed).toEqual([{ id: "a", centerX: 20, centerY: 20, object: box }]);
  });

  it("refuses to change a jigsaw to something invalid, and says 404 for one that is not there", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const made = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [] });
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.body.id}`).send({ ...jigsaw, name: "", placed: [] })).status).toBe(400);
    expect((await request(app).put("/jigsaw/api/jigsaw/nope").send({ ...jigsaw, placed: [] })).status).toBe(404);
  });

  it("deletes a jigsaw, and says 404 for one that is not there", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const a = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [] });
    const b = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, name: "Other", placed: [] });
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${a.body.id}`)).status).toBe(204);
    const list = await request(app).get("/jigsaw/api/jigsaw");
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([b.body.id]);
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${a.body.id}`)).status).toBe(404);
  });

  it("saves the layer of a placed object, and refuses a layer that is not allowed", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const at = (layer: unknown) => ({ id: "p", centerX: 50, centerY: 50, layer, object: box });
    const ok = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [at(25)] });
    expect(ok.status).toBe(201);
    expect(ok.body.placed[0].layer).toBe(25);
    for (const layer of [0, 1001, 1.5, "7"]) {
      expect((await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [at(layer)] })).status).toBe(400);
    }
  });

  it("leaves nothing of an object that was removed from the jigsaw: the saved jigsaw is replaced", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const first = { id: "f", centerX: 50, centerY: 50, object: box };
    const second = { id: "g", centerX: 75, centerY: 50, object: box };
    const made = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [first, second] });
    expect(made.body.placed).toHaveLength(2);

    // the first is deleted on the jigsaw, and the jigsaw is saved without it
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.body.id}`).send({ ...jigsaw, placed: [second] })).status).toBe(200);
    let list = (await request(app).get("/jigsaw/api/jigsaw")).body;
    expect(list).toHaveLength(1);
    expect(list[0].placed.map((p: { id: string }) => p.id)).toEqual(["g"]);
    expect(list[0].createdAt).toBe(made.body.createdAt); // only the creation time is kept

    // and the last object: nothing is left
    await request(app).put(`/jigsaw/api/jigsaw/${made.body.id}`).send({ ...jigsaw, placed: [] });
    list = (await request(app).get("/jigsaw/api/jigsaw")).body;
    expect(list[0].placed).toEqual([]);
  });

  it("accepts grid 0 (no grid)", async () => {
    const res = await request(createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() })).post("/jigsaw/api/jigsaw").send({ name: "x", width: 10, height: 10, gridSize: 0, gridVisible: true, placed: [] });
    expect(res.status).toBe(201);
  });

  const box = { name: "Box", width: 20, height: 20 };
  const jigsaw = { name: "x", width: 100, height: 100, gridSize: 5, gridVisible: true };

  it("saves the objects placed on the jigsaw", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const placed = [{ id: "p1", centerX: 20, centerY: 90, object: { ...box, evil: 1 } }];
    const res = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed });
    expect(res.status).toBe(201);
    expect(res.body.placed).toEqual([{ id: "p1", centerX: 20, centerY: 90, object: box }]);
  });

  it("accepts a centre at the very edge, and a half-pixel centre for an odd size", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const edge = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [{ id: "a", centerX: 10, centerY: 90, object: box }] });
    expect(edge.status).toBe(201);
    const odd = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [{ id: "a", centerX: 10.5, centerY: 10.5, object: { ...box, width: 21, height: 21 } }] });
    expect(odd.status).toBe(201);
  });

  it("saves an object that an older version saved as an arrow without what only an arrow had", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() });
    const arrow = { id: "a", centerX: 50, centerY: 50, length: 30, angle: 0, bend: 8, connections: { start: { objectId: "f", pointId: "e" } }, object: { ...box, kind: "connector", shape: "line", arrow: "one-way", height: 2 } };
    const res = await request(app).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed: [arrow] });
    expect(res.status).toBe(201);
    expect(res.body.placed).toEqual([{ id: "a", centerX: 50, centerY: 50, object: { name: "Box", width: 20, height: 2 } }]);
  });

  it.each([
    ["not a list", "x"],
    ["a bad object", [{ id: "p", centerX: 10, centerY: 10, object: { ...box, width: 0 } }]],
    ["an object without a name", [{ id: "p", centerX: 10, centerY: 10, object: { ...box, name: " " } }]],
    ["a repeated id", [{ id: "p", centerX: 10, centerY: 10, object: box }, { id: "p", centerX: 40, centerY: 10, object: box }]],
    ["a centre that is not a number", [{ id: "p", centerX: "10", centerY: 10, object: box }]],
    ["a centre too near the left edge (further out than the margin)", [{ id: "p", centerX: 1, centerY: 10, object: box }]],
    ["outside to the right", [{ id: "p", centerX: 91, centerY: 10, object: box }]],
    ["outside at the bottom", [{ id: "p", centerX: 10, centerY: 91, object: box }]],
    ["no centre (the old top-left fields)", [{ id: "p", x: 0, y: 0, object: box }]],
    ["too many", Array.from({ length: JIGSAW_MAX_PLACED + 1 }, (_, i) => ({ id: "p" + i, centerX: 10, centerY: 10, object: box }))],
  ])("refuses placed objects: %s", async (_why, placed) => {
    const res = await request(createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() })).post("/jigsaw/api/jigsaw").send({ ...jigsaw, placed });
    expect(res.status).toBe(400);
  });

  it.each([
    [{ name: "", width: 10, height: 10, gridSize: 5, gridVisible: true, placed: [] }],
    [{ name: "x", width: 0, height: 10, gridSize: 5, gridVisible: true, placed: [] }],
    [{ name: "x", width: 10, height: 10001, gridSize: 5, gridVisible: true, placed: [] }],
    [{ name: "x", width: 10.5, height: 10, gridSize: 5, gridVisible: true, placed: [] }],
    [{ name: "x", width: "10", height: 10, gridSize: 5, gridVisible: true, placed: [] }],
    [{ name: "x", width: 10, height: 10, gridVisible: true, placed: [] }],
    [{ name: "x", width: 10, height: 10, gridSize: 5, placed: [] }],
    [{ name: "x", width: 10, height: 10, gridSize: 5, gridVisible: "yes", placed: [] }],
    [{ name: "x", width: 10, height: 10, gridSize: -1, gridVisible: true, placed: [] }],
    [{ name: "x", width: 10, height: 10, gridSize: 1001, gridVisible: true, placed: [] }],
    [{ name: "x", width: 10, height: 10, gridSize: 2.5, gridVisible: true, placed: [] }],
    [{}],
  ])("refuses %j", async (body) => {
    const res = await request(createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryStore(), plays: memoryPlays() })).post("/jigsaw/api/jigsaw").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("the size of a jigsaw whose grid points are half a step in from the edge", () => {
  it("is a whole number of grid steps, at least one and at most what a jigsaw can be", () => {
    expect(JigsawSettings.fittedSide(800, 50)).toBe(800);
    expect(JigsawSettings.fittedSide(810, 50)).toBe(800);
    expect(JigsawSettings.fittedSide(830, 50)).toBe(850);
    expect(JigsawSettings.fittedSide(10, 50)).toBe(50);
    expect(JigsawSettings.fittedSide(10000, 300)).toBe(9900); // not past the biggest jigsaw
    expect(JigsawSettings.fittedSide(777, 0)).toBe(777); // no grid: as it is
  });
});

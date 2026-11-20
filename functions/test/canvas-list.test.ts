import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { CanvasStore } from "../src/canvas-list";
import type { CanvasSpec } from "../src/models";

function memoryStore(): CanvasStore {
  const items: CanvasSpec[] = [];
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

describe("canvas-list", () => {
  it("saves a canvas area and lists it", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const created = await request(app).post("/api/canvas-list").send({ name: " Poster ", width: 800, height: 600, gridSize: 5, gridVisible: false, placed: [] });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: "Poster", width: 800, height: 600, gridSize: 5, gridVisible: false });

    const list = await request(app).get("/api/canvas-list");
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Poster");
  });

  it("changes a saved canvas in place (autosave), keeping its id", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const made = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [] });
    const changed = { ...canvas, name: "Renamed", width: 300, placed: [{ id: "a", centerX: 20, centerY: 20, object: box, evil: 1 }] };
    const res = await request(app).put(`/api/canvas-list/${made.body.id}`).send(changed);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: made.body.id, name: "Renamed", width: 300 });

    const list = await request(app).get("/api/canvas-list");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: "Renamed", width: 300 });
    expect(list.body[0].placed).toEqual([{ id: "a", centerX: 20, centerY: 20, object: box }]);
  });

  it("refuses to change a canvas to something invalid, and says 404 for one that is not there", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const made = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [] });
    expect((await request(app).put(`/api/canvas-list/${made.body.id}`).send({ ...canvas, name: "", placed: [] })).status).toBe(400);
    expect((await request(app).put("/api/canvas-list/nope").send({ ...canvas, placed: [] })).status).toBe(404);
  });

  it("deletes a canvas, and says 404 for one that is not there", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const a = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [] });
    const b = await request(app).post("/api/canvas-list").send({ ...canvas, name: "Other", placed: [] });
    expect((await request(app).delete(`/api/canvas-list/${a.body.id}`)).status).toBe(204);
    const list = await request(app).get("/api/canvas-list");
    expect(list.body.map((c: { id: string }) => c.id)).toEqual([b.body.id]);
    expect((await request(app).delete(`/api/canvas-list/${a.body.id}`)).status).toBe(404);
  });

  it("saves the layer of a placed object, and refuses a layer that is not allowed", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const at = (layer: unknown) => ({ id: "p", centerX: 50, centerY: 50, layer, object: box });
    const ok = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [at(25)] });
    expect(ok.status).toBe(201);
    expect(ok.body.placed[0].layer).toBe(25);
    for (const layer of [0, 1001, 1.5, "7"]) {
      expect((await request(app).post("/api/canvas-list").send({ ...canvas, placed: [at(layer)] })).status).toBe(400);
    }
  });

  it("leaves nothing of an object that was removed from the canvas: the saved canvas is replaced", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const figure = { id: "f", centerX: 50, centerY: 50, object: box };
    const arrowObject = { ...box, kind: "connector", shape: "line", name: "Arr", width: 30, height: 2, borderWidth: 2 };
    const arrow = { id: "a", centerX: 75, centerY: 50, object: arrowObject, connections: { start: { objectId: "f", pointId: "e" } } };
    const made = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [figure, arrow] });
    expect(made.body.placed).toHaveLength(2);

    // the figure is deleted on the canvas: the arrow is free again, and the canvas is saved without the figure
    const freed = { ...arrow, connections: undefined };
    expect((await request(app).put(`/api/canvas-list/${made.body.id}`).send({ ...canvas, placed: [freed] })).status).toBe(200);
    let list = (await request(app).get("/api/canvas-list")).body;
    expect(list).toHaveLength(1);
    expect(list[0].placed.map((p: { id: string }) => p.id)).toEqual(["a"]);
    expect(JSON.stringify(list[0])).not.toContain('"objectId"'); // nothing says the arrow was ever fastened to the figure
    expect(list[0].createdAt).toBe(made.body.createdAt); // only the creation time is kept

    // and the last object: nothing is left
    await request(app).put(`/api/canvas-list/${made.body.id}`).send({ ...canvas, placed: [] });
    list = (await request(app).get("/api/canvas-list")).body;
    expect(list[0].placed).toEqual([]);
  });

  it("refuses a canvas where an arrow is still fastened to a figure that is not there (nothing stale is saved)", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const arrowObject = { ...box, kind: "connector", shape: "line", name: "Arr", width: 30, height: 2, borderWidth: 2 };
    const stale = { id: "a", centerX: 75, centerY: 50, object: arrowObject, connections: { start: { objectId: "gone", pointId: "e" } } };
    expect((await request(app).post("/api/canvas-list").send({ ...canvas, placed: [stale] })).status).toBe(400);
  });

  it("saves the bend of an arrow, and refuses one that is not allowed", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const arrowObject = { ...box, kind: "connector", shape: "line", name: "Arr", width: 30, height: 2, borderWidth: 2 };
    const bentArrow = (bend: unknown) => ({ id: "a", centerX: 50, centerY: 50, object: arrowObject, bend });
    const ok = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [bentArrow(8)] });
    expect(ok.status).toBe(201);
    expect(ok.body.placed[0].bend).toBe(8);
    for (const bend of ["5", 1e9, null]) {
      expect((await request(app).post("/api/canvas-list").send({ ...canvas, placed: [bentArrow(bend)] })).status).toBe(400);
    }
    expect((await request(app).post("/api/canvas-list").send({ ...canvas, placed: [bentArrow(60)] })).status).toBe(400); // the curve leaves the canvas
    expect((await request(app).post("/api/canvas-list").send({ ...canvas, placed: [{ id: "f", centerX: 50, centerY: 50, bend: 5, object: box }] })).status).toBe(400); // a figure cannot be bent
  });

  it("accepts grid 0 (no grid)", async () => {
    const res = await request(createApp({ canvasList: memoryStore() })).post("/api/canvas-list").send({ name: "x", width: 10, height: 10, gridSize: 0, gridVisible: true, placed: [] });
    expect(res.status).toBe(201);
  });

  const box = { kind: "figure", arrow: "one-way", arrowStyle: "solid", name: "Box", shape: "square", width: 20, height: 20, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff", fontSize: 12, cornerRadius: 0 };
  const canvas = { name: "x", width: 100, height: 100, gridSize: 5, gridVisible: true };

  it("saves the objects placed on the canvas", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const placed = [{ id: "p1", centerX: 20, centerY: 90, object: { ...box, evil: 1 } }];
    const res = await request(app).post("/api/canvas-list").send({ ...canvas, placed });
    expect(res.status).toBe(201);
    expect(res.body.placed).toEqual([{ id: "p1", centerX: 20, centerY: 90, object: box }]);
  });

  it("accepts a centre at the very edge, and a half-pixel centre for an odd size", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const edge = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [{ id: "a", centerX: 10, centerY: 90, object: box }] });
    expect(edge.status).toBe(201);
    const odd = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [{ id: "a", centerX: 10.5, centerY: 10.5, object: { ...box, width: 21, height: 21 } }] });
    expect(odd.status).toBe(201);
  });

  // a 20 px square centred at 50,50 (its east point is at 60,50) and a 30 px one-way arrow centred at 75,50 (its start is at 60,50, its end at 90,50)
  const figure = { id: "f", centerX: 50, centerY: 50, object: box };
  const arrowObject = { ...box, kind: "connector", shape: "line", name: "Arr", width: 30, height: 2, borderWidth: 2 };
  const arrow = (connections?: object) => ({ id: "a", centerX: 75, centerY: 50, object: arrowObject, ...(connections ? { connections } : {}) });
  const east = { objectId: "f", pointId: "e" };

  it("saves an arrow that is fastened to a connection point of a figure", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const res = await request(app).post("/api/canvas-list").send({ ...canvas, placed: [figure, { ...arrow({ start: { ...east, evil: 1 } }), connections: { start: { ...east, evil: 1 } } }] });
    expect(res.status).toBe(201);
    expect(res.body.placed[1].connections).toEqual({ start: east });
  });

  it("saves an arrow that is fastened at both ends", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const right = { id: "g", centerX: 100 - 10, centerY: 50, object: box }; // west point at 80,50: not at the arrow's end (90,50) ...
    const exact = { id: "g", centerX: 100, centerY: 50, object: { ...box, width: 20 } }; // ... this one's west point is at 90,50
    const bigCanvas = { ...canvas, width: 200, height: 100 };
    const ok = await request(app).post("/api/canvas-list").send({ ...bigCanvas, placed: [figure, exact, arrow({ start: east, end: { objectId: "g", pointId: "w" } })] });
    expect(ok.status).toBe(201);
    const off = await request(app).post("/api/canvas-list").send({ ...bigCanvas, placed: [figure, right, arrow({ start: east, end: { objectId: "g", pointId: "w" } })] });
    expect(off.status).toBe(400);
  });

  it.each([
    ["to a figure that is not there", { start: { objectId: "nope", pointId: "e" } }],
    ["to an arrow", { start: { objectId: "a", pointId: "start" } }],
    ["to a point the figure does not have", { start: { objectId: "f", pointId: "up" } }],
    ["to a point the arrow is not at", { start: { objectId: "f", pointId: "w" } }],
    ["with its end at a point it is not at", { end: east }],
    ["with an end that is neither start nor end", { middle: east }],
    ["half a pixel from the point it is fastened to", { start: east }, 0.5],
    ["without a point", { start: { objectId: "f" } }],
  ])("refuses an arrow fastened %s", async (_why, connections, shift = 0) => {
    const fastened = { ...arrow(connections), centerX: 75 + shift };
    const res = await request(createApp({ canvasList: memoryStore() })).post("/api/canvas-list").send({ ...canvas, placed: [figure, fastened] });
    expect(res.status).toBe(400);
  });

  it("saves an arrow that is stretched and turned between two figures", async () => {
    const app = createApp({ canvasList: memoryStore() });
    const big = { ...canvas, width: 200, height: 150 };
    const g = { id: "g", centerX: 150, centerY: 100, object: box }; // its west point is at 140,100
    // from the east point of f (60,50) to the west point of g (140,100): centre 100,75, as long and as turned as that
    const stretched = (extra: object = {}) => ({
      id: "a", centerX: 100, centerY: 75, length: Math.hypot(80, 50), angle: Math.atan2(50, 80), object: arrowObject,
      connections: { start: east, end: { objectId: "g", pointId: "w" } }, ...extra,
    });
    const ok = await request(app).post("/api/canvas-list").send({ ...big, placed: [figure, g, stretched()] });
    expect(ok.status).toBe(201);
    expect(ok.body.placed[2]).toMatchObject({ length: Math.hypot(80, 50), angle: Math.atan2(50, 80) });
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [figure, g, stretched({ length: Math.hypot(80, 50) + 1 })] })).status).toBe(400); // an end is off its point
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [figure, g, stretched({ angle: 0.1 })] })).status).toBe(400);
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [figure, { ...g, length: 20 }, stretched()] })).status).toBe(400); // a figure cannot be stretched
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [figure, { ...g, angle: 1 }, stretched()] })).status).toBe(400);
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [{ id: "a", centerX: 100, centerY: 75, length: 0, object: arrowObject }] })).status).toBe(400);
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [{ id: "a", centerX: 100, centerY: 75, length: 150, angle: 0, object: arrowObject }] })).status).toBe(201); // ends at 25,75 and 175,75
    expect((await request(app).post("/api/canvas-list").send({ ...big, placed: [{ id: "a", centerX: 100, centerY: 75, length: 250, angle: 0, object: arrowObject }] })).status).toBe(400); // an end is outside the canvas
  });

  it("refuses connections on a figure", async () => {
    const res = await request(createApp({ canvasList: memoryStore() })).post("/api/canvas-list").send({ ...canvas, placed: [{ ...figure, connections: { start: east } }] });
    expect(res.status).toBe(400);
  });

  it.each([
    ["not a list", "x"],
    ["a bad object", [{ id: "p", centerX: 10, centerY: 10, object: { ...box, shape: "star" } }]],
    ["a repeated id", [{ id: "p", centerX: 10, centerY: 10, object: box }, { id: "p", centerX: 40, centerY: 10, object: box }]],
    ["a centre that is not a number", [{ id: "p", centerX: "10", centerY: 10, object: box }]],
    ["a centre too near the left edge", [{ id: "p", centerX: 9, centerY: 10, object: box }]],
    ["outside to the right", [{ id: "p", centerX: 91, centerY: 10, object: box }]],
    ["outside at the bottom", [{ id: "p", centerX: 10, centerY: 91, object: box }]],
    ["no centre (the old top-left fields)", [{ id: "p", x: 0, y: 0, object: box }]],
    ["too many", Array.from({ length: 201 }, (_, i) => ({ id: "p" + i, centerX: 10, centerY: 10, object: box }))],
  ])("refuses placed objects: %s", async (_why, placed) => {
    const res = await request(createApp({ canvasList: memoryStore() })).post("/api/canvas-list").send({ ...canvas, placed });
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
    const res = await request(createApp({ canvasList: memoryStore() })).post("/api/canvas-list").send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

describe("jigsaw", () => {
  const body = { name: "Puzzle", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [] };

  it("works like canvas-list but keeps its pages in a store of its own", async () => {
    const app = createApp({ canvasList: memoryStore(), jigsaw: memoryStore() });
    const made = await request(app).post("/api/jigsaw").send(body);
    expect(made.status).toBe(201);
    expect((await request(app).get("/api/jigsaw")).body.map((c: { name: string }) => c.name)).toEqual(["Puzzle"]);
    expect((await request(app).get("/api/canvas-list")).body).toEqual([]); // not among the canvases
    expect((await request(app).put(`/api/jigsaw/${made.body.id}`).send({ ...body, name: "Renamed" })).body.name).toBe("Renamed");
    expect((await request(app).post("/api/jigsaw").send({ ...body, width: 0 })).status).toBe(400); // the same checks
    expect((await request(app).delete(`/api/jigsaw/${made.body.id}`)).status).toBe(204);
    expect((await request(app).get("/api/jigsaw")).body).toEqual([]);
  });
});

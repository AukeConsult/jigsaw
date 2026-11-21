import request from "supertest";
import { describe, expect, it } from "vitest";
import { createCanvasApp } from "../src/canvas/app";
import type { CanvasObjectStore } from "../src/canvas/canvas-objects";
import type { CanvasObject } from "../src/models";

function memoryStore(): CanvasObjectStore {
  const items: CanvasObject[] = [];
  return {
    async list() {
      return [...items].reverse();
    },
    async add(input) {
      const saved = { id: `id${items.length + 1}`, ...input, createdAt: items.length + 1 };
      items.push(saved);
      return saved;
    },
    async update(id, input) {
      const index = items.findIndex((i) => i.id === id);
      if (index < 0) return null;
      items[index] = { ...input, id, createdAt: items[index].createdAt }; // the document is replaced, as Firestore does
      return items[index];
    },
    async remove(id) {
      const index = items.findIndex((i) => i.id === id);
      if (index < 0) return false;
      items.splice(index, 1);
      return true;
    },
  };
}

const valid = {
  kind: "figure",
  arrow: "one-way",
  arrowStyle: "solid",
  name: " Box ",
  shape: "square",
  width: 100,
  height: 100,
  borderWidth: 2,
  borderColor: "#212529",
  backgroundColor: "#ffffff",
  frontColor: "#0d6efd",
  fontSize: 16,
  cornerRadius: 10,
};

describe("canvas-objects", () => {
  it("saves an object (only the known fields) and lists it", async () => {
    const app = createCanvasApp({ canvasObjects: memoryStore() });
    const created = await request(app).post("/canvas/api/canvas-objects").send({ ...valid, evil: "x" });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ ...valid, name: "Box" });
    expect(created.body.evil).toBeUndefined();

    const list = await request(app).get("/canvas/api/canvas-objects");
    expect(list.body).toHaveLength(1);
    expect(list.body[0].name).toBe("Box");
  });

  it("accepts every shape, a triangle may have different sides, no border", async () => {
    const app = createCanvasApp({ canvasObjects: memoryStore() });
    for (const shape of ["square", "circle", "triangle", "histogram"]) {
      const res = await request(app).post("/canvas/api/canvas-objects").send({ ...valid, shape, borderWidth: 0 });
      expect(res.status).toBe(201);
    }
    const wide = await request(app).post("/canvas/api/canvas-objects").send({ ...valid, shape: "triangle", width: 200, height: 100 });
    expect(wide.status).toBe(201);
  });

  it("changes a saved object in place (autosave), keeping its id", async () => {
    const app = createCanvasApp({ canvasObjects: memoryStore() });
    const made = await request(app).post("/canvas/api/canvas-objects").send(valid);
    const res = await request(app).put(`/canvas/api/canvas-objects/${made.body.id}`).send({ ...valid, name: "Renamed", width: 150, height: 150, evil: 1 });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: made.body.id, name: "Renamed", width: 150 });
    expect(res.body.evil).toBeUndefined();

    const list = await request(app).get("/canvas/api/canvas-objects");
    expect(list.body).toHaveLength(1);
    expect(list.body[0]).toMatchObject({ name: "Renamed", width: 150 });
  });

  it("refuses to change an object to something invalid, and says 404 for one that is not there", async () => {
    const app = createCanvasApp({ canvasObjects: memoryStore() });
    const made = await request(app).post("/canvas/api/canvas-objects").send(valid);
    expect((await request(app).put(`/canvas/api/canvas-objects/${made.body.id}`).send({ ...valid, shape: "star" })).status).toBe(400);
    expect((await request(app).put("/canvas/api/canvas-objects/nope").send(valid)).status).toBe(404);
  });

  it("deletes an object, and says 404 for one that is not there", async () => {
    const app = createCanvasApp({ canvasObjects: memoryStore() });
    const a = await request(app).post("/canvas/api/canvas-objects").send(valid);
    const b = await request(app).post("/canvas/api/canvas-objects").send({ ...valid, name: "Other" });

    expect((await request(app).delete(`/canvas/api/canvas-objects/${a.body.id}`)).status).toBe(204);
    const list = await request(app).get("/canvas/api/canvas-objects");
    expect(list.body.map((o: CanvasObject) => o.id)).toEqual([b.body.id]);

    expect((await request(app).delete(`/canvas/api/canvas-objects/${a.body.id}`)).status).toBe(404);
  });

  it("allows exactly half the shorter side, and any radius on a circle", async () => {
    const app = createCanvasApp({ canvasObjects: memoryStore() });
    expect((await request(app).post("/canvas/api/canvas-objects").send({ ...valid, cornerRadius: 50 })).status).toBe(201);
    expect((await request(app).post("/canvas/api/canvas-objects").send({ ...valid, shape: "circle", cornerRadius: 4000 })).status).toBe(201);
  });

  it.each([
    [{ name: "" }],
    [{ kind: "line" }],
    [{ kind: undefined }],
    [{ kind: "connector" }], // a connector is a line
    [{ kind: "figure", shape: "line" }],
    [{ shape: "star" }],
    [{ width: 0 }],
    [{ height: 10001 }],
    [{ shape: "square", width: 100, height: 50 }], // a square and a circle have equal sides
    [{ shape: "circle", width: 100, height: 50 }],
    [{ borderWidth: -1 }],
    [{ borderWidth: 101 }],
    [{ borderWidth: 1.5 }],
    [{ borderColor: "red" }],
    [{ backgroundColor: "#fff" }],
    [{ frontColor: 5 }],
    [{ fontSize: 0 }],
    [{ fontSize: 501 }],
    [{ fontSize: 12.5 }],
    [{ fontSize: "16" }],
    [{ fontSize: undefined }],
    [{ cornerRadius: -1 }],
    [{ cornerRadius: 51 }], // more than half of the 100 px sides
    [{ cornerRadius: 2.5 }],
    [{ cornerRadius: "5" }],
    [{ cornerRadius: undefined }],
  ])("refuses %j", async (change) => {
    const res = await request(createCanvasApp({ canvasObjects: memoryStore() })).post("/canvas/api/canvas-objects").send({ ...valid, ...change });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });
});

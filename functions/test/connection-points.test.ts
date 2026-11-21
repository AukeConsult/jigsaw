import request from "supertest";
import { describe, expect, it } from "vitest";
import { createCanvasApp } from "../src/canvas/app";
import type { CanvasObjectStore } from "../src/canvas/canvas-objects";
import { CanvasBaseObject, DEFAULT_CONNECTOR, DEFAULT_OBJECT } from "../src/models";
import type { CanvasObject, CanvasObjectInput } from "../src/models";

/** the connection points of the object with these settings */
const connectionPoints = (o: Partial<CanvasObjectInput>) => CanvasBaseObject.of(o).connectionPoints();
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const point = (o: Pick<CanvasObjectInput, "kind" | "shape" | "width" | "height" | "cornerRadius">, id: string) => connectionPoints(o).find((p) => p.id === id)!;

describe("connection points of a figure", () => {
  it("has 8 on a square, circle and histogram (6 on a triangle), all inside the bounding box, clockwise from the top", () => {
    for (const shape of ["square", "circle", "triangle", "histogram"] as const) {
      const points = connectionPoints({ ...DEFAULT_OBJECT, shape, width: 200, height: 100 });
      expect(points.map((p) => p.id)).toEqual(shape === "triangle" ? ["n", "ne", "se", "s", "sw", "nw"] : ["n", "ne", "e", "se", "s", "sw", "w", "nw"]);
      for (const p of points) {
        expect(p.x).toBeGreaterThanOrEqual(-1e-9);
        expect(p.x).toBeLessThanOrEqual(200 + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(-1e-9);
        expect(p.y).toBeLessThanOrEqual(100 + 1e-9);
      }
    }
  });

  it("square and histogram: the middle of the sides and the corners", () => {
    for (const shape of ["square", "histogram"] as const) {
      const o = { ...DEFAULT_OBJECT, shape, width: 200, height: 100 };
      expect(point(o, "n")).toMatchObject({ x: 100, y: 0 });
      expect(point(o, "e")).toMatchObject({ x: 200, y: 50 });
      expect(point(o, "se")).toMatchObject({ x: 200, y: 100 });
      expect(point(o, "nw")).toMatchObject({ x: 0, y: 0 });
    }
  });

  it("a rounded corner moves the corner points onto the curve", () => {
    const o = { ...DEFAULT_OBJECT, width: 100, height: 100, cornerRadius: 20 };
    const k = 20 * (1 - Math.SQRT1_2);
    near(point(o, "ne").x, 100 - k);
    near(point(o, "ne").y, k);
    expect(point(o, "n")).toMatchObject({ x: 50, y: 0 }); // the sides keep their middle
  });

  it("circle: on the ellipse", () => {
    const o = { ...DEFAULT_OBJECT, shape: "circle" as const, width: 100, height: 100 };
    expect(point(o, "e")).toMatchObject({ x: 100, y: 50 });
    near(point(o, "se").x, 50 + 50 * Math.SQRT1_2);
    near(point(o, "se").y, 50 + 50 * Math.SQRT1_2);
    for (const p of connectionPoints(o)) near(Math.hypot(p.x - 50, p.y - 50), 50);
  });

  it("triangle: its three corners and the middle of its three sides", () => {
    const o = { ...DEFAULT_OBJECT, shape: "triangle" as const, width: 100, height: 80 };
    expect(connectionPoints(o)).toHaveLength(6);
    expect(point(o, "n")).toMatchObject({ x: 50, y: 0 }); // the apex
    expect(point(o, "se")).toMatchObject({ x: 100, y: 80 }); // the corners of the base
    expect(point(o, "sw")).toMatchObject({ x: 0, y: 80 });
    expect(point(o, "s")).toMatchObject({ x: 50, y: 80 }); // the middle of the base
    expect(point(o, "ne")).toMatchObject({ x: 75, y: 40 }); // the middle of the right side: half way between the apex and the corner
    expect(point(o, "nw")).toMatchObject({ x: 25, y: 40 }); // the middle of the left side
  });
});

describe("connection points of a connector", () => {
  it("an arrow one way has a start (the tail) and an end (the tip)", () => {
    expect(connectionPoints({ ...DEFAULT_CONNECTOR, arrow: "one-way", width: 150, height: 4 })).toEqual([
      { id: "start", x: 0, y: 2, role: "start" },
      { id: "end", x: 150, y: 2, role: "end" },
    ]);
  });

  it("an arrow both ways has two points that are each a start and an end", () => {
    expect(connectionPoints({ ...DEFAULT_CONNECTOR, arrow: "both-ways", width: 150, height: 4 })).toEqual([
      { id: "start", x: 0, y: 2, role: "start-end" },
      { id: "end", x: 150, y: 2, role: "start-end" },
    ]);
  });

  it("the points of a figure have no role", () => {
    for (const p of connectionPoints({ ...DEFAULT_OBJECT, width: 50, height: 50 })) expect(p.role).toBeUndefined();
  });
});

describe("canvas-objects: connector", () => {
  const store = (): CanvasObjectStore => {
    const items: CanvasObject[] = [];
    return {
      list: async () => [...items],
      add: async (input) => {
        const saved = { id: `id${items.length + 1}`, ...input, createdAt: 1 };
        items.push(saved);
        return saved;
      },
      remove: async () => true,
      update: async () => null,
    };
  };

  it("saves a connector, and refuses a bad one", async () => {
    const app = createCanvasApp({ canvasObjects: store() });
    const post = (body: object) => request(app).post("/canvas/api/canvas-objects").send({ ...DEFAULT_CONNECTOR, ...body });
    expect((await post({})).status).toBe(201);
    expect((await post({ shape: "square" })).status).toBe(400); // a connector is a line
    expect((await post({ borderWidth: 0, height: 0 })).status).toBe(400); // a line needs a thickness
    expect((await post({ borderWidth: 4 })).status).toBe(400); // the height of a solid arrow is its thickness
    expect((await post({ borderWidth: 4, height: 4 })).status).toBe(201);
  });

  it("a hollow arrow has its own height, and its border is the outline", async () => {
    const app = createCanvasApp({ canvasObjects: store() });
    const post = (body: object) => request(app).post("/canvas/api/canvas-objects").send({ ...DEFAULT_CONNECTOR, arrowStyle: "hollow", ...body });
    expect((await post({ height: 40, borderWidth: 3 })).status).toBe(201);
    expect((await post({ height: 40, borderWidth: 20 })).status).toBe(201); // the outline can be up to half the height
    expect((await post({ height: 40, borderWidth: 21 })).status).toBe(400);
    expect((await post({ height: 0, borderWidth: 1 })).status).toBe(400);
    expect((await post({ height: 40, borderWidth: 0 })).status).toBe(400); // an outline is needed
  });

  it("the arrow heads of a connector are solid or hollow, and nothing else", async () => {
    const app = createCanvasApp({ canvasObjects: store() });
    const post = (body: object) => request(app).post("/canvas/api/canvas-objects").send({ ...DEFAULT_CONNECTOR, ...body });
    expect((await post({ arrowStyle: "solid" })).body.arrowStyle).toBe("solid");
    expect((await post({ arrowStyle: "hollow", height: 40 })).body.arrowStyle).toBe("hollow"); // a hollow arrow has a size of its own
    expect((await post({ arrowStyle: "striped" })).status).toBe(400);
    expect((await post({ arrowStyle: undefined })).status).toBe(400); // a connector must say it
    const { arrowStyle: _style, ...figure } = DEFAULT_OBJECT;
    expect((await request(app).post("/canvas/api/canvas-objects").send(figure)).body.arrowStyle).toBe("solid");
  });

  it("a connector points one way or both ways, and nothing else", async () => {
    const app = createCanvasApp({ canvasObjects: store() });
    const post = (body: object) => request(app).post("/canvas/api/canvas-objects").send({ ...DEFAULT_CONNECTOR, ...body });
    expect((await post({ arrow: "one-way" })).body.arrow).toBe("one-way");
    expect((await post({ arrow: "both-ways" })).body.arrow).toBe("both-ways");
    expect((await post({ arrow: "backwards" })).status).toBe(400);
    expect((await post({ arrow: undefined })).status).toBe(400);
    // a figure has no arrow: the request may leave it out
    const { arrow: _arrow, ...figure } = DEFAULT_OBJECT;
    const res = await request(app).post("/canvas/api/canvas-objects").send(figure);
    expect(res.status).toBe(201);
    expect(res.body.arrow).toBe("one-way");
  });
});

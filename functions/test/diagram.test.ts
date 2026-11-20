import { describe, expect, it } from "vitest";
import { CanvasArea, CanvasDiagram, DEFAULT_CONNECTOR, DEFAULT_OBJECT, PlacedArrow, PlacedBase, PlacedFigure } from "../src/models";

const STEP = 5; // the grid
const square = { ...DEFAULT_OBJECT, width: 100, height: 100 };
const arrowOf = (width = 150) => ({ ...DEFAULT_CONNECTOR, width });
const empty = () => CanvasDiagram.from([], 800, 600);

/** puts the object on the diagram and returns the new diagram and the placed object */
function put(diagram: CanvasDiagram, object: typeof square, x: number, y: number): { diagram: CanvasDiagram; id: string } {
  const result = diagram.place(object, x, y, STEP);
  if ("error" in result) throw new Error(result.error);
  return result;
}

const figure = (d: CanvasDiagram, id: string) => d.get(id) as PlacedFigure;
const arrow = (d: CanvasDiagram, id: string) => d.get(id) as PlacedArrow;
const gap = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe("placing", () => {
  it("puts the centre of an object on a grid point, inside the canvas", () => {
    const a = put(empty(), square, 203, 153);
    expect([figure(a.diagram, a.id).centerX, figure(a.diagram, a.id).centerY]).toEqual([205, 155]);
    const corner = put(empty(), square, 3, 2); // pulled in so the whole object is inside
    expect([figure(corner.diagram, corner.id).centerX, figure(corner.diagram, corner.id).centerY]).toEqual([50, 50]);
  });

  it("refuses an object that is bigger than the canvas, and one too many", () => {
    expect(empty().place({ ...square, width: 900, height: 900 }, 100, 100, STEP)).toEqual({ error: '"New object" is bigger than the canvas.' });
    let d = empty();
    for (let i = 0; i < 200; i++) d = put(d, { ...square, width: 10, height: 10 }, 100, 100).diagram;
    expect(d.place(square, 100, 100, STEP)).toHaveProperty("error");
  });

  it("fastens an arrow dropped near a connection point of a figure, exactly on it", () => {
    const f = put(empty(), square, 200, 250); // the east point is at 250,250
    const a = put(f.diagram, arrowOf(), 325 + 5, 250 + 8); // its start is 5 px right and 8 px below the point
    const placed = arrow(a.diagram, a.id);
    expect(gap(placed.endPoint("start"), { x: 250, y: 250 })).toBeLessThan(1e-9);
    expect(placed.connection("start")).toEqual({ objectId: f.id, pointId: "e" });
    expect(placed.connection("end")).toBeUndefined();
  });

  it("leaves an arrow that is far from every point free", () => {
    const f = put(empty(), square, 200, 250);
    const a = put(f.diagram, arrowOf(), 325 + 40, 250 + 40); // about 56 px from the point
    expect(arrow(a.diagram, a.id).data.connections).toBeUndefined();
  });

  it("fastens a figure dropped near the free end of an arrow", () => {
    const a = put(empty(), arrowOf(), 300, 100); // free: from 225,100 to 375,100
    const f = put(a.diagram, square, 425 + 6, 100 + 4); // its west point is at 381,104 (6 px and 4 px from the end)
    expect(figure(f.diagram, f.id).pointNamed("w")).toMatchObject({ x: 375, y: 100 });
    expect(arrow(f.diagram, a.id).connection("end")).toEqual({ objectId: f.id, pointId: "w" });
  });
});

/** A at 200,250 (east point 250,250) and B at 450,250 (west point 400,250), joined by an arrow of 150 */
function joined() {
  const a = put(empty(), square, 200, 250);
  const b = put(a.diagram, square, 450, 250);
  const arrowPut = put(b.diagram, arrowOf(), 325 + 4, 250 + 3);
  return { diagram: arrowPut.diagram, a: a.id, b: b.id, arrow: arrowPut.id };
}

describe("an arrow between two figures", () => {
  it("is fastened at both ends when both ends are on points", () => {
    const j = joined();
    expect(arrow(j.diagram, j.arrow).data.connections).toEqual({ start: { objectId: j.a, pointId: "e" }, end: { objectId: j.b, pointId: "w" } });
    expect(CanvasDiagram.validate(j.diagram.toData(), 800, 600)).toBe("");
  });

  it("follows a figure that is moved, and the other figure stays", () => {
    const j = joined();
    const moved = j.diagram.moveFigure(j.b, 450, 370, STEP);
    expect([figure(moved, j.b).centerX, figure(moved, j.b).centerY]).toEqual([450, 370]);
    expect([figure(moved, j.a).centerX, figure(moved, j.a).centerY]).toEqual([200, 250]); // A did not move
    const a = arrow(moved, j.arrow);
    expect(gap(a.endPoint("start"), figure(moved, j.a).pointNamed("e")!)).toBeLessThan(1e-9); // the start stayed on A
    expect(gap(a.endPoint("end"), figure(moved, j.b).pointNamed("w")!)).toBeLessThan(1e-9); // the end went with B
    expect(a.length).toBeCloseTo(Math.hypot(150, 120), 9);
    expect(a.angle).toBeCloseTo(Math.atan2(120, 150), 9);
    expect(a.data.connections).toEqual(arrow(j.diagram, j.arrow).data.connections); // still fastened
    expect(CanvasDiagram.validate(moved.toData(), 800, 600)).toBe("");
  });

  it("keeps following through many small moves without the ends drifting", () => {
    const j = joined();
    let d = j.diagram;
    for (let i = 1; i <= 300; i++) d = d.moveFigure(j.b, 450 + (i % 7) * 5, 250 + i, STEP);
    const a = arrow(d, j.arrow);
    expect(gap(a.endPoint("start"), figure(d, j.a).pointNamed("e")!)).toBeLessThan(1e-6);
    expect(gap(a.endPoint("end"), figure(d, j.b).pointNamed("w")!)).toBeLessThan(1e-6);
    expect(CanvasDiagram.validate(d.toData(), 800, 600)).toBe("");
  });

  it("can have its figure moved far, it does not snap back to its own arrow", () => {
    const j = joined();
    const moved = j.diagram.moveFigure(j.b, 600, 500, STEP);
    expect([figure(moved, j.b).centerX, figure(moved, j.b).centerY]).toEqual([600, 500]);
  });

  it("is free again when its figure is removed, and stays where it is", () => {
    const j = joined();
    const before = arrow(j.diagram, j.arrow);
    const removed = j.diagram.remove(j.b);
    const after = arrow(removed, j.arrow);
    expect(removed.get(j.b)).toBeUndefined();
    expect(after.connection("end")).toBeUndefined();
    expect(after.connection("start")).toEqual({ objectId: j.a, pointId: "e" }); // the other end is still on A
    expect(after.endPoint("end")).toEqual(before.endPoint("end"));
  });

  it("moves as a whole, as long and as turned as it is, and is free unless it snaps again", () => {
    const j = joined();
    const stretched = j.diagram.moveFigure(j.b, 450, 370, STEP);
    const before = arrow(stretched, j.arrow);
    const moved = stretched.moveArrow(j.arrow, 150, 450, STEP); // to an empty place
    const after = arrow(moved, j.arrow);
    expect(after.length).toBeCloseTo(before.length, 9);
    expect(after.angle).toBeCloseTo(before.angle, 9);
    expect(after.data.connections).toBeUndefined();
  });
});

describe("moving one end of an arrow", () => {
  const free = () => put(empty(), arrowOf(), 300, 100); // from 225,100 to 375,100

  it("moves that end and leaves the other where it is", () => {
    const a = free();
    const d = a.diagram.moveArrowEnd(a.id, "end", 400, 300, STEP);
    const moved = arrow(d, a.id);
    expect(moved.endPoint("start")).toEqual({ x: 225, y: 100 });
    expect(gap(moved.endPoint("end"), { x: 400, y: 300 })).toBeLessThan(1e-9);
    expect(moved.length).toBeCloseTo(Math.hypot(175, 200), 9);
  });

  it("snaps the end to a figure point and fastens it, and lets go when it is moved off", () => {
    const f = put(empty(), square, 500, 400); // north point at 500,350
    const a = put(f.diagram, arrowOf(), 300, 100);
    const snapped = a.diagram.moveArrowEnd(a.id, "end", 506, 342, STEP);
    expect(arrow(snapped, a.id).connection("end")).toEqual({ objectId: f.id, pointId: "n" });
    expect(gap(arrow(snapped, a.id).endPoint("end"), { x: 500, y: 350 })).toBeLessThan(1e-9);
    expect(gap(arrow(snapped, a.id).endPoint("start"), { x: 225, y: 100 })).toBeLessThan(1e-9);
    const off = snapped.moveArrowEnd(a.id, "end", 650, 500, STEP);
    expect(arrow(off, a.id).connection("end")).toBeUndefined();
    expect(gap(arrow(off, a.id).endPoint("start"), { x: 225, y: 100 })).toBeLessThan(1e-9);
  });

  it("keeps the fastening of the other end", () => {
    const j = joined();
    const d = j.diagram.moveArrowEnd(j.arrow, "end", 650, 500, STEP);
    expect(arrow(d, j.arrow).connection("start")).toEqual({ objectId: j.a, pointId: "e" });
    expect(arrow(d, j.arrow).connection("end")).toBeUndefined();
  });

  it("puts the end on a grid point, inside the canvas", () => {
    const a = free();
    const d = a.diagram.moveArrowEnd(a.id, "end", 403, 297, STEP);
    expect(arrow(d, a.id).endPoint("end").x).toBeCloseTo(405, 9);
    expect(arrow(d, a.id).endPoint("end").y).toBeCloseTo(295, 9);
    const out = a.diagram.moveArrowEnd(a.id, "end", 99999, 99999, STEP);
    expect(arrow(out, a.id).endPoint("end")).toMatchObject({ x: 800, y: 600 });
  });

  it("changes nothing when nothing changes", () => {
    const a = free();
    expect(a.diagram.moveArrowEnd(a.id, "end", 375, 100, STEP)).toBe(a.diagram);
  });

  it("knows which end is grabbed: near one, within 12 px (a quarter of a short arrow)", () => {
    const a = free();
    expect(a.diagram.grabbedEnd(a.id, 230, 104)).toBe("start");
    expect(a.diagram.grabbedEnd(a.id, 380, 95)).toBe("end");
    expect(a.diagram.grabbedEnd(a.id, 300, 100)).toBeUndefined(); // the middle
    const short = put(empty(), arrowOf(20), 300, 100); // 20 long: reach 5
    expect(short.diagram.grabbedEnd(short.id, 296, 100)).toBeUndefined(); // 6 from the start
    expect(short.diagram.grabbedEnd(short.id, 292, 100)).toBe("start"); // 2 from it
  });
});

describe("a figure that is moved near the free end of an arrow", () => {
  it("snaps so its nearest point is on that end, and is fastened to it", () => {
    const a = put(empty(), arrowOf(), 300, 100); // free end at 375,100
    const f = put(a.diagram, square, 200, 400);
    const moved = f.diagram.moveFigure(f.id, 430, 108, STEP); // the west point would be at 380,108: 9.4 px from the end
    expect(gap(figure(moved, f.id).pointNamed("w")!, { x: 375, y: 100 })).toBeLessThan(1e-9);
    expect(arrow(moved, a.id).connection("end")).toEqual({ objectId: f.id, pointId: "w" });
  });

  it("does not snap to an end that is already fastened", () => {
    const j = joined();
    const other = put(j.diagram, square, 100, 500);
    const moved = other.diagram.moveFigure(other.id, 410, 250, STEP); // near B's end of the arrow, which is fastened
    expect(arrow(moved, j.arrow).connection("end")).toEqual({ objectId: j.b, pointId: "w" });
  });
});

describe("resizing a figure by a handle", () => {
  const box = { ...DEFAULT_OBJECT, shape: "triangle" as const, width: 100, height: 60 }; // a figure with two sides of its own
  const at = (shape: "square" | "triangle" | "circle", w: number, h: number) => {
    const p = put(empty(), { ...DEFAULT_OBJECT, shape, width: w, height: h }, 300, 300); // centre 300,300
    return { ...p, size: (d: CanvasDiagram) => [figure(d, p.id).object.width, figure(d, p.id).object.height] };
  };

  it("has 8 handles, on the corners and the middle of the sides", () => {
    const p = put(empty(), box, 300, 300);
    const handles = figure(p.diagram, p.id).handles();
    expect(handles.map((h) => h.id)).toEqual(["n", "ne", "e", "se", "s", "sw", "w", "nw"]);
    expect(handles.find((h) => h.id === "se")).toMatchObject({ x: 350, y: 330 });
    expect(handles.find((h) => h.id === "w")).toMatchObject({ x: 250, y: 300, dx: -1, dy: 0 });
  });

  it("moves the corner and keeps the opposite corner", () => {
    const f = at("triangle", 100, 60); // spans 250..350 x 270..330
    const d = f.diagram.resizeFigure(f.id, "se", 400, 380, STEP);
    expect(f.size(d)).toEqual([150, 110]);
    const placed = figure(d, f.id);
    expect([placed.left, placed.top]).toEqual([250, 270]); // the top-left corner stayed
    expect(placed.points().find((p) => p.id === "se")).toMatchObject({ x: 400, y: 380 });
  });

  it("moves a side and keeps the other axis as it is", () => {
    const f = at("triangle", 100, 60);
    const d = f.diagram.resizeFigure(f.id, "w", 200, 999, STEP); // the west edge to 200: the y of the pointer does not matter
    expect(f.size(d)).toEqual([150, 60]);
    expect([figure(d, f.id).left + figure(d, f.id).object.width, figure(d, f.id).top]).toEqual([350, 270]); // the east edge and the top stayed
  });

  it("puts the dragged edge on the grid", () => {
    const f = at("triangle", 100, 60);
    expect(f.size(f.diagram.resizeFigure(f.id, "e", 403, 300, STEP))).toEqual([155, 60]); // 403 -> 405, from the west edge at 250
    expect(f.size(f.diagram.resizeFigure(f.id, "e", 402, 300, STEP))).toEqual([150, 60]); // 402 -> 400
  });

  it("keeps a square and a circle equal-sided: a corner gives the longer side, a side resizes around its centre line", () => {
    const sq = at("square", 100, 100);
    // the south-east corner dragged to 400,360: 150 wide, 110 high -> the longer side, 150
    expect(sq.size(sq.diagram.resizeFigure(sq.id, "se", 400, 360, STEP))).toEqual([150, 150]);
    const circle = at("circle", 100, 100);
    const d = circle.diagram.resizeFigure(circle.id, "e", 450, 123, STEP); // a side: that axis gives the size, the centre line stays
    expect(circle.size(d)).toEqual([200, 200]);
    expect(figure(d, circle.id).centerY).toBe(300);
  });

  it("stays inside the canvas and keeps a minimum size", () => {
    const f = at("triangle", 100, 60);
    const big = f.diagram.resizeFigure(f.id, "se", 99999, 99999, STEP);
    expect(f.size(big)).toEqual([550, 330]); // from 250,270 to the canvas edge 800,600
    const small = f.diagram.resizeFigure(f.id, "se", 0, 0, STEP); // dragged past the anchor
    expect(f.size(small)).toEqual([4, 4]);
    expect(CanvasDiagram.validate(big.toData(), 800, 600)).toBe("");
    expect(CanvasDiagram.validate(small.toData(), 800, 600)).toBe("");
  });

  it("keeps the corner radius at most half of the shorter side", () => {
    const p = put(empty(), { ...DEFAULT_OBJECT, shape: "square", width: 100, height: 100, cornerRadius: 40 }, 300, 300);
    const d = p.diagram.resizeFigure(p.id, "se", 280, 280, STEP); // down to 30: the radius cannot be more than 15
    expect(figure(d, p.id).object.cornerRadius).toBe(15);
    expect(CanvasDiagram.validate(d.toData(), 800, 600)).toBe("");
  });

  it("makes the arrows fastened to the figure follow its points", () => {
    const j = joined(); // A at 200,250 (100 square), B at 450,250, an arrow from A's east point to B's west point
    const d = j.diagram.resizeFigure(j.b, "w", 350, 250, STEP); // B's west edge from 400 to 350: its west point moves with it
    const a = arrow(d, j.arrow);
    expect(gap(a.endPoint("end"), figure(d, j.b).pointNamed("w")!)).toBeLessThan(1e-9);
    expect(gap(a.endPoint("end"), { x: 350, y: 250 })).toBeLessThan(1e-9);
    expect(gap(a.endPoint("start"), figure(d, j.a).pointNamed("e")!)).toBeLessThan(1e-9); // the other end stayed on A
    expect(a.length).toBeCloseTo(100, 9);
    expect(CanvasDiagram.validate(d.toData(), 800, 600)).toBe("");
  });

  it("changes nothing when nothing changes, and does nothing for an arrow", () => {
    const f = at("triangle", 100, 60);
    expect(f.diagram.resizeFigure(f.id, "e", 350, 300, STEP)).toBe(f.diagram);
    const a = put(empty(), arrowOf(), 300, 100);
    expect(a.diagram.resizeFigure(a.id, "e", 400, 100, STEP)).toBe(a.diagram);
  });
});

describe("a group of objects", () => {
  const tri = { ...DEFAULT_OBJECT, shape: "triangle" as const, width: 100, height: 60 };

  /** two triangles: T1 at 200,200 (150..250 x 170..230) and T2 at 400,300 (350..450 x 270..330) */
  function triangles() {
    const t1 = put(empty(), tri, 200, 200);
    const t2 = put(t1.diagram, tri, 400, 300);
    return { diagram: t2.diagram, t1: t1.id, t2: t2.id };
  }

  it("has a box around all its objects (an arrow: its two ends)", () => {
    const j = joined(); // A 150..250 x 200..300, B 400..500, the arrow from 250,250 to 400,250
    expect(j.diagram.boundsOf([j.a, j.b, j.arrow])).toEqual({ left: 150, top: 200, width: 350, height: 100 });
    expect(j.diagram.boundsOf([j.arrow])).toEqual({ left: 250, top: 250, width: 150, height: 0 });
    expect(j.diagram.boundsOf(["nothing"])).toBeNull();
  });

  it("finds the objects that a rectangle touches", () => {
    const j = joined();
    expect(j.diagram.itemsIn({ left: 100, top: 150, width: 200, height: 200 }).sort()).toEqual([j.a, j.arrow].sort());
    expect(j.diagram.itemsIn({ left: 600, top: 400, width: 50, height: 50 })).toEqual([]);
    expect(j.diagram.itemsIn({ left: 300, top: 252, width: 20, height: 20 })).toEqual([j.arrow]); // 2 px below the thin line: still touched
  });

  it("scales sizes and positions about the edge that stays, and the figures keep their shape", () => {
    const g = triangles(); // the box: 150..450 x 170..330
    const d = g.diagram.resizeGroup([g.t1, g.t2], "se", 600, 490, STEP); // 450 wide (x1.5), 320 high (x2): the positions follow each, the sizes the bigger change
    const a = figure(d, g.t1);
    const b = figure(d, g.t2);
    expect([a.object.width, a.object.height, a.centerX, a.centerY]).toEqual([200, 120, 225, 230]); // 100x60 -> 200x120: the same shape
    expect([b.object.width, b.object.height, b.centerX, b.centerY]).toEqual([200, 120, 525, 430]);
    expect(CanvasDiagram.validate(d.toData(), 800, 600)).toBe("");
  });
  it("moves the positions only along the axis of a side handle, the figures still keep their shape", () => {
    const g = triangles();
    const d = g.diagram.resizeGroup([g.t1, g.t2], "e", 600, 12, STEP); // x1.5 along x
    expect([figure(d, g.t1).object.width, figure(d, g.t1).object.height]).toEqual([150, 90]); // 100x60 -> 150x90
    expect(figure(d, g.t1).centerY).toBe(200); // the positions along y did not move
    expect(figure(d, g.t2).centerY).toBe(300);
    expect(figure(d, g.t2).centerX).toBe(150 + (400 - 150) * 1.5);
  });
  it("keeps squares equal-sided when a group is stretched, and they follow the factor that changed more", () => {
    const a = put(empty(), square, 200, 250);
    const b = put(a.diagram, square, 450, 250);
    const stretched = b.diagram.resizeGroup([a.id, b.id], "se", 700, 330, STEP); // box 150..500 x 200..300 -> 550 wide (x1.5714), 130 high (x1.3)
    expect([figure(stretched, a.id).object.width, figure(stretched, a.id).object.height]).toEqual([157, 157]); // still a square
    expect(CanvasDiagram.validate(stretched.toData(), 800, 600)).toBe("");
  });
  it("stretches an arrow, and keeps the ends that are fastened on their figures", () => {
    const j = joined(); // A and B squares with the arrow between them
    const d = j.diagram.resizeGroup([j.a, j.b, j.arrow], "e", 650, 250, STEP); // the box 150..500 -> 150..650: x(500/350)
    const a = arrow(d, j.arrow);
    expect(gap(a.endPoint("start"), figure(d, j.a).pointNamed("e")!)).toBeLessThan(1e-9);
    expect(gap(a.endPoint("end"), figure(d, j.b).pointNamed("w")!)).toBeLessThan(1e-9);
    expect(a.data.connections).toEqual(arrow(j.diagram, j.arrow).data.connections);
    expect(a.length).toBeGreaterThan(150); // the squares grow with the group and the arrow stretches between them
    expect(CanvasDiagram.validate(d.toData(), 800, 600)).toBe("");
  });

  it("scales the thickness of a solid arrow and the height and outline of a hollow one with the group", () => {
    const g = triangles(); // the box 150..450 x 170..330
    const solid = put(g.diagram, arrowOf(100), 300, 400); // thickness 2
    const hollow = put(solid.diagram, { ...arrowOf(100), arrowStyle: "hollow" as const, height: 40, borderWidth: 4 }, 300, 440);
    const all = [g.t1, g.t2, solid.id, hollow.id];
    const box = hollow.diagram.boundsOf(all)!;
    const bigger = hollow.diagram.resizeGroup(all, "se", box.left + box.width * 1.5, box.top + box.height * 1.5, 1); // both factors about 1.5 (the grid is 1 px)
    expect(arrow(bigger, solid.id).object.borderWidth).toBe(3);
    expect(arrow(bigger, solid.id).object.height).toBe(3); // a solid arrow's height is its thickness
    expect(arrow(bigger, hollow.id).object.height).toBe(60);
    expect(arrow(bigger, hollow.id).object.borderWidth).toBe(6);
    expect(CanvasDiagram.validate(bigger.toData(), 800, 600)).toBe("");
    const smaller = hollow.diagram.resizeGroup(all, "se", box.left + box.width * 0.5, box.top + box.height * 0.5, 1);
    expect(arrow(smaller, solid.id).object.borderWidth).toBe(1); // at least a pixel
    expect(arrow(smaller, hollow.id).object.height).toBe(20);
    expect(arrow(smaller, hollow.id).object.borderWidth).toBe(2);
    expect(CanvasDiagram.validate(smaller.toData(), 800, 600)).toBe("");
  });

  it("keeps the outline of a hollow arrow at most half of its height, and scales the thickness when only one axis is scaled", () => {
    const g = triangles();
    const hollow = put(g.diagram, { ...arrowOf(100), arrowStyle: "hollow" as const, height: 40, borderWidth: 20 }, 300, 520); // the outline is already half the height
    const ids = [g.t1, g.t2, hollow.id];
    const box = hollow.diagram.boundsOf(ids)!;
    const small = hollow.diagram.resizeGroup(ids, "se", box.left + box.width * 0.7, box.top + box.height * 0.7, 1);
    const o = arrow(small, hollow.id).object;
    expect(o.borderWidth * 2).toBeLessThanOrEqual(o.height);
    expect(CanvasDiagram.validate(small.toData(), 800, 600)).toBe("");
    const wide = hollow.diagram.resizeGroup(ids, "e", box.left + box.width * 1.5, 0, 1); // only along x: the thickness follows that factor
    expect(arrow(wide, hollow.id).object.height).toBe(60);
    expect(arrow(wide, hollow.id).object.borderWidth).toBe(30);
  });

  it("makes squares and circles follow a group that is made bigger or smaller, along one axis or both, and stay square and round", () => {
    const sq = put(empty(), square, 200, 200); // 150..250 x 150..250
    const circle = put(sq.diagram, { ...DEFAULT_OBJECT, shape: "circle" as const, width: 100, height: 100 }, 450, 200); // 400..500
    const ids = [sq.id, circle.id];
    const dims = (g: CanvasDiagram) => [figure(g, sq.id).object.width, figure(g, sq.id).object.height, figure(g, circle.id).object.width, figure(g, circle.id).object.height];
    const box = circle.diagram.boundsOf(ids)!; // 150..500 x 150..250
    expect(dims(circle.diagram.resizeGroup(ids, "e", box.left + box.width * 1.4, 0, 1))).toEqual([140, 140, 140, 140]); // along x only
    expect(dims(circle.diagram.resizeGroup(ids, "s", 0, box.top + box.height * 1.5, 1))).toEqual([150, 150, 150, 150]); // along y only
    expect(dims(circle.diagram.resizeGroup(ids, "se", box.left + box.width * 1.2, box.top + box.height * 2, 1))).toEqual([200, 200, 200, 200]); // both
    expect(dims(circle.diagram.resizeGroup(ids, "e", box.left + box.width * 0.5, 0, 1))).toEqual([50, 50, 50, 50]); // smaller
    for (const g of [circle.diagram.resizeGroup(ids, "e", box.left + box.width * 1.4, 0, 1), circle.diagram.resizeGroup(ids, "se", box.left + box.width * 0.5, box.top + box.height * 0.5, 1)]) {
      expect(CanvasDiagram.validate(g.toData(), 800, 600)).toBe("");
    }
  });
  it("stretches a free arrow with the rest", () => {
    const g = triangles();
    const free = put(g.diagram, arrowOf(100), 300, 450); // 250..350 at y 450
    const d = free.diagram.resizeGroup([g.t1, g.t2, free.id], "se", 600, 590, STEP); // the box 150..450 x 170..450 -> 450 wide (x1.5), 420 high (x1.5)
    const a = arrow(d, free.id);
    expect(gap(a.endPoint("start"), { x: 150 + (250 - 150) * 1.5, y: 170 + (450 - 170) * 1.5 })).toBeLessThan(1e-9);
    expect(gap(a.endPoint("end"), { x: 150 + (350 - 150) * 1.5, y: 170 + (450 - 170) * 1.5 })).toBeLessThan(1e-9);
  });

  it("stays inside the canvas and keeps the figures at least 4 px", () => {
    const g = triangles();
    const big = g.diagram.resizeGroup([g.t1, g.t2], "se", 99999, 99999, STEP);
    for (const id of [g.t1, g.t2]) {
      const f = figure(big, id);
      expect(f.left).toBeGreaterThanOrEqual(0);
      expect(f.top).toBeGreaterThanOrEqual(0);
      expect(f.left + f.object.width).toBeLessThanOrEqual(800);
      expect(f.top + f.object.height).toBeLessThanOrEqual(600);
    }
    const small = g.diagram.resizeGroup([g.t1, g.t2], "se", 0, 0, STEP);
    for (const id of [g.t1, g.t2]) {
      expect(figure(small, id).object.width).toBeGreaterThanOrEqual(4);
      expect(figure(small, id).object.height).toBeGreaterThanOrEqual(4);
    }
    expect(CanvasDiagram.validate(big.toData(), 800, 600)).toBe("");
    expect(CanvasDiagram.validate(small.toData(), 800, 600)).toBe("");
  });
  it("changes nothing for one object, or when the box is not changed", () => {
    const g = triangles();
    expect(g.diagram.resizeGroup([g.t1], "se", 600, 490, STEP)).toBe(g.diagram);
    expect(g.diagram.resizeGroup([g.t1, g.t2], "se", 450, 330, STEP)).toBe(g.diagram); // the corner where it is
  });

  it("removes several objects at once, and frees the arrows that were fastened to them", () => {
    const j = joined();
    const d = j.diagram.removeAll([j.a, j.b]);
    expect(d.items.map((p) => p.id)).toEqual([j.arrow]);
    expect(arrow(d, j.arrow).data.connections).toBeUndefined();
  });
});

describe("layers", () => {
  const layerOf = (d: CanvasDiagram, id: string) => d.get(id)!.layer;

  it("has the canvas as layer 0 always, and puts the first object on layer 10", () => {
    expect(empty().layers()).toEqual([0]);
    expect(empty().lastLayer()).toBe(10);
    const a = put(empty(), square, 200, 200);
    expect(layerOf(a.diagram, a.id)).toBe(10);
    expect(a.diagram.layers()).toEqual([0, 10]);
  });

  it("puts a new object on the last layer, the highest one in use", () => {
    const a = put(empty(), square, 200, 200);
    const raised = a.diagram.setLayer([a.id], 25);
    expect(raised.lastLayer()).toBe(25);
    const b = put(raised, square, 450, 200);
    expect(layerOf(b.diagram, b.id)).toBe(25);
    expect(b.diagram.layers()).toEqual([0, 25]);
    const low = b.diagram.setLayer([a.id], 3); // the last layer is still the highest, 25
    const c = put(low, square, 450, 400);
    expect(layerOf(c.diagram, c.id)).toBe(25);
    expect(low.layers()).toEqual([0, 3, 25]);
  });

  it("goes back to layer 10 when no object is left", () => {
    const a = put(empty(), square, 200, 200);
    expect(a.diagram.setLayer([a.id], 40).remove(a.id).lastLayer()).toBe(10);
  });

  it("puts objects on a layer from 1 to 1000, never on the canvas layer", () => {
    const a = put(empty(), square, 200, 200);
    expect(layerOf(a.diagram.setLayer([a.id], 0), a.id)).toBe(1);
    expect(layerOf(a.diagram.setLayer([a.id], -5), a.id)).toBe(1);
    expect(layerOf(a.diagram.setLayer([a.id], 5000), a.id)).toBe(1000);
    expect(layerOf(a.diagram.setLayer([a.id], 7.6), a.id)).toBe(8);
  });

  it("changes the layer of several objects, and nothing when nothing changes", () => {
    const a = put(empty(), square, 200, 200);
    const b = put(a.diagram, square, 450, 200);
    const d = b.diagram.setLayer([a.id, b.id], 30);
    expect([layerOf(d, a.id), layerOf(d, b.id)]).toEqual([30, 30]);
    expect(d.setLayer([a.id, b.id], 30)).toBe(d);
    expect(b.diagram.setLayer(["nothing"], 30)).toBe(b.diagram);
  });

  it("keeps the layer through moving, resizing and fastening", () => {
    const j = joined();
    const raised = j.diagram.setLayer([j.a, j.b, j.arrow], 20);
    const moved = raised.moveFigure(j.b, 450, 370, STEP).resizeFigure(j.a, "se", 300, 330, STEP).moveArrowEnd(j.arrow, "end", 600, 500, STEP);
    for (const id of [j.a, j.b, j.arrow]) expect(layerOf(moved, id)).toBe(20);
    const group = raised.resizeGroup([j.a, j.b, j.arrow], "se", 600, 400, STEP);
    for (const id of [j.a, j.b, j.arrow]) expect(layerOf(group, id)).toBe(20);
  });

  it("is on the default layer when it was stored without one, and is checked when it has one", () => {
    const stored = { id: "x", object: square, centerX: 100, centerY: 100 };
    expect(CanvasDiagram.from([stored], 800, 600).get("x")!.layer).toBe(10);
    expect(CanvasDiagram.validate([stored], 800, 600)).toBe("");
    for (const layer of [0, -1, 1001, 2.5, "10", null]) {
      expect(CanvasDiagram.validate([{ ...stored, layer }], 800, 600)).toContain("layer");
    }
    expect(CanvasDiagram.validate([{ ...stored, layer: 1 }, { ...stored, id: "y", layer: 1000 }], 800, 600)).toBe("");
  });
});

describe("the bend of an arrow", () => {
  const along = () => put(empty(), arrowOf(150), 300, 300); // along x, ends at 225,300 and 375,300
  const straightArrow = () => {
    const p = along();
    return arrow(p.diagram, p.id);
  };

  it("has a middle: the third point, half way along its curve, to the side by its bend", () => {
    const a = along();
    const straight = arrow(a.diagram, a.id);
    expect(straight.bend).toBe(0);
    expect(gap(straight.middle(), { x: 300, y: 300 })).toBeLessThan(1e-9);
    const bent = straight.withBend(30);
    expect(bent.bend).toBe(30);
    expect(gap(bent.middle(), { x: 300, y: 330 })).toBeLessThan(1e-9); // 30 px down
    expect(gap(bent.curve().at(0.5), bent.middle())).toBeLessThan(1e-9); // the middle is on the curve
    expect(gap(bent.curve().at(0), bent.endPoint("start"))).toBeLessThan(1e-9);
    expect(gap(bent.curve().at(1), bent.endPoint("end"))).toBeLessThan(1e-9);
    const turned = new PlacedArrow({ ...bent.data, angle: Math.PI / 2, length: 150 }); // pointing down: the side is to the left
    expect(gap(turned.middle(), { x: 270, y: 300 })).toBeLessThan(1e-9);
  });

  it("takes the bend from a pointer, a few pixels are straight, and it stays within what can be", () => {
    const a = straightArrow();
    expect(a.sidewaysOf({ x: 300, y: 340 })).toBe(40);
    expect(a.withBend(a.sidewaysOf({ x: 300, y: 340 })).bend).toBe(40);
    expect(a.withBend(3).data.bend).toBeUndefined(); // 3 px or less: straight, the field is not kept
    expect(a.withBend(30).withBend(-2).data.bend).toBeUndefined();
    expect(a.withBend(-40).bend).toBe(-40); // to the other side
    expect(a.withBend(30.3).bend).toBe(30.5); // half pixels
    expect(a.withBend(1e9).bend).toBe(20000);
  });

  it("changes the diagram, and nothing when nothing changes; only an arrow can be bent", () => {
    const a = along();
    const bent = a.diagram.bendArrow(a.id, 40);
    expect(arrow(bent, a.id).bend).toBe(40);
    expect(bent.bendArrow(a.id, 40)).toBe(bent);
    expect(a.diagram.bendArrow(a.id, 2)).toBe(a.diagram); // straight stays straight
    const f = put(empty(), square, 200, 200);
    expect(f.diagram.bendArrow(f.id, 40)).toBe(f.diagram);
    expect(CanvasDiagram.validate(bent.toData(), 800, 600)).toBe("");
  });

  it("keeps the ends and what is fastened when it is bent, and the bend when an end moves or a figure follows", () => {
    const j = joined();
    const bent = j.diagram.bendArrow(j.arrow, 40);
    const a = arrow(bent, j.arrow);
    expect(gap(a.endPoint("start"), arrow(j.diagram, j.arrow).endPoint("start"))).toBeLessThan(1e-9);
    expect(a.data.connections).toEqual(arrow(j.diagram, j.arrow).data.connections);
    const moved = bent.moveFigure(j.b, 450, 370, STEP); // B moves: the arrow follows, still bent
    expect(arrow(moved, j.arrow).bend).toBe(40);
    const endMoved = bent.moveArrowEnd(j.arrow, "end", 650, 500, STEP);
    expect(arrow(endMoved, j.arrow).bend).toBe(40);
    expect(CanvasDiagram.validate(moved.toData(), 800, 600)).toBe("");
  });

  it("has bounds that hold its curve, and has to fit in the canvas with its curve", () => {
    const a = along();
    const bent = a.diagram.bendArrow(a.id, 60);
    expect(arrow(bent, a.id).bounds()).toMatchObject({ left: 225, width: 150 });
    expect(arrow(bent, a.id).bounds().height).toBeCloseTo(60, 6); // from the ends (y 300) to the middle (y 360)
    expect(arrow(a.diagram, a.id).bounds()).toEqual({ left: 225, top: 300, width: 150, height: 0 });
    const low = put(empty(), arrowOf(150), 300, 590); // near the bottom edge
    expect(CanvasDiagram.validate(low.diagram.bendArrow(low.id, -50).toData(), 800, 600)).toBe(""); // bent up: inside
    expect(CanvasDiagram.validate(low.diagram.bendArrow(low.id, 50).toData(), 800, 600)).toContain("does not fit"); // bent down: out of the canvas
  });

  it("puts the handles for the width across at the middle of the curve", () => {
    const a = put(empty(), { ...arrowOf(150), arrowStyle: "hollow" as const, height: 40, borderWidth: 4 }, 300, 300);
    const bent = arrow(a.diagram, a.id).withBend(30);
    expect(gap(bent.acrossHandle(1, 9), { x: 300, y: 359 })).toBeLessThan(1e-9); // the middle (300,330), then half the height and the offset
    expect(bent.acrossAt(bent.acrossHandle(1, 9), 1, 9)).toBeCloseTo(40, 9);
    expect(bent.acrossAt(bent.acrossHandle(-1, 9), -1, 9)).toBeCloseTo(40, 9);
  });

  it("scales with the arrow when a group is resized, like its thickness", () => {
    const a = straightArrow().withBend(20);
    expect(a.scaledAbout({ x: 0, y: 0 }, 2, 2, 800, 600).bend).toBe(40);
    expect(a.scaledAbout({ x: 0, y: 0 }, 0.5, 1, 800, 600).bend).toBe(10); // the factor that changed more: 0.5
    expect(straightArrow().scaledAbout({ x: 0, y: 0 }, 2, 2, 800, 600).data.bend).toBeUndefined(); // straight stays straight
  });

  it("is stored with its bend, and an old arrow without one is straight", () => {
    const a = straightArrow().withBend(25);
    expect(PlacedBase.stored(a.data).bend).toBe(25);
    expect("bend" in PlacedBase.stored(straightArrow().data)).toBe(false);
  });

  it("has two more points to shape the curve: a quarter and three quarters of the way, each to a side of its own", () => {
    const a = straightArrow().withBend(40);
    expect(a.bends).toEqual([30, 40, 30]); // a plain bend: the other two follow it
    expect(a.data.bendStart).toBeUndefined();
    const [s0, m0, e0] = a.shapePoints();
    expect(gap(s0, { x: 262.5, y: 330 })).toBeLessThan(1e-9);
    expect(gap(m0, { x: 300, y: 340 })).toBeLessThan(1e-9);
    expect(gap(e0, { x: 337.5, y: 330 })).toBeLessThan(1e-9);

    const s = a.withBends({ start: 30, end: -30 }); // an S: the middle stays
    expect(s.bends).toEqual([30, 40, -30]);
    expect(s.data).toMatchObject({ bend: 40, bendStart: 30, bendEnd: -30 });
    for (const [i, p] of s.shapePoints().entries()) expect(gap(s.curve().at((i + 1) / 4), p)).toBeLessThan(1e-9); // the curve goes through the points
    expect(s.curve().at(0.75).y).toBeLessThan(300); // the end side of the S is on the other side of the line

    const one = a.withBends({ start: 10 }); // changing one pins the other at what it was
    expect(one.bends).toEqual([10, 40, 30]);
    expect(one.withBend(60).bends).toEqual([10, 60, 30]); // the middle alone leaves the two that were set
  });

  it("is straight only when all three are a few pixels or less, and does not keep the fields then", () => {
    const a = straightArrow();
    expect(a.withBends({ start: 2, middle: 1, end: -3 }).data.bend).toBeUndefined();
    expect(a.withBends({ start: 20 }).bends).toEqual([20, 0, 0]); // a bump near the start only
    const bump = a.withBends({ start: 20 });
    expect(bump.withBends({ start: 0 }).data).toEqual(a.data);
    expect(a.withBends({ start: 1e9 }).bendStart).toBe(20000);
  });

  it("changes the diagram through one of the three points, bounds and fits hold the whole curve", () => {
    const a = along();
    const bent = a.diagram.bendArrow(a.id, 50, "start");
    expect(arrow(bent, a.id).bends).toEqual([50, 0, 0]);
    expect(bent.bendArrow(a.id, 50, "start")).toBe(bent);
    expect(arrow(bent, a.id).bounds().height).toBeGreaterThan(30);
    const low = put(empty(), arrowOf(150), 300, 590);
    expect(CanvasDiagram.validate(low.diagram.bendArrow(low.id, 50, "end").toData(), 800, 600)).toContain("does not fit");
    expect(CanvasDiagram.validate(low.diagram.bendArrow(low.id, -50, "end").toData(), 800, 600)).toBe("");
  });

  it("scales all three with the arrow, is stored with them, and refuses a bad one", () => {
    const a = straightArrow().withBends({ start: 10, middle: 20, end: -10 });
    expect(a.scaledAbout({ x: 0, y: 0 }, 2, 2, 800, 600).bends).toEqual([20, 40, -20]);
    expect(PlacedBase.stored(a.data)).toMatchObject({ bend: 20, bendStart: 10, bendEnd: -10 });
    expect("bendStart" in PlacedBase.stored(straightArrow().withBend(25).data)).toBe(false);
    const bad = (extra: object) => CanvasDiagram.validate([{ ...a.data, ...extra }], 800, 600);
    expect(bad({ bendStart: "5" })).toContain("bad bend");
    expect(bad({ bendEnd: 1e9 })).toContain("bad bend");
    expect(CanvasDiagram.validate([{ id: "f", centerX: 200, centerY: 200, bendStart: 5, object: square }], 800, 600)).not.toBe(""); // a figure cannot be bent
  });
});

describe("the width across of an arrow", () => {
  const hollow = { ...arrowOf(150), arrowStyle: "hollow" as const, height: 40, borderWidth: 4 };

  it("has a handle on each side of its line, a little outside its edge, wherever it is turned", () => {
    const a = put(empty(), hollow, 300, 300); // along x, 40 across: the edges at y 280 and 320
    const arrowA = arrow(a.diagram, a.id);
    expect(arrowA.acrossHandle(1, 9)).toMatchObject({ x: 300, y: 329 });
    expect(arrowA.acrossHandle(-1, 9)).toMatchObject({ x: 300, y: 271 });
    const turned = new PlacedArrow({ ...arrowA.data, angle: Math.PI / 2, length: 150 }); // pointing down: the sides are left and right
    expect(gap(turned.acrossHandle(1, 9), { x: 271, y: 300 })).toBeLessThan(1e-9);
    expect(gap(turned.acrossHandle(-1, 9), { x: 329, y: 300 })).toBeLessThan(1e-9);
  });

  it("gets the width from a pointer: twice the distance from the line, less the handle's offset", () => {
    const a = put(empty(), hollow, 300, 300);
    const arrowA = arrow(a.diagram, a.id);
    expect(arrowA.acrossAt({ x: 300, y: 329 }, 1, 9)).toBe(40); // on the handle: as it is
    expect(arrowA.acrossAt({ x: 123, y: 349 }, 1, 9)).toBe(80); // dragged out 20 px more: 20 each side more
    expect(arrowA.acrossAt({ x: 300, y: 251 }, -1, 9)).toBe(80); // the other side
    expect(arrowA.acrossAt({ x: 300, y: 300 }, 1, 9)).toBe(-18); // across the line: nothing (the arrow clamps it)
    const turned = new PlacedArrow({ ...arrowA.data, angle: Math.PI / 2, length: 150 });
    expect(turned.acrossAt({ x: 271, y: 100 }, 1, 9)).toBeCloseTo(40, 9); // the same handle, turned: along the arrow does not matter
  });

  it("changes the width across and nothing else: the ends stay, and what is fastened stays fastened", () => {
    const j = joined();
    const a = arrow(j.diagram, j.arrow);
    const wider = j.diagram.resizeArrowAcross(j.arrow, 20);
    const after = arrow(wider, j.arrow);
    expect(after.object.height).toBe(20);
    expect(after.object.borderWidth).toBe(20); // a solid arrow: the thickness
    expect(gap(after.endPoint("start"), a.endPoint("start"))).toBeLessThan(1e-9);
    expect(gap(after.endPoint("end"), a.endPoint("end"))).toBeLessThan(1e-9);
    expect(after.data.connections).toEqual(a.data.connections);
    expect(CanvasDiagram.validate(wider.toData(), 800, 600)).toBe("");
  });

  it("keeps the outline of a hollow arrow when its height changes, and changes nothing when nothing changes", () => {
    const a = put(empty(), hollow, 300, 300);
    const wider = a.diagram.resizeArrowAcross(a.id, 70);
    expect([arrow(wider, a.id).object.height, arrow(wider, a.id).object.borderWidth]).toEqual([70, 4]);
    expect(wider.resizeArrowAcross(a.id, 70)).toBe(wider);
    expect(a.diagram.resizeArrowAcross(a.id, 40)).toBe(a.diagram);
    const f = put(empty(), square, 200, 200);
    expect(f.diagram.resizeArrowAcross(f.id, 50)).toBe(f.diagram); // a figure has no width across
  });
});

describe("what is stored of a canvas, and how an older one is read", () => {
  it("stores only the known fields of the canvas and of each placed object", () => {
    const input = { name: "  X ", width: 100, height: 100, gridSize: 5, gridVisible: true, evil: 1, placed: [{ id: "a", centerX: 50, centerY: 50, object: square, layer: 12, evil: 1, connections: { start: { objectId: "b", pointId: "e", evil: 1 } } }] };
    const stored = new CanvasArea(input).stored();
    expect(stored).toEqual({ name: "X", width: 100, height: 100, gridSize: 5, gridVisible: true, placed: [{ id: "a", centerX: 50, centerY: 50, layer: 12, object: square, connections: { start: { objectId: "b", pointId: "e" } } }] });
    expect(JSON.stringify(stored)).not.toContain("evil");
  });

  it("reads a canvas that an older version saved: the grid, the centre, the layer and what the objects lacked", () => {
    const old = {
      name: "Old",
      width: 400,
      height: 300,
      createdAt: 7,
      placed: [{ id: "a", x: 10, y: 20, object: { name: "Box", shape: "square", width: 40, height: 40, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff" } }],
    };
    const read = CanvasArea.fromStored("id1", old as never);
    expect(read).toMatchObject({ id: "id1", name: "Old", width: 400, height: 300, gridSize: 5, gridVisible: true, createdAt: 7 });
    expect(read.placed[0]).toMatchObject({ id: "a", centerX: 30, centerY: 40, layer: 10 }); // the top-left corner 10,20 and half the size 20
    expect("x" in read.placed[0]).toBe(false);
    expect(read.placed[0].object).toMatchObject({ kind: "figure", arrow: "one-way", arrowStyle: "solid", fontSize: 16, cornerRadius: 0 });
    expect(CanvasDiagram.validate(read.placed, 400, 300)).toBe(""); // and it is allowed as it is now
    expect(CanvasArea.fromStored("id2", {}).placed).toEqual([]);
  });
});

describe("the whole canvas", () => {
  it("is allowed with its objects, and not with an object outside it", () => {
    const j = joined();
    const area = { name: "x", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: j.diagram.toData() };
    expect(new CanvasArea(area).error()).toBe("");
    expect(new CanvasArea({ ...area, width: 300 }).error()).toContain("does not fit");
  });
});

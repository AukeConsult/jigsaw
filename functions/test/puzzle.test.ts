import { describe, expect, it } from "vitest";
import { areaMargin, JIGSAW_MAX_PLACED, JigsawSettings, Puzzle, DEFAULT_OBJECT, PlacedFigure } from "../src/models";
import type { PlacedObject } from "../src/models";

const STEP = 5; // the grid
const square = { ...DEFAULT_OBJECT, width: 100, height: 100 };
const empty = () => Puzzle.from([], 800, 600);

/** a placed square at this centre (on the layer, when one is given) */
const at = (id: string, x: number, y: number, layer?: number, size = 100): PlacedObject => ({ id, object: { ...square, width: size, height: size }, centerX: x, centerY: y, ...(layer !== undefined ? { layer } : {}) });
const figure = (d: Puzzle, id: string) => d.get(id) as PlacedFigure;

describe("moving a figure", () => {
  it("puts the centre of an object on a grid point, inside the picture area", () => {
    const d = Puzzle.from([at("a", 100, 100)], 800, 600).moveFigure("a", 203, 153, STEP);
    expect([figure(d, "a").centerX, figure(d, "a").centerY]).toEqual([205, 155]);
    const corner = Puzzle.from([at("a", 100, 100)], 800, 600).moveFigure("a", 3, 2, STEP); // pulled in so the whole object is inside, or at most in the margin
    const edge = Math.ceil((50 - areaMargin(800, 600)) / STEP) * STEP; // the centre of a box that begins in the margin, on the next grid point
    expect([figure(corner, "a").centerX, figure(corner, "a").centerY]).toEqual([edge, edge]);
  });

  it("changes nothing when it does not move, or for an object that is not there", () => {
    const d = Puzzle.from([at("a", 100, 100)], 800, 600);
    expect(d.moveFigure("a", 101, 99, STEP)).toBe(d);
    expect(d.moveFigure("nothing", 300, 300, STEP)).toBe(d);
  });

  it("is checked against a picture area: not too many, not outside it", () => {
    const many = Array.from({ length: JIGSAW_MAX_PLACED + 1 }, (_, i) => at(`p${i}`, 100, 100, undefined, 10));
    expect(Puzzle.validate(many, 800, 600)).toContain("At most");
    expect(Puzzle.validate([at("a", 100, 100, undefined, 900)], 800, 600)).toContain("does not fit");
  });
});

describe("a group of objects", () => {
  const two = () => Puzzle.from([at("a", 200, 250), at("b", 450, 250)], 800, 600); // A 150..250 x 200..300, B 400..500 x 200..300

  it("finds the objects that a rectangle touches", () => {
    expect(two().itemsIn({ left: 100, top: 150, width: 200, height: 200 })).toEqual(["a"]);
    expect(two().itemsIn({ left: 600, top: 400, width: 50, height: 50 })).toEqual([]);
  });
});

describe("layers", () => {
  const layerOf = (d: Puzzle, id: string) => d.get(id)!.layer;
  const one = () => Puzzle.from([at("a", 200, 200)], 800, 600);
  const twoOf = () => Puzzle.from([at("a", 200, 200), at("b", 450, 200)], 800, 600);

  it("starts an object on layer 10", () => {
    expect(layerOf(one(), "a")).toBe(10);
  });

  it("puts objects on a layer from 1 to 1000, never on the picture layer", () => {
    const d = one();
    expect(layerOf(d.setLayer(["a"], 0), "a")).toBe(1);
    expect(layerOf(d.setLayer(["a"], -5), "a")).toBe(1);
    expect(layerOf(d.setLayer(["a"], 5000), "a")).toBe(1000);
    expect(layerOf(d.setLayer(["a"], 7.6), "a")).toBe(8);
  });

  it("changes the layer of several objects, and nothing when nothing changes", () => {
    const b = twoOf();
    const d = b.setLayer(["a", "b"], 30);
    expect([layerOf(d, "a"), layerOf(d, "b")]).toEqual([30, 30]);
    expect(d.setLayer(["a", "b"], 30)).toBe(d);
    expect(b.setLayer(["nothing"], 30)).toBe(b);
  });

  it("keeps the layer through moving", () => {
    const moved = twoOf().setLayer(["a", "b"], 20).moveFigure("b", 450, 370, STEP).moveGroup(["a"], 40, 0);
    for (const id of ["a", "b"]) expect(layerOf(moved, id)).toBe(20);
  });

  it("is on the default layer when it was stored without one, and is checked when it has one", () => {
    const stored = { id: "x", object: square, centerX: 100, centerY: 100 };
    expect(Puzzle.from([stored], 800, 600).get("x")!.layer).toBe(10);
    expect(Puzzle.validate([stored], 800, 600)).toBe("");
    for (const layer of [0, -1, 1001, 2.5, "10", null]) {
      expect(Puzzle.validate([{ ...stored, layer }], 800, 600)).toContain("layer");
    }
    expect(Puzzle.validate([{ ...stored, layer: 1 }, { ...stored, id: "y", layer: 1000 }], 800, 600)).toBe("");
  });
});

describe("what is stored of a jigsaw, and how an older one is read", () => {
  it("stores only the known fields of the jigsaw and of each placed object", () => {
    const input = { name: "  X ", width: 100, height: 100, gridSize: 5, gridVisible: true, evil: 1, placed: [{ id: "a", centerX: 50, centerY: 50, object: { ...square, evil: 1 }, layer: 12, evil: 1 }] };
    const stored = new JigsawSettings(input).stored();
    expect(stored).toEqual({ name: "X", width: 100, height: 100, gridSize: 5, gridVisible: true, placed: [{ id: "a", centerX: 50, centerY: 50, layer: 12, object: square }] });
    expect(JSON.stringify(stored)).not.toContain("evil");
  });

  it("reads a jigsaw that an older version saved: the grid, the centre, the layer and what the objects lacked", () => {
    const old = {
      name: "Old",
      width: 400,
      height: 300,
      createdAt: 7,
      placed: [{ id: "a", x: 10, y: 20, object: { name: "Box", shape: "square", width: 40, height: 40, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff" } }],
    };
    const read = JigsawSettings.fromStored("id1", old as never);
    expect(read).toMatchObject({ id: "id1", name: "Old", width: 400, height: 300, gridSize: 5, gridVisible: true, createdAt: 7 });
    expect(read.placed[0]).toMatchObject({ id: "a", centerX: 30, centerY: 40, layer: 10 }); // the top-left corner 10,20 and half the size 20
    expect("x" in read.placed[0]).toBe(false);
    expect(read.placed[0].object).toEqual({ name: "Box", width: 40, height: 40 }); // the shape and the colours of the drawing tool are not kept
    expect(Puzzle.validate(read.placed, 400, 300)).toBe(""); // and it is allowed as it is now
    expect(JigsawSettings.fromStored("id2", {}).placed).toEqual([]);
  });

  it("reads an object that an older version saved as an arrow, with connections, a bend and a length, and does not keep what only an arrow had", () => {
    const old = {
      id: "old",
      centerX: 200,
      centerY: 100,
      layer: 12,
      length: 120,
      angle: 0.5,
      bend: 20,
      bendStart: 5,
      bendEnd: 6,
      connections: { start: { objectId: "f", pointId: "e" } },
      object: { kind: "connector", name: "Arrow", shape: "line", width: 150, height: 2, borderWidth: 2, arrow: "both-ways", arrowStyle: "hollow", borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff", fontSize: 16, cornerRadius: 0 },
    };
    const read = JigsawSettings.fromStored("old", { name: "Old", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [old] } as never);
    expect(read.placed[0]).toEqual({ id: "old", centerX: 200, centerY: 100, layer: 12, object: { name: "Arrow", width: 150, height: 2 } });
    expect(Puzzle.validate(read.placed, 800, 600)).toBe("");
    // and what comes from outside with such fields is stored without them
    const stored = new JigsawSettings({ name: "X", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [old] }).stored();
    expect(stored.placed).toEqual([{ id: "old", centerX: 200, centerY: 100, layer: 12, object: { name: "Arrow", width: 150, height: 2 } }]);
    for (const key of ["connections", "length", "angle", "bend", "bendStart", "bendEnd", "kind", "arrow", "shape"]) expect(JSON.stringify(stored)).not.toContain(`"${key}"`);
  });
});

describe("the whole picture area", () => {
  it("is allowed with its objects, and not with an object outside it", () => {
    const area = { name: "x", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [at("a", 200, 250), at("b", 450, 250)] };
    expect(new JigsawSettings(area).error()).toBe("");
    expect(new JigsawSettings({ ...area, width: 300 }).error()).toContain("does not fit");
  });
});

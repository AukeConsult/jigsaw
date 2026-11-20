import { describe, expect, it } from "vitest";
import { CANVAS_MAX_PLACED, CanvasArea, CanvasDiagram, DEFAULT_OBJECT, JigsawCut, PlacedBase, PlacedFigure, pieceGrid } from "../src/models";

/** a steady "random" so the tests give the same cut every time */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const cut = (w = 200, h = 150, grid = 50, seed = 1) => {
  const result = JigsawCut.cut(w, h, grid, seeded(seed));
  if ("error" in result) throw new Error(result.error);
  return result;
};

describe("cutting a canvas into jigsaw pieces", () => {
  it("makes one piece for each whole cell of the grid", () => {
    expect(pieceGrid(850, 600, 50)).toEqual({ columns: 17, rows: 12 });
    expect(pieceGrid(830, 610, 50)).toEqual({ columns: 16, rows: 12 }); // what is left at the far edges is not a piece
    expect(pieceGrid(800, 600, 0)).toEqual({ columns: 0, rows: 0 });
    const { placed, columns, rows } = cut();
    expect([columns, rows, placed.length]).toEqual([4, 3, 12]);
    expect(new Set(placed.map((p) => p.id)).size).toBe(12);
    for (const p of placed) expect([p.object.width, p.object.height, p.object.shape]).toEqual([50, 50, "square"]);
  });

  it("scatters the pieces in the store frame beside the canvas, all inside it", () => {
    const { placed, storeWidth } = cut(200, 150, 50); // 12 pieces; the frame is 3 × 150 = 450 high
    const frame = CanvasArea.storeFrame(200, 150, 50, storeWidth)!;
    expect(frame).toEqual({ left: 250, width: storeWidth, height: 450 });
    expect(storeWidth).toBeGreaterThan(0);
    for (const p of placed) {
      expect(p.centerX - 25).toBeGreaterThanOrEqual(frame.left); // the whole piece is in the frame, none on the canvas
      expect(p.centerX + 25).toBeLessThanOrEqual(frame.left + frame.width);
      expect(p.centerY - 25).toBeGreaterThanOrEqual(0);
      expect(p.centerY + 25).toBeLessThanOrEqual(frame.height);
      expect(Number.isInteger(p.centerX * 2) && Number.isInteger(p.centerY * 2)).toBe(true); // whole or half pixels
    }
    expect(Math.max(...placed.map((p) => p.centerY))).toBeGreaterThan(150); // spread down the frame, further than the height of the canvas
    expect(cut(200, 150, 50, 2).placed.map((p) => p.centerX)).not.toEqual(placed.map((p) => p.centerX)); // another chance, another scatter
  });

  it("leaves a random space between neighbours, across and down, from a little overlap to most of a piece, and is not on a regular grid", () => {
    const { placed } = cut(400, 300, 50, 5); // 48 pieces
    const rows = new Map<number, typeof placed>();
    for (const p of placed) rows.set(p.centerY, [...(rows.get(p.centerY) ?? []), p]);
    const ys = [...rows.keys()].sort((a, b) => a - b);
    const gaps: number[] = [];
    for (const y of ys) {
      const row = rows.get(y)!.sort((a, b) => a.centerX - b.centerX);
      for (let i = 1; i < row.length; i++) gaps.push(row[i].centerX - row[i - 1].centerX - 50);
    }
    for (let i = 1; i < ys.length; i++) gaps.push(ys[i] - ys[i - 1] - 50);
    for (const gap of gaps) {
      expect(gap).toBeGreaterThanOrEqual(-15); // -0.3 of 50
      expect(gap).toBeLessThanOrEqual(40); // 0.8 of 50
    }
    expect(gaps.some((g) => g < 0)).toBe(true); // some overlap
    expect(gaps.some((g) => g > 20)).toBe(true); // and some are further apart
    expect(new Set(placed.map((p) => p.centerX % 50)).size).toBeGreaterThan(1); // not all on the same grid points
  });

  it("puts each piece on a layer of its own by chance, in the order the pieces are in front of each other", () => {
    const { placed } = cut(400, 300, 50, 3);
    const layers = placed.map((p) => p.layer!);
    for (const l of layers) {
      expect(l).toBeGreaterThanOrEqual(10);
      expect(l).toBeLessThan(10 + placed.length);
    }
    expect(new Set(layers).size).toBeGreaterThan(10); // a mix, not one layer
    expect(layers).not.toEqual([...layers].sort((a, b) => a - b)); // not in the order of the pieces
  });

  it("gives every inner edge a tab on one piece and the blank on the other, and the border is flat", () => {
    const { placed } = cut(300, 200, 50, 7);
    const at = (c: number, r: number) => placed.find((p) => p.piece!.col === c && p.piece!.row === r)!.piece!;
    for (let c = 0; c < 6; c++) {
      for (let r = 0; r < 4; r++) {
        const p = at(c, r);
        if (c < 5) expect(p.right).toBe(-at(c + 1, r).left);
        if (r < 3) expect(p.bottom).toBe(-at(c, r + 1).top);
        if (c === 0) expect(p.left).toBe(0);
        if (c === 5) expect(p.right).toBe(0);
        if (r === 0) expect(p.top).toBe(0);
        if (r === 3) expect(p.bottom).toBe(0);
        if (c > 0 && c < 5) expect(Math.abs(p.left)).toBe(1);
      }
    }
  });

  it("makes pieces that are allowed on the jigsaw pieces area: the canvas and its store frame", () => {
    const { placed, storeWidth } = cut(850, 600, 50);
    const input = { name: "Puzzle", width: 850, height: 600, gridSize: 50, gridVisible: true, placed, storeWidth };
    expect(new CanvasArea(input).error()).toBe("");
    expect(CanvasDiagram.validate(placed, 850, 600)).toContain("does not fit"); // not on the canvas alone
    expect(new CanvasArea({ ...input, storeWidth: 100 }).error()).toContain("does not fit"); // nor in a store that is too narrow
    expect(new CanvasArea({ ...input, storeWidth: -1 }).error()).toContain("store");
    expect(new CanvasArea(input).stored().storeWidth).toBe(storeWidth);
    expect("storeWidth" in new CanvasArea({ ...input, placed: [], storeWidth: 0 }).stored()).toBe(false);
    expect(CanvasArea.fromStored("x", { ...input, createdAt: 1 }).storeWidth).toBe(storeWidth);
  });

  it("refuses when there is no grid, no room, or too many pieces", () => {
    expect(JigsawCut.cut(800, 600, 0)).toHaveProperty("error");
    expect(JigsawCut.cut(60, 60, 50)).toHaveProperty("error"); // one piece is no puzzle
    const many = JigsawCut.cut(2000, 2000, 50);
    expect(many).toHaveProperty("error");
    expect((many as { error: string }).error).toContain(String(CANVAS_MAX_PLACED));
  });

  it("draws the outline of a piece: flat edges are straight, a tab or a blank is a curve", () => {
    const flat = JigsawCut.path(50, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(flat).toBe("M 0,0 L 50,0 L 50,50 L 0,50 L 0,0 Z");
    const tab = JigsawCut.path(100, { top: 1, right: 0, bottom: 0, left: 0 });
    expect(tab).toContain("C");
    const ys = [...tab.matchAll(/,(-?\d+\.?\d*)/g)].map((m) => Number(m[1]));
    expect(Math.min(...ys)).toBeLessThan(-20); // a tab on the top goes out above the piece
    const blank = JigsawCut.path(100, { top: -1, right: 0, bottom: 0, left: 0 });
    expect(Math.min(...[...blank.matchAll(/,(-?\d+\.?\d*)/g)].map((m) => Number(m[1])))).toBeGreaterThanOrEqual(0); // a blank goes in
  });
});

describe("a piece that is dropped close to its own place", () => {
  const piece = { col: 2, row: 1, top: 1, right: 0, bottom: -1, left: 1 } as const; // belongs at the centre 125, 75 of 50 px pieces
  const base = { id: "p", centerX: 475, centerY: 25, object: { ...DEFAULT_OBJECT, width: 50, height: 50 }, piece };
  const diagram = () => CanvasDiagram.from([base], 800, 600);
  const at = (d: CanvasDiagram, id = "p") => [d.get(id)!.centerX, d.get(id)!.centerY];
  const put = (x: number, y: number) => ({ ...base, centerX: x, centerY: y });

  it("knows where it belongs: the centre of its cell of the picture", () => {
    expect(new PlacedFigure(base).home()).toEqual({ x: 125, y: 75 });
    expect(new PlacedFigure({ ...base, piece: undefined }).home()).toBeNull();
  });

  it("does not click into place while it is moved, however close it comes", () => {
    expect(at(diagram().moveFigure("p", 128, 77, 50, 25))).toEqual([128, 77]); // right by its place: still where it is put
    expect(at(diagram().moveFigure("p", 125, 75, 50, 25))).toEqual([125, 75]);
  });

  it("clicks into place when it is dropped within the range, exactly on its place", () => {
    const d = (x: number, y: number, range: number) => at(CanvasDiagram.from([put(x, y)], 800, 600).dropPieces(["p"], range));
    expect(d(140, 90, 25)).toEqual([125, 75]); // about 21 px off, in a range of 25
    expect(d(100, 75, 25)).toEqual([125, 75]); // exactly 25 px off: just in
    expect(d(99, 75, 25)).toEqual([99, 75]); // 26 px off: out
    expect(d(130, 80, 10)).toEqual([125, 75]); // a smaller range
    expect(d(140, 90, 10)).toEqual([140, 90]);
    expect(d(160, 75, 40)).toEqual([125, 75]); // a bigger range
  });

  it("never clicks when the range is 0, and is not changed when there is nothing to change", () => {
    const near = CanvasDiagram.from([put(126, 76)], 800, 600);
    expect(near.dropPieces(["p"], 0)).toBe(near);
    expect(near.dropPieces(["p"], -5)).toBe(near);
    expect(near.dropPieces(["p"], Number.NaN)).toBe(near);
    const there = CanvasDiagram.from([put(125, 75)], 800, 600);
    expect(there.dropPieces(["p"], 25)).toBe(there); // already exactly there
    expect(there.dropPieces(["nobody"], 25)).toBe(there);
  });

  it("looks only at the pieces that were dropped, and only at pieces", () => {
    const other = { ...put(130, 80), id: "q", piece: { ...piece, col: 5, row: 4 } }; // belongs at 275, 225: not near
    const near = { ...put(130, 80), id: "r" }; // near its own place, but was not dropped
    const plain = { id: "s", centerX: 125, centerY: 77, object: { ...DEFAULT_OBJECT, width: 50, height: 50 } }; // not a piece
    const d = CanvasDiagram.from([put(130, 80), other, near, plain], 800, 600).dropPieces(["p", "q", "s"], 25);
    expect(at(d, "p")).toEqual([125, 75]);
    expect(at(d, "q")).toEqual([130, 80]); // at the place of another piece: stays
    expect(at(d, "r")).toEqual([130, 80]); // not dropped
    expect(at(d, "s")).toEqual([125, 77]); // not a piece
  });

  it("clicks several dropped pieces at once", () => {
    const other = { ...put(60, 120), id: "q", piece: { ...piece, col: 1, row: 2 } }; // belongs at 75, 125
    const d = CanvasDiagram.from([put(130, 80), other], 800, 600).dropPieces(["p", "q"], 25);
    expect([at(d, "p"), at(d, "q")]).toEqual([[125, 75], [75, 125]]);
  });

  it("moves in steps 50 times smaller than the grid, not from grid point to grid point", () => {
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 50, 25))).toEqual([333, 223]); // a 50 px grid: steps of 1 px
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 100, 50))).toEqual([334, 222]); // a 100 px grid: steps of 2 px from 50 (..., 332, 334, ...)
    expect(at(diagram().moveFigure("p", 400, 300, 50, 25))).toEqual([400, 300]); // the grid points are among the steps
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 10, 5))).toEqual([333.5, 222.5]); // never finer than half a pixel
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 1, 0))).toEqual([333.5, 222.5]);
    // a grid that is not a multiple of 25 (the grid worked out from a number of pieces): the step is still a whole number of half pixels, so a piece is always on a whole or a half pixel
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 101, 50.5))).toEqual([332.5, 222.5]); // 101 / 50 = 2.02, made 2
    for (const grid of [101, 58, 77, 33, 71, 123, 19]) {
      for (const [x, y] of [[333.37, 222.61], [150.9, 99.1], [401.23, 301.77]]) {
        const [px, py] = at(diagram().moveFigure("p", x, y, grid, grid / 2));
        expect(Number.isInteger(px * 2) && Number.isInteger(py * 2)).toBe(true);
      }
    }
    // a figure that is not a piece still sticks to the grid points
    const plain = CanvasDiagram.from([{ ...base, piece: undefined }], 800, 600).moveFigure("p", 333.4, 222.6, 50, 25);
    expect(at(plain)).toEqual([325, 225]);
  });

  it("can be moved away from its place again", () => {
    const placed = diagram().moveFigure("p", 130, 80, 50, 25).dropPieces(["p"], 25);
    expect(at(placed)).toEqual([125, 75]);
    expect(at(placed.moveFigure("p", 325, 225, 50, 25))).toEqual([325, 225]);
  });
});

describe("how close a piece has to be dropped, a setting of the jigsaw", () => {
  const input = { name: "Puzzle", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] };

  it("is a percent of the grid size, 50 when the jigsaw says nothing", () => {
    expect(CanvasArea.DEFAULT_SNAP_PERCENT).toBe(50);
    expect([CanvasArea.snapRangePx(50, 50), CanvasArea.snapRangePx(20, 50), CanvasArea.snapRangePx(100, 80), CanvasArea.snapRangePx(0, 50)]).toEqual([25, 10, 80, 0]);
    expect([CanvasArea.snapRangePx(50, 0), CanvasArea.snapRangePx(-5, 50)]).toEqual([0, 0]); // no grid or a bad percent: never
  });

  it("is saved with the jigsaw (also 0, which means never), and a jigsaw without it has none", () => {
    expect(new CanvasArea({ ...input, snapPercent: 30 }).stored().snapPercent).toBe(30);
    expect(new CanvasArea({ ...input, snapPercent: 0 }).stored().snapPercent).toBe(0);
    expect("snapPercent" in new CanvasArea(input).stored()).toBe(false);
    expect(CanvasArea.fromStored("x", { ...input, snapPercent: 70, createdAt: 1 }).snapPercent).toBe(70);
    expect("snapPercent" in CanvasArea.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("is a whole number of percent from 0 to 100", () => {
    for (const bad of [-1, 1.5, "5", null, 101, 5000, Number.NaN]) expect(new CanvasArea({ ...input, snapPercent: bad }).error()).toContain("snap range");
    for (const good of [0, 1, 50, 100]) expect(new CanvasArea({ ...input, snapPercent: good }).error()).toBe("");
  });
});

describe("the grid size from the number of pieces", () => {
  const layout = (w: number, h: number, n: number) => JigsawCut.layoutFor(w, h, n);

  it("makes square pieces and a canvas of a whole number of them, as near the number asked for as it can", () => {
    const l = layout(800, 600, 192);
    expect(l).toEqual({ grid: 50, width: 800, height: 600, columns: 16, rows: 12 });
    expect(l.columns * l.rows).toBe(192);
    const d = layout(800, 600, 48); // ideal: the square root of 800 × 600 / 48 = 100
    expect([d.grid, d.columns * d.rows]).toEqual([100, 48]);
    const e = layout(800, 600, 12);
    expect([e.grid, e.width, e.height, e.columns * e.rows]).toEqual([200, 800, 600, 12]);
  });

  it("fits the canvas to the pieces, a few pieces more or fewer than asked when that is what whole squares give", () => {
    const l = layout(830, 610, 100); // 830 × 610 / 100: a piece about 71 px
    expect(l.width % l.grid).toBe(0);
    expect(l.height % l.grid).toBe(0);
    expect(l.columns * l.rows).toBe((l.width / l.grid) * (l.height / l.grid));
    expect(Math.abs(l.columns * l.rows - 100)).toBeLessThanOrEqual(12);
    expect(Math.abs(l.width - 830)).toBeLessThan(l.grid); // the canvas is made about as big as it was
    const odd = layout(1000, 700, 77);
    expect(odd.width % odd.grid).toBe(0);
    expect(Math.abs(odd.columns * odd.rows - 77)).toBeLessThanOrEqual(10);
  });

  it("takes the grid that gives the number of pieces nearest to the one asked for", () => {
    for (const [w, h, n] of [[800, 600, 100], [1000, 500, 60], [640, 480, 35], [900, 900, 81]] as const) {
      const l = layout(w, h, n);
      const miss = Math.abs(l.columns * l.rows - n);
      for (let g = 5; g <= 300; g++) {
        const count = Math.round(CanvasArea.fittedSide(w, g) / g) * Math.round(CanvasArea.fittedSide(h, g) / g);
        if (count <= 500 && count >= 2) expect(miss).toBeLessThanOrEqual(Math.abs(count - n) + 1e-9 + (Math.abs(g - Math.sqrt((w * h) / n)) <= 3 ? 0 : Infinity));
      }
    }
  });

  it("keeps the number of pieces within what can be, and the layout allowed as a canvas", () => {
    expect(layout(800, 600, 100000).columns * layout(800, 600, 100000).rows).toBeLessThanOrEqual(CANVAS_MAX_PLACED);
    expect(layout(800, 600, 1).columns * layout(800, 600, 1).rows).toBeGreaterThanOrEqual(2);
    expect(layout(800, 600, Number.NaN).columns * layout(800, 600, Number.NaN).rows).toBeGreaterThanOrEqual(2);
    const l = layout(800, 600, 192);
    const cut = JigsawCut.cut(l.width, l.height, l.grid, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    expect(cut.placed).toHaveLength(192); // the layout is what the cutting makes
    expect([cut.columns, cut.rows]).toEqual([l.columns, l.rows]);
  });

  it("still gives a layout for a canvas that is tiny or huge for the number", () => {
    const tiny = layout(3, 2, 50);
    expect(tiny.grid).toBeGreaterThanOrEqual(1);
    expect(tiny.width % tiny.grid).toBe(0);
    const big = layout(10000, 10000, 500);
    expect(big.columns * big.rows).toBeLessThanOrEqual(CANVAS_MAX_PLACED);
    expect(big.width).toBeLessThanOrEqual(10000);
  });
});

describe("a piece that is picked up goes to the front", () => {
  const square = { ...DEFAULT_OBJECT, width: 50, height: 50 };
  const mk = (id: string, layer: number) => ({ id, centerX: 100, centerY: 100, layer, object: square, piece: { col: 0, row: 0, top: 0, right: 0, bottom: 0, left: 0 } as const });

  it("is put on a layer above all the others, and stays there", () => {
    const d = CanvasDiagram.from([mk("a", 10), mk("b", 40), mk("c", 25)], 400, 400);
    const front = d.bringToFront("a");
    expect(front.get("a")!.layer).toBe(41);
    expect(front.get("b")!.layer).toBe(40); // the others are as they were
    expect(front.get("c")!.layer).toBe(25);
    expect(front.bringToFront("a")).toBe(front); // already in front: nothing changes
    expect(d.bringToFront("nobody")).toBe(d);
  });

  it("stays within the layers there are", () => {
    const d = CanvasDiagram.from([mk("a", 5), mk("b", 1000)], 400, 400);
    expect(d.bringToFront("a").get("a")!.layer).toBe(1000);
    expect(CanvasDiagram.validate(d.bringToFront("a").toData(), 400, 400)).toBe("");
  });
});

describe("moving several pieces at once", () => {
  const square = { ...DEFAULT_OBJECT, width: 50, height: 50 };
  const mk = (id: string, x: number, y: number) => ({ id, centerX: x, centerY: y, layer: 10, object: square, piece: { col: 0, row: 0, top: 0, right: 0, bottom: 0, left: 0 } as const });
  const group = () => CanvasDiagram.from([mk("a", 100, 100), mk("b", 160, 130), mk("c", 400, 300), mk("other", 500, 350)], 600, 400);
  const at = (d: CanvasDiagram, id: string) => [d.get(id)!.centerX, d.get(id)!.centerY];

  it("moves them all by the same amount, so they keep their places in relation to each other, and leaves the others", () => {
    const d = group().moveGroup(["a", "b", "c"], 30, -20);
    expect([at(d, "a"), at(d, "b"), at(d, "c"), at(d, "other")]).toEqual([[130, 80], [190, 110], [430, 280], [500, 350]]);
    expect(d.get("b")!.centerX - d.get("a")!.centerX).toBe(60);
  });

  it("moves in half pixels, and in steps as small as that", () => {
    expect(at(group().moveGroup(["a", "b"], 0.4, 0.2), "a")).toEqual([100.5, 100]);
    expect(at(group().moveGroup(["a", "b"], 1.26, -0.74), "b")).toEqual([161.5, 129.5]); // -0.74 is -0.5 to the nearest half
  });

  it("goes only as far as all of them stay inside the area: the one that is nearest to an edge decides", () => {
    const left = group().moveGroup(["a", "b", "c"], -500, 0);
    expect([at(left, "a")[0], at(left, "b")[0], at(left, "c")[0]]).toEqual([25, 85, 325]); // a is stopped by the left edge, the others went as far
    const right = group().moveGroup(["a", "b", "c"], 500, 0);
    expect(at(right, "c")[0]).toBe(575); // c is stopped by the right edge (600 − 25)
    expect(at(right, "a")[0]).toBe(275);
    const down = group().moveGroup(["a", "b", "c"], 0, 500);
    expect(at(down, "c")[1]).toBe(375);
    expect(at(down, "a")[1]).toBe(175);
    expect(CanvasDiagram.validate(down.toData(), 600, 400)).toBe("");
  });

  it("changes nothing when it cannot move, or the move is nothing, and ignores what is not a figure", () => {
    const d = group();
    expect(d.moveGroup(["a", "b"], 0, 0)).toBe(d);
    expect(d.moveGroup(["a", "b"], 0.2, -0.2)).toBe(d); // less than half a pixel
    expect(d.moveGroup([], 10, 10)).toBe(d);
    expect(d.moveGroup(["nobody"], 10, 10)).toBe(d);
    expect(d.moveGroup(["a"], Number.NaN, 1)).toBe(d);
    const edge = CanvasDiagram.from([mk("a", 25, 100)], 600, 400);
    expect(edge.moveGroup(["a"], -40, 0)).toBe(edge); // already at the left edge
  });
});

describe("starting a cut jigsaw over (reset)", () => {
  it("scatters the same pieces again: new places and layers, the same edges, still in the store", () => {
    const first = cut(400, 300, 50, 4);
    const again = JigsawCut.reshuffle(first.placed, 400, 300, 50, seeded(99));
    if ("error" in again) throw new Error(again.error);
    expect(again.placed.map((p) => p.id)).toEqual(first.placed.map((p) => p.id)); // the same pieces in the same order
    expect(again.placed.map((p) => p.piece)).toEqual(first.placed.map((p) => p.piece)); // each keeps its own edges
    expect(again.placed.map((p) => [p.centerX, p.centerY])).not.toEqual(first.placed.map((p) => [p.centerX, p.centerY]));
    expect(again.placed.map((p) => p.layer)).not.toEqual(first.placed.map((p) => p.layer));
    const input = { name: "Puzzle", width: 400, height: 300, gridSize: 50, gridVisible: true, placed: again.placed, storeWidth: again.storeWidth };
    expect(new CanvasArea(input).error()).toBe(""); // inside the frame
    const left = 450;
    for (const p of again.placed) expect(p.centerX - 25).toBeGreaterThanOrEqual(left);
  });

  it("brings back a piece that was moved onto the canvas, and leaves what is not a piece alone", () => {
    const first = cut(400, 300, 50, 4);
    const moved = { ...first.placed[0], centerX: 125, centerY: 125 }; // dragged onto the picture
    const other = { id: "x", centerX: 75, centerY: 75, object: { ...DEFAULT_OBJECT, width: 50, height: 50 } };
    const result = JigsawCut.reshuffle([moved, other, ...first.placed.slice(1)], 400, 300, 50, seeded(5));
    if ("error" in result) throw new Error(result.error);
    expect(result.placed[1]).toEqual(other); // not a piece: as it was
    expect(result.placed[0].centerX).toBeGreaterThan(450); // the piece is in the store again
    expect(result.placed).toHaveLength(first.placed.length + 1);
  });

  it("says so when there is nothing to shuffle", () => {
    expect(JigsawCut.reshuffle([], 400, 300, 50)).toHaveProperty("error");
  });
});

describe("a jigsaw piece as a placed figure", () => {
  const base = { id: "p", centerX: 25, centerY: 25, object: { ...DEFAULT_OBJECT, width: 50, height: 50 } };
  const piece = { col: 1, row: 2, top: 1, right: -1, bottom: 0, left: 1 } as const;

  it("is stored with its piece, and only the known fields of it", () => {
    expect(PlacedBase.stored({ ...base, piece: { ...piece, extra: 1 } as never }).piece).toEqual(piece);
    expect("piece" in PlacedBase.stored(base)).toBe(false);
  });

  it("is refused when the piece is bad, or when an arrow says it is a piece", () => {
    const bad = (p: unknown) => CanvasDiagram.validate([{ ...base, piece: p }], 200, 200);
    expect(bad(piece)).toBe("");
    for (const p of [null, 5, { ...piece, col: -1 }, { ...piece, row: 1.5 }, { ...piece, top: 2 }, { ...piece, left: "1" }, { col: 1, row: 1 }]) {
      expect(bad(p)).toContain("bad jigsaw piece");
    }
    const arrow = { id: "a", centerX: 100, centerY: 100, object: { ...DEFAULT_OBJECT, kind: "connector", shape: "line", height: 2, borderWidth: 2 }, piece };
    expect(CanvasDiagram.validate([arrow], 400, 400)).toContain("cannot be a jigsaw piece");
  });

  it("keeps its piece when it is moved", () => {
    const { diagram } = CanvasDiagram.from([{ ...base, piece }], 200, 200).place(DEFAULT_OBJECT, 0, 0, 50) as { diagram: CanvasDiagram };
    const moved = diagram.moveFigure("p", 125, 75, 50, 25);
    expect(moved.get("p")?.data.piece).toEqual(piece);
  });
});

describe("a grid whose points are half a step in from the edge", () => {
  const empty = () => CanvasDiagram.from([], 200, 150);
  const piece = { ...DEFAULT_OBJECT, width: 50, height: 50 };

  it("sticks an object's centre to those points: 25, 75, 125 ...", () => {
    const placed = (x: number, y: number) => {
      const r = empty().place(piece, x, y, 50, 25);
      if ("error" in r) throw new Error(r.error);
      return r.diagram.items[0];
    };
    expect([placed(60, 40).centerX, placed(60, 40).centerY]).toEqual([75, 25]);
    expect([placed(110, 140).centerX, placed(110, 140).centerY]).toEqual([125, 125]);
    expect([placed(0, 0).centerX, placed(0, 0).centerY]).toEqual([25, 25]); // a piece at the corner fits in the cell
    expect([placed(199, 149).centerX, placed(199, 149).centerY]).toEqual([175, 125]);
  });

  it("moves a figure to those points too, and the plain grid is as it was without an origin", () => {
    const first = empty().place(piece, 25, 25, 50, 25) as { diagram: CanvasDiagram; id: string };
    expect(first.diagram.moveFigure(first.id, 100, 80, 50, 25).get(first.id)).toMatchObject({ data: { centerX: 125, centerY: 75 } });
    const plain = empty().place(piece, 60, 40, 50) as { diagram: CanvasDiagram };
    expect([plain.diagram.items[0].centerX, plain.diagram.items[0].centerY]).toEqual([50, 50]);
  });
});

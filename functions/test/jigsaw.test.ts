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

describe("a piece that comes close to its own place", () => {
  const piece = { col: 2, row: 1, top: 1, right: 0, bottom: -1, left: 1 } as const; // belongs at the centre 125, 75 of 50 px pieces
  const base = { id: "p", centerX: 475, centerY: 25, object: { ...DEFAULT_OBJECT, width: 50, height: 50 }, piece };
  const diagram = () => CanvasDiagram.from([base], 800, 600);
  const at = (d: CanvasDiagram) => [d.get("p")!.centerX, d.get("p")!.centerY];

  it("knows where it belongs: the centre of its cell of the picture", () => {
    expect(new PlacedFigure(base).home()).toEqual({ x: 125, y: 75 });
    expect(new PlacedFigure({ ...base, piece: undefined }).home()).toBeNull();
  });

  it("snaps into place when it is moved within half its size, even if the grid points are somewhere else", () => {
    expect(at(diagram().moveFigure("p", 140, 90, 50, 25))).toEqual([125, 75]); // 15 px and 15 px off: snapped
    expect(at(diagram().moveFigure("p", 100, 75, 50, 25))).toEqual([125, 75]); // 25 px off: just in
    expect(at(diagram().moveFigure("p", 107, 75, 50, 25))).toEqual([125, 75]);
    expect(at(diagram().moveFigure("p", 130, 80, 50, 0))).toEqual([125, 75]); // also with a plain grid, where 125 is not a grid point
  });

  it("does not snap when it is further away, and a piece in another place does not snap to this one", () => {
    expect(at(diagram().moveFigure("p", 190, 140, 50, 25))).toEqual([190, 140]); // where it is put (see the fine steps below), not home
    const other = { ...base, id: "q", piece: { ...piece, col: 5, row: 4 } }; // belongs at 275, 225
    const d = CanvasDiagram.from([other], 800, 600).moveFigure("q", 125, 75, 50, 25);
    expect(at2(d)).toEqual([125, 75]); // at the place of another piece, it stays where it was put
  });

  it("moves in steps 50 times smaller than the grid, not from grid point to grid point", () => {
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 50, 25))).toEqual([333, 223]); // a 50 px grid: steps of 1 px
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 100, 50))).toEqual([334, 222]); // a 100 px grid: steps of 2 px from 50 (..., 332, 334, ...)
    expect(at(diagram().moveFigure("p", 400, 300, 50, 25))).toEqual([400, 300]); // the grid points are among the steps
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 10, 5))).toEqual([333.5, 222.5]); // never finer than half a pixel
    expect(at(diagram().moveFigure("p", 333.4, 222.6, 1, 0))).toEqual([333.5, 222.5]);
    // a figure that is not a piece still sticks to the grid points
    const plain = CanvasDiagram.from([{ ...base, piece: undefined }], 800, 600).moveFigure("p", 333.4, 222.6, 50, 25);
    expect(at(plain)).toEqual([325, 225]);
  });

  it("can be moved away from its place again", () => {
    const placed = diagram().moveFigure("p", 125, 75, 50, 25);
    expect(at(placed.moveFigure("p", 325, 225, 50, 25))).toEqual([325, 225]);
  });

  function at2(d: CanvasDiagram) {
    return [d.get("q")!.centerX, d.get("q")!.centerY];
  }
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

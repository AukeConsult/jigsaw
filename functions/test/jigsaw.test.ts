import { describe, expect, it } from "vitest";
import { JIGSAW_MAX_PIECES, JigsawLanguages, JigsawSettings, Puzzle, DEFAULT_OBJECT, JigsawCut, JigsawPieces, PlacedFigure, pieceGrid } from "../src/models";

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

describe("cutting a picture into jigsaw pieces", () => {
  it("makes one piece for each whole cell of the grid", () => {
    expect(pieceGrid(850, 600, 50)).toEqual({ columns: 17, rows: 12 });
    expect(pieceGrid(830, 610, 50)).toEqual({ columns: 16, rows: 12 }); // what is left at the far edges is not a piece
    expect(pieceGrid(800, 600, 0)).toEqual({ columns: 0, rows: 0 });
    const { placed, columns, rows } = cut();
    expect([columns, rows, placed.length]).toEqual([4, 3, 12]);
    expect(new Set(placed.map((p) => p.id)).size).toBe(12);
    for (const p of placed) expect([p.object.width, p.object.height]).toEqual([50, 50]);
  });

  it("scatters the pieces in the store frame beside the picture area, all inside it", () => {
    const { placed, storeWidth } = cut(200, 150, 50); // 12 pieces; the frame is 3 × 150 = 450 high
    const frame = JigsawSettings.storeFrame(200, 150, 50, storeWidth)!;
    expect(frame).toEqual({ left: 250, width: storeWidth, height: 450 });
    expect(storeWidth).toBeGreaterThan(0);
    for (const p of placed) {
      expect(p.centerX - 25).toBeGreaterThanOrEqual(frame.left); // the whole piece is in the frame, none on the picture area
      expect(p.centerX + 25).toBeLessThanOrEqual(frame.left + frame.width);
      expect(p.centerY - 25).toBeGreaterThanOrEqual(0);
      expect(p.centerY + 25).toBeLessThanOrEqual(frame.height);
      expect(Number.isInteger(p.centerX * 2) && Number.isInteger(p.centerY * 2)).toBe(true); // whole or half pixels
    }
    expect(Math.max(...placed.map((p) => p.centerY))).toBeGreaterThan(150); // spread down the frame, further than the height of the picture area
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

  it("makes pieces that are allowed on the jigsaw pieces area: the picture area and its store frame", () => {
    const { placed, storeWidth } = cut(850, 600, 50);
    const input = { name: "Puzzle", width: 850, height: 600, gridSize: 50, gridVisible: true, placed, storeWidth };
    expect(new JigsawSettings(input).error()).toBe("");
    expect(Puzzle.validate(placed, 850, 600)).toContain("does not fit"); // not on the picture area alone
    expect(new JigsawSettings({ ...input, storeWidth: 100 }).error()).toContain("does not fit"); // nor in a store that is too narrow
    expect(new JigsawSettings({ ...input, storeWidth: -1 }).error()).toContain("store");
    expect(new JigsawSettings(input).stored().storeWidth).toBe(storeWidth);
    expect("storeWidth" in new JigsawSettings({ ...input, placed: [], storeWidth: 0 }).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, createdAt: 1 }).storeWidth).toBe(storeWidth);
  });

  it("refuses when there is no grid, no room, or too many pieces", () => {
    expect(JigsawCut.cut(800, 600, 0)).toHaveProperty("error");
    expect(JigsawCut.cut(60, 60, 50)).toHaveProperty("error"); // one piece is no puzzle
    const many = JigsawCut.cut(2000, 2000, 50);
    expect(many).toHaveProperty("error");
    expect((many as { error: string }).error).toContain(String(JIGSAW_MAX_PIECES));
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
  const puzzle = () => Puzzle.from([base], 800, 600);
  const at = (d: Puzzle, id = "p") => [d.get(id)!.centerX, d.get(id)!.centerY];
  const put = (x: number, y: number) => ({ ...base, centerX: x, centerY: y });

  it("knows where it belongs: the centre of its cell of the picture", () => {
    expect(new PlacedFigure(base).home()).toEqual({ x: 125, y: 75 });
    expect(new PlacedFigure({ ...base, piece: undefined }).home()).toBeNull();
  });

  it("does not click into place while it is moved, however close it comes", () => {
    expect(at(puzzle().moveFigure("p", 128, 77, 50, 25))).toEqual([128, 77]); // right by its place: still where it is put
    expect(at(puzzle().moveFigure("p", 125, 75, 50, 25))).toEqual([125, 75]);
  });

  it("clicks into place when it is dropped within the range, exactly on its place", () => {
    const d = (x: number, y: number, range: number) => at(Puzzle.from([put(x, y)], 800, 600).dropPieces(["p"], range));
    expect(d(140, 90, 25)).toEqual([125, 75]); // about 21 px off, in a range of 25
    expect(d(100, 75, 25)).toEqual([125, 75]); // exactly 25 px off: just in
    expect(d(99, 75, 25)).toEqual([99, 75]); // 26 px off: out
    expect(d(130, 80, 10)).toEqual([125, 75]); // a smaller range
    expect(d(140, 90, 10)).toEqual([140, 90]);
    expect(d(160, 75, 40)).toEqual([125, 75]); // a bigger range
  });

  it("never clicks when the range is 0, and is not changed when there is nothing to change", () => {
    const near = Puzzle.from([put(126, 76)], 800, 600);
    expect(near.dropPieces(["p"], 0)).toBe(near);
    expect(near.dropPieces(["p"], -5)).toBe(near);
    expect(near.dropPieces(["p"], Number.NaN)).toBe(near);
    const there = Puzzle.from([put(125, 75)], 800, 600);
    expect(there.dropPieces(["p"], 25)).toBe(there); // already exactly there
    expect(there.dropPieces(["nobody"], 25)).toBe(there);
  });

  it("looks only at the pieces that were dropped, and only at pieces", () => {
    const other = { ...put(130, 80), id: "q", piece: { ...piece, col: 5, row: 4 } }; // belongs at 275, 225: not near
    const near = { ...put(130, 80), id: "r" }; // near its own place, but was not dropped
    const plain = { id: "s", centerX: 125, centerY: 77, object: { ...DEFAULT_OBJECT, width: 50, height: 50 } }; // not a piece
    const d = Puzzle.from([put(130, 80), other, near, plain], 800, 600).dropPieces(["p", "q", "s"], 25);
    expect(at(d, "p")).toEqual([125, 75]);
    expect(at(d, "q")).toEqual([130, 80]); // at the place of another piece: stays
    expect(at(d, "r")).toEqual([130, 80]); // not dropped
    expect(at(d, "s")).toEqual([125, 77]); // not a piece
  });

  it("clicks several dropped pieces at once", () => {
    const other = { ...put(60, 120), id: "q", piece: { ...piece, col: 1, row: 2 } }; // belongs at 75, 125
    const d = Puzzle.from([put(130, 80), other], 800, 600).dropPieces(["p", "q"], 25);
    expect([at(d, "p"), at(d, "q")]).toEqual([[125, 75], [75, 125]]);
  });

  it("moves in steps 50 times smaller than the grid, not from grid point to grid point", () => {
    expect(at(puzzle().moveFigure("p", 333.4, 222.6, 50, 25))).toEqual([333, 223]); // a 50 px grid: steps of 1 px
    expect(at(puzzle().moveFigure("p", 333.4, 222.6, 100, 50))).toEqual([334, 222]); // a 100 px grid: steps of 2 px from 50 (..., 332, 334, ...)
    expect(at(puzzle().moveFigure("p", 400, 300, 50, 25))).toEqual([400, 300]); // the grid points are among the steps
    expect(at(puzzle().moveFigure("p", 333.4, 222.6, 10, 5))).toEqual([333.5, 222.5]); // never finer than half a pixel
    expect(at(puzzle().moveFigure("p", 333.4, 222.6, 1, 0))).toEqual([333.5, 222.5]);
    // a grid that is not a multiple of 25 (the grid worked out from a number of pieces): the step is still a whole number of half pixels, so a piece is always on a whole or a half pixel
    expect(at(puzzle().moveFigure("p", 333.4, 222.6, 101, 50.5))).toEqual([332.5, 222.5]); // 101 / 50 = 2.02, made 2
    for (const grid of [101, 58, 77, 33, 71, 123, 19]) {
      for (const [x, y] of [[333.37, 222.61], [150.9, 99.1], [401.23, 301.77]]) {
        const [px, py] = at(puzzle().moveFigure("p", x, y, grid, grid / 2));
        expect(Number.isInteger(px * 2) && Number.isInteger(py * 2)).toBe(true);
      }
    }
    // a figure that is not a piece still sticks to the grid points
    const plain = Puzzle.from([{ ...base, piece: undefined }], 800, 600).moveFigure("p", 333.4, 222.6, 50, 25);
    expect(at(plain)).toEqual([325, 225]);
  });

  it("stays where it is once it lies on its own place: it is fixed", () => {
    const placed = puzzle().moveFigure("p", 130, 80, 50, 25).dropPieces(["p"], 25);
    expect(at(placed)).toEqual([125, 75]);
    expect(placed.isFixed(["p"])).toBe(true);
    expect(placed.moveFigure("p", 325, 225, 50, 25)).toBe(placed);
    expect(placed.moveGroup(["p"], 100, 100)).toBe(placed);
    expect(placed.movable(["p"])).toEqual([]);
  });
});

describe("the author of a jigsaw", () => {
  const input = { name: "Puzzle", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] };

  it("is kept trimmed, left out when empty, and checked", () => {
    expect(new JigsawSettings({ ...input, author: "  Karin  " }).stored().author).toBe("Karin");
    expect("author" in new JigsawSettings({ ...input, author: "   " }).stored()).toBe(false);
    expect("author" in new JigsawSettings(input).stored()).toBe(false);
    expect(new JigsawSettings({ ...input, author: "Karin" }).error()).toBe("");
    expect(new JigsawSettings({ ...input, author: 5 }).error()).toMatch(/author/);
    expect(new JigsawSettings({ ...input, author: "x".repeat(200) }).error()).toMatch(/author/);
    expect(JigsawSettings.fromStored("a", { ...input, author: "Karin" }).author).toBe("Karin");
    expect("author" in JigsawSettings.fromStored("a", input)).toBe(false); // a jigsaw saved before there was an author
  });
});

describe("how close a piece has to be dropped, a setting of the jigsaw", () => {
  const input = { name: "Puzzle", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] };

  it("is a percent of the grid size, 25 when the jigsaw says nothing", () => {
    expect(JigsawSettings.DEFAULT_SNAP_PERCENT).toBe(25);
    expect([JigsawSettings.snapRangePx(50, 50), JigsawSettings.snapRangePx(20, 50), JigsawSettings.snapRangePx(100, 80), JigsawSettings.snapRangePx(0, 50)]).toEqual([25, 10, 80, 0]);
    expect([JigsawSettings.snapRangePx(50, 0), JigsawSettings.snapRangePx(-5, 50)]).toEqual([0, 0]); // no grid or a bad percent: never
  });

  it("is saved with the jigsaw (also 0, which means never), and a jigsaw without it has none", () => {
    expect(new JigsawSettings({ ...input, snapPercent: 30 }).stored().snapPercent).toBe(30);
    expect(new JigsawSettings({ ...input, snapPercent: 0 }).stored().snapPercent).toBe(0);
    expect("snapPercent" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, snapPercent: 70, createdAt: 1 }).snapPercent).toBe(70);
    expect("snapPercent" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("is a whole number of percent from 0 to 100", () => {
    for (const bad of [-1, 1.5, "5", null, 101, 5000, Number.NaN]) expect(new JigsawSettings({ ...input, snapPercent: bad }).error()).toContain("snap range");
    for (const good of [0, 1, 50, 100]) expect(new JigsawSettings({ ...input, snapPercent: good }).error()).toBe("");
  });
});

describe("the corner and edge pieces", () => {
  const border = (columns: number, rows: number) => {
    const cut = JigsawCut.cut(columns * 50, rows * 50, 50, () => 0.3);
    if ("error" in cut) throw new Error(cut.error);
    return cut.placed.map((p) => ({ col: p.piece!.col, row: p.piece!.row, isBorder: JigsawPieces.isBorder(p.piece!) }));
  };

  it("are the pieces on the border of the picture: every one that has a flat side", () => {
    const pieces = border(4, 3);
    expect(pieces).toHaveLength(12);
    expect(pieces.filter((p) => p.isBorder)).toHaveLength(10); // 4 corners and 6 edge pieces: 2 × (4 + 3) − 4
    expect(pieces.filter((p) => !p.isBorder).map((p) => [p.col, p.row])).toEqual([[1, 1], [2, 1]]); // only the two from the inside
    for (const p of pieces) expect(p.isBorder).toBe(p.col === 0 || p.col === 3 || p.row === 0 || p.row === 2);
  });

  it("are all of a picture that is one piece wide, and the number is right for a bigger picture", () => {
    expect(border(5, 1).every((p) => p.isBorder)).toBe(true);
    expect(border(2, 2).every((p) => p.isBorder)).toBe(true);
    expect(border(16, 12).filter((p) => p.isBorder)).toHaveLength(2 * (16 + 12) - 4);
    expect(border(16, 12).filter((p) => !p.isBorder)).toHaveLength(14 * 10);
  });

  it("is told by the edges: a flat side (0) makes a piece a border piece, tabs and blanks on all four do not", () => {
    expect(JigsawPieces.isBorder({ top: 0, right: 1, bottom: -1, left: 1 })).toBe(true);
    expect(JigsawPieces.isBorder({ top: 0, right: 0, bottom: 1, left: -1 })).toBe(true); // a corner
    expect(JigsawPieces.isBorder({ top: 1, right: -1, bottom: 1, left: -1 })).toBe(false);
  });
});

describe("the frame around the picture area, a setting of the jigsaw", () => {
  const input = { name: "Puzzle", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] };

  it("is a frame that can be seen, 4 pixels, when the jigsaw says nothing", () => {
    expect(JigsawSettings.DEFAULT_FRAME_WIDTH).toBe(4);
    expect(JigsawSettings.MAX_FRAME_WIDTH).toBe(20);
  });

  it("is saved with the jigsaw (also 0, which means no frame), and a jigsaw without it has none", () => {
    expect(new JigsawSettings({ ...input, frameWidth: 8 }).stored().frameWidth).toBe(8);
    expect(new JigsawSettings({ ...input, frameWidth: 0 }).stored().frameWidth).toBe(0);
    expect("frameWidth" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, frameWidth: 6, createdAt: 1 }).frameWidth).toBe(6);
    expect("frameWidth" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("is a whole number of pixels from 0 to 20", () => {
    for (const bad of [-1, 1.5, "4", null, 21, 500, Number.NaN]) expect(new JigsawSettings({ ...input, frameWidth: bad }).error()).toContain("frame");
    for (const good of [0, 1, 4, 20]) expect(new JigsawSettings({ ...input, frameWidth: good }).error()).toBe("");
  });
});

describe("the name of the picture file", () => {
  const input = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: true, placed: [] };

  it("is kept with the jigsaw (trimmed), and a jigsaw without it has none", () => {
    expect(new JigsawSettings({ ...input, pictureName: "  IMG_1.jpg " }).stored().pictureName).toBe("IMG_1.jpg");
    expect("pictureName" in new JigsawSettings({ ...input, pictureName: "  " }).stored()).toBe(false);
    expect("pictureName" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, pictureName: "a.png", createdAt: 1 }).pictureName).toBe("a.png");
    expect("pictureName" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("is at most 200 characters", () => {
    expect(new JigsawSettings({ ...input, pictureName: "a".repeat(200) }).error()).toBe("");
    for (const bad of ["a".repeat(201), 5, null]) expect(new JigsawSettings({ ...input, pictureName: bad }).error()).toContain("picture file");
  });
});

describe("what the players of a jigsaw share", () => {
  const before = { width: 200, height: 150, gridSize: 50, storeWidth: 300, snapPercent: 10, timed: false };

  it("is the size, the cut (grid and store), the difficulty and the clock: a change of any is a change", () => {
    expect(JigsawSettings.changesWhatPlayersShare(before, { ...before })).toBe(false);
    for (const change of [{ width: 201 }, { height: 1 }, { gridSize: 25 }, { storeWidth: 0 }, { storeWidth: 301 }, { snapPercent: 11 }, { snapPercent: undefined }, { timed: true }, { timed: undefined }]) {
      expect(JigsawSettings.changesWhatPlayersShare(before, { ...before, ...change })).toBe(true);
    }
  });

  it("takes what a jigsaw says nothing about as the default: timed, the default difficulty, no store", () => {
    const plain = { width: 200, height: 150, gridSize: 50 };
    expect(JigsawSettings.changesWhatPlayersShare(plain, { ...plain })).toBe(false);
    expect(JigsawSettings.changesWhatPlayersShare(plain, { ...plain, timed: true, snapPercent: JigsawSettings.DEFAULT_SNAP_PERCENT, storeWidth: 0 })).toBe(false);
    expect(JigsawSettings.changesWhatPlayersShare(plain, { ...plain, timed: false })).toBe(true);
    expect(JigsawSettings.changesWhatPlayersShare(plain, { ...plain, snapPercent: 40 })).toBe(true);
  });

  it("leaves the name, the description, the author, who sees it and the look free", () => {
    const next = { ...before, name: "Other", description: "d", author: "a", ownerUid: "u", visibility: "owner", lineWidth: 3, lineColor: "#ff0000", backColor: "#000000" };
    expect(JigsawSettings.changesWhatPlayersShare(before, next)).toBe(false);
  });
});

describe("the description of a jigsaw", () => {
  const input = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: true, placed: [] };

  it("is optional, kept trimmed, and a jigsaw without one has none", () => {
    expect(new JigsawSettings({ ...input, description: "  A day at the harbour  " }).stored().description).toBe("A day at the harbour");
    expect("description" in new JigsawSettings({ ...input, description: "  " }).stored()).toBe(false);
    expect("description" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, description: "Summer", createdAt: 1 }).description).toBe("Summer");
    expect("description" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("is at most 500 characters, and text", () => {
    expect(new JigsawSettings({ ...input, description: "a".repeat(500) }).error()).toBe("");
    expect(new JigsawSettings({ ...input, description: "" }).error()).toBe("");
    for (const bad of ["a".repeat(501), 5, null]) expect(new JigsawSettings({ ...input, description: bad }).error()).toContain("description");
  });
});

describe("the categories of a jigsaw", () => {
  const input = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: true, placed: [] };

  it("are optional, kept as known keys in the order they are shown, and a jigsaw without any has none", () => {
    expect(new JigsawSettings({ ...input, categories: ["nature", "family"] }).stored().categories).toEqual(["family", "nature"]);
    expect("categories" in new JigsawSettings({ ...input, categories: [] }).stored()).toBe(false);
    expect("categories" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, categories: ["travel"], createdAt: 1 }).categories).toEqual(["travel"]);
    expect(JigsawSettings.fromStored("x", { ...input, categories: ["old-one", "kids"], createdAt: 1 }).categories).toEqual(["kids"]); // what is not a category any more is left out
    expect("categories" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("are at most three, each once and each a known one", () => {
    expect(new JigsawSettings({ ...input, categories: ["family", "travel", "nature"] }).error()).toBe("");
    for (const bad of [["family", "travel", "nature", "art"], ["family", "family"], ["boats"], "family", null]) {
      expect(new JigsawSettings({ ...input, categories: bad }).error()).not.toBe("");
    }
  });

  it("can change after the jigsaw has been played, like the name", () => {
    const before = { width: 100, height: 100, gridSize: 50 };
    expect(JigsawSettings.changesWhatPlayersShare(before, { ...before, categories: ["art"] } as never)).toBe(false);
  });
});

describe("the language of a jigsaw", () => {
  const input = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: true, placed: [] };

  it("is optional, one of the languages of the app, and a jigsaw that says nothing is English", () => {
    expect(new JigsawSettings({ ...input, language: "nb" }).stored().language).toBe("nb");
    expect("language" in new JigsawSettings(input).stored()).toBe(false);
    expect("language" in new JigsawSettings({ ...input, language: "xx" }).stored()).toBe(false); // only what is a language is kept
    expect(JigsawSettings.fromStored("x", { ...input, language: "de", createdAt: 1 }).language).toBe("de");
    expect("language" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
    expect(JigsawLanguages.of(JigsawSettings.fromStored("x", { ...input, createdAt: 1 }))).toBe("en");
    expect(JigsawLanguages.of({ language: "fr" })).toBe("fr");
    expect(JigsawLanguages.nameOf("nb")).toBe("Norsk");
    expect(JigsawLanguages.nameOf("zz")).toBe("zz");
  });

  it("is refused when it is not one of the languages of the app", () => {
    expect(new JigsawSettings({ ...input, language: "es" }).error()).toBe("");
    expect(new JigsawSettings(input).error()).toBe("");
    for (const bad of ["xx", "", 3, null]) expect(new JigsawSettings({ ...input, language: bad }).error()).toMatch(/language must be one of/);
  });

  it("can change after the jigsaw has been played, like the name", () => {
    const before = { width: 100, height: 100, gridSize: 50 };
    expect(JigsawSettings.changesWhatPlayersShare(before, { ...before, language: "sv" } as never)).toBe(false);
  });
});

describe("the line round the pieces", () => {
  const input = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: true, placed: [] };

  it("is saved with the jigsaw (also 0, no line), and a jigsaw without it has none", () => {
    const stored = new JigsawSettings({ ...input, lineWidth: 0, lineColor: "#FF0000" }).stored();
    expect(stored.lineWidth).toBe(0);
    expect(stored.lineColor).toBe("#ff0000");
    expect("lineWidth" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, lineWidth: 3, lineColor: "#00ff00", createdAt: 1 }).lineWidth).toBe(3);
    expect("lineColor" in JigsawSettings.fromStored("x", { ...input, createdAt: 1 })).toBe(false);
  });

  it("is a whole number of pixels from 0 to 6, in a colour written #rrggbb", () => {
    for (const bad of [-1, 1.5, "2", null, 7]) expect(new JigsawSettings({ ...input, lineWidth: bad }).error()).toContain("line");
    for (const good of [0, 1, 6]) expect(new JigsawSettings({ ...input, lineWidth: good }).error()).toBe("");
    for (const bad of ["red", "#fff", "#12345g", 5, null]) expect(new JigsawSettings({ ...input, lineColor: bad }).error()).toContain("colour");
    expect(new JigsawSettings({ ...input, lineColor: "#a1B2c3" }).error()).toBe("");
  });
});

describe("the background colour of the picture area", () => {
  const input = { name: "x", width: 100, height: 100, gridSize: 50, gridVisible: true, placed: [] };

  it("is saved with the jigsaw as #rrggbb, and a jigsaw without it has none", () => {
    expect(new JigsawSettings({ ...input, backColor: "#AABBCC" }).stored().backColor).toBe("#aabbcc");
    expect("backColor" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, backColor: "#112233", createdAt: 1 }).backColor).toBe("#112233");
    expect(new JigsawSettings({ ...input, backColor: "#abcdef" }).error()).toBe("");
    for (const bad of ["white", "#fff", 3, null]) expect(new JigsawSettings({ ...input, backColor: bad }).error()).toContain("background");
  });
});

describe("the standard numbers of pieces for a shape", () => {
  it("are whole columns and rows in the shape of the picture area, smallest first", () => {
    expect(JigsawCut.pieceChoices(800, 600).map((c) => [c.columns, c.rows, c.count])).toEqual([[8, 6, 48], [12, 9, 108], [16, 12, 192], [20, 15, 300], [24, 18, 432], [32, 24, 768], [36, 27, 972]]);
    for (const [w, h] of [[900, 600], [960, 540], [700, 700], [600, 800], [1200, 400]]) {
      const choices = JigsawCut.pieceChoices(w, h);
      expect(choices.length).toBeGreaterThan(0);
      let before = 0;
      for (const c of choices) {
        expect(c.count).toBe(c.columns * c.rows);
        expect(c.count).toBeGreaterThan(before);
        expect(c.count).toBeLessThanOrEqual(1000);
        expect(Math.abs(c.columns / c.rows - w / h) / (w / h)).toBeLessThanOrEqual(0.04);
        before = c.count;
      }
    }
  });

  it("make a picture area that fits them exactly, as near the size asked for as it can be", () => {
    expect(JigsawCut.layoutOf(800, 600, 16, 12)).toEqual({ grid: 50, width: 800, height: 600, columns: 16, rows: 12 });
    expect(JigsawCut.layoutOf(800, 600, 24, 18)).toEqual({ grid: 33, width: 792, height: 594, columns: 24, rows: 18 });
  });
});

describe("the grid size from the number of pieces", () => {
  const layout = (w: number, h: number, n: number) => JigsawCut.layoutFor(w, h, n);

  it("makes square pieces and a picture area of a whole number of them, as near the number asked for as it can", () => {
    const l = layout(800, 600, 192);
    expect(l).toEqual({ grid: 50, width: 800, height: 600, columns: 16, rows: 12 });
    expect(l.columns * l.rows).toBe(192);
    const d = layout(800, 600, 48); // ideal: the square root of 800 × 600 / 48 = 100
    expect([d.grid, d.columns * d.rows]).toEqual([100, 48]);
    const e = layout(800, 600, 12);
    expect([e.grid, e.width, e.height, e.columns * e.rows]).toEqual([200, 800, 600, 12]);
  });

  it("fits the picture area to the pieces, a few pieces more or fewer than asked when that is what whole squares give", () => {
    const l = layout(830, 610, 100); // 830 × 610 / 100: a piece about 71 px
    expect(l.width % l.grid).toBe(0);
    expect(l.height % l.grid).toBe(0);
    expect(l.columns * l.rows).toBe((l.width / l.grid) * (l.height / l.grid));
    expect(Math.abs(l.columns * l.rows - 100)).toBeLessThanOrEqual(12);
    expect(Math.abs(l.width - 830)).toBeLessThan(l.grid); // the picture area is made about as big as it was
    const odd = layout(1000, 700, 77);
    expect(odd.width % odd.grid).toBe(0);
    expect(Math.abs(odd.columns * odd.rows - 77)).toBeLessThanOrEqual(10);
  });

  it("takes the grid that gives the number of pieces nearest to the one asked for", () => {
    for (const [w, h, n] of [[800, 600, 100], [1000, 500, 60], [640, 480, 35], [900, 900, 81]] as const) {
      const l = layout(w, h, n);
      const miss = Math.abs(l.columns * l.rows - n);
      for (let g = 5; g <= 300; g++) {
        const count = Math.round(JigsawSettings.fittedSide(w, g) / g) * Math.round(JigsawSettings.fittedSide(h, g) / g);
        if (count <= 1000 && count >= 2) expect(miss).toBeLessThanOrEqual(Math.abs(count - n) + 1e-9 + (Math.abs(g - Math.sqrt((w * h) / n)) <= 3 ? 0 : Infinity));
      }
    }
  });

  it("keeps the number of pieces within what can be, and the layout allowed as a picture area", () => {
    expect(layout(800, 600, 100000).columns * layout(800, 600, 100000).rows).toBeLessThanOrEqual(JIGSAW_MAX_PIECES);
    expect(layout(800, 600, 1).columns * layout(800, 600, 1).rows).toBeGreaterThanOrEqual(2);
    expect(layout(800, 600, Number.NaN).columns * layout(800, 600, Number.NaN).rows).toBeGreaterThanOrEqual(2);
    const l = layout(800, 600, 192);
    const cut = JigsawCut.cut(l.width, l.height, l.grid, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    expect(cut.placed).toHaveLength(192); // the layout is what the cutting makes
    expect([cut.columns, cut.rows]).toEqual([l.columns, l.rows]);
  });

  it("still gives a layout for a picture area that is tiny or huge for the number", () => {
    const tiny = layout(3, 2, 50);
    expect(tiny.grid).toBeGreaterThanOrEqual(1);
    expect(tiny.width % tiny.grid).toBe(0);
    const big = layout(10000, 10000, 500);
    expect(big.columns * big.rows).toBeLessThanOrEqual(JIGSAW_MAX_PIECES);
    expect(big.width).toBeLessThanOrEqual(10000);
  });
});

describe("pieces that stick together", () => {
  const size = 50;
  const square = { ...DEFAULT_OBJECT, width: size, height: size };
  /** a piece of the picture (col, row) lying at x, y */
  const mk = (col: number, row: number, x: number, y: number, layer = 10) => ({
    id: `piece-${col}-${row}`,
    centerX: x,
    centerY: y,
    layer,
    object: square,
    piece: { col, row, top: 0, right: 0, bottom: 0, left: 0 } as const,
  });
  const world = (...pieces: ReturnType<typeof mk>[]) => Puzzle.from(pieces, 1000, 800);
  const at = (d: Puzzle, id: string) => [d.get(id)!.centerX, d.get(id)!.centerY];
  const names = (ids: string[]) => [...ids].sort();

  describe("what is fixed", () => {
    it("is a piece on its own place, and a piece that is not there can be moved", () => {
      const d = world(mk(2, 1, 300, 200), mk(4, 4, 600, 600));
      expect(d.isFixed(["piece-2-1"])).toBe(false); // belongs at 125, 75: it is not there
      const home = world(mk(2, 1, 125, 75));
      expect(home.isFixed(["piece-2-1"])).toBe(true);
      expect(world(mk(2, 1, 125.5, 75)).isFixed(["piece-2-1"])).toBe(true); // a half pixel is still there
      expect(world(mk(2, 1, 126, 75)).isFixed(["piece-2-1"])).toBe(false);
    });

    it("is the whole group when one piece of it is on its own place, and none of it when no piece is", () => {
      const fixed = world(mk(2, 1, 125, 75), mk(3, 1, 175, 75), mk(2, 2, 125, 125)); // the group lies on its place
      for (const id of ["piece-2-1", "piece-3-1", "piece-2-2"]) expect(fixed.isFixed([id])).toBe(true);
      expect(fixed.moveGroup(["piece-3-1", "piece-2-1", "piece-2-2"], 40, 40)).toBe(fixed);
      const loose = world(mk(2, 1, 400, 300), mk(3, 1, 450, 300)); // stuck together, but not on their place
      expect(loose.isFixed(["piece-2-1"])).toBe(false);
      expect(at(loose.moveGroup(["piece-2-1", "piece-3-1"], 40, 40), "piece-3-1")).toEqual([490, 340]); // all of it moves together
      // a piece that lies on its place and is stuck to others holds the whole group, wherever the others are drawn
      const one = world(mk(2, 1, 125, 75), mk(3, 1, 175, 75), mk(9, 9, 100, 100));
      expect(one.movable(["piece-2-1", "piece-9-9"])).toEqual(["piece-9-9"]);
    });

    it("is not collected from the store, and a figure that is not a piece is never fixed", () => {
      const d = world(mk(2, 1, 125, 75), mk(7, 3, 700, 500));
      const collected = d.collectPieces(["piece-2-1", "piece-7-3"], { left: 600, top: 0, width: 300 });
      expect(at(collected, "piece-2-1")).toEqual([125, 75]);
      expect(at(collected, "piece-7-3")).not.toEqual([700, 500]);
      const plain = Puzzle.from([{ id: "box", centerX: 25, centerY: 25, object: square }], 1000, 800);
      expect(plain.isFixed(["box"])).toBe(false);
      expect(plain.isFixed(["nobody"])).toBe(false);
    });
  });

  describe("what sticks", () => {
    it("is neighbours in the picture that lie exactly where they belong in relation to each other", () => {
      const d = world(mk(2, 1, 400, 300), mk(3, 1, 450, 300), mk(2, 2, 400, 350));
      expect(names(d.stuckGroup(["piece-2-1"]))).toEqual(["piece-2-1", "piece-2-2", "piece-3-1"]);
      expect(names(d.stuckGroup(["piece-3-1"]))).toEqual(["piece-2-1", "piece-2-2", "piece-3-1"]); // from any piece of the group
    });

    it("is a whole group: a piece sticks to what the piece it sticks to sticks to", () => {
      const d = world(mk(0, 0, 100, 100), mk(1, 0, 150, 100), mk(2, 0, 200, 100), mk(3, 0, 250, 100), mk(4, 0, 300, 100));
      expect(d.stuckGroup(["piece-0-0"])).toHaveLength(5);
    });

    it("is not neighbours that are a little off, nor pieces that are not neighbours in the picture", () => {
      const off = world(mk(2, 1, 400, 300), mk(3, 1, 451, 300), mk(2, 2, 400, 350.5));
      expect(off.stuckGroup(["piece-2-1"])).toEqual(["piece-2-1"]); // 1 px and half a pixel off
      const far = world(mk(0, 0, 100, 100), mk(2, 0, 200, 100)); // exactly two pieces apart, but the piece between them is missing
      expect(far.stuckGroup(["piece-0-0"])).toEqual(["piece-0-0"]);
      const wrongWay = world(mk(2, 1, 400, 300), mk(3, 1, 350, 300)); // the right neighbour is on the left
      expect(wrongWay.stuckGroup(["piece-2-1"])).toEqual(["piece-2-1"]);
      const diagonal = world(mk(2, 1, 400, 300), mk(3, 2, 450, 350)); // corners touch: they are not neighbours
      expect(diagonal.stuckGroup(["piece-2-1"])).toEqual(["piece-2-1"]);
    });

    it("sticks nothing to an object that is not a piece, and gives back what it was asked about", () => {
      const plain = { id: "box", centerX: 400, centerY: 300, object: square };
      const d = Puzzle.from([plain, mk(2, 1, 450, 300)], 1000, 800);
      expect(d.stuckGroup(["box"])).toEqual(["box"]);
      expect(d.stuckGroup(["nobody"])).toEqual(["nobody"]);
      expect(d.stuckGroup([])).toEqual([]);
    });
  });

  describe("when it is dropped", () => {
    it("a piece dropped close to where it fits a neighbour moves exactly there and sticks to it", () => {
      const d = world(mk(2, 1, 400, 300), mk(3, 1, 462, 311)); // 12 px and 11 px from fitting
      const dropped = d.dropPieces(["piece-3-1"], 25);
      expect(at(dropped, "piece-3-1")).toEqual([450, 300]);
      expect(at(dropped, "piece-2-1")).toEqual([400, 300]); // the one it fits did not move
      expect(names(dropped.stuckGroup(["piece-3-1"]))).toEqual(["piece-2-1", "piece-3-1"]);
    });

    it("sticks on any side: below, above, left", () => {
      for (const [col, row, x, y, expected] of [[2, 2, 395, 360, [400, 350]], [2, 0, 406, 238, [400, 250]], [1, 1, 342, 296, [350, 300]]] as const) {
        const d = world(mk(2, 1, 400, 300), mk(col, row, x, y));
        expect(at(d.dropPieces([`piece-${col}-${row}`], 25), `piece-${col}-${row}`)).toEqual(expected);
      }
    });

    it("does not stick when it is dropped further away than the range, or when the range is 0", () => {
      const d = world(mk(2, 1, 400, 300), mk(3, 1, 480, 300)); // 30 px from fitting
      expect(d.dropPieces(["piece-3-1"], 25)).toBe(d);
      expect(d.dropPieces(["piece-3-1"], 29)).toBe(d);
      expect(at(d.dropPieces(["piece-3-1"], 30), "piece-3-1")).toEqual([450, 300]); // just in
      const near = world(mk(2, 1, 400, 300), mk(3, 1, 455, 302));
      expect(near.dropPieces(["piece-3-1"], 0)).toBe(near);
    });

    it("does not stick to a piece that is not a neighbour in the picture, even if it is close", () => {
      const d = world(mk(2, 1, 400, 300), mk(5, 4, 452, 301)); // right beside it, but it belongs far away
      expect(d.dropPieces(["piece-5-4"], 25)).toBe(d);
    });

    it("moves a whole group, and the group sticks to what it fits: all the pieces keep their places in relation to each other", () => {
      const d = world(mk(0, 0, 100, 100), mk(1, 0, 150, 100), mk(2, 0, 204, 108), mk(3, 0, 254, 108)); // two groups of two, the second 4 and 8 px off
      expect(d.stuckGroup(["piece-2-0"]).sort()).toEqual(["piece-2-0", "piece-3-0"]);
      const dropped = d.dropPieces(["piece-2-0"], 25); // the group of the piece that was dropped
      expect([at(dropped, "piece-2-0"), at(dropped, "piece-3-0")]).toEqual([[200, 100], [250, 100]]);
      expect(dropped.stuckGroup(["piece-0-0"])).toHaveLength(4);
    });

    it("takes the smallest step when it could stick in more than one way", () => {
      // piece 2,1 can fit the one on its left (needs 10 px) or the one above it (needs 4 px): it takes the smaller
      const d = world(mk(1, 1, 300, 300), mk(2, 0, 454, 250), mk(2, 1, 360, 304));
      const dropped = d.dropPieces(["piece-2-1"], 25);
      expect(at(dropped, "piece-2-1")).toEqual([350, 300]); // 10 px right, 4 px up: the left neighbour is 10 px away, above it is farther
    });

    it("clicks onto its own place when that is nearer than a neighbour", () => {
      const d = world(mk(2, 1, 125, 75), mk(3, 1, 200, 100)); // piece 3,1 belongs at 175, 75, and its neighbour is at home too: fitting the neighbour is the same place
      expect(at(d.dropPieces(["piece-3-1"], 40), "piece-3-1")).toEqual([175, 75]);
      const farOff = world(mk(2, 1, 125, 75), mk(3, 1, 330, 200)); // about 199 px from its place: out of a range of 150
      expect(farOff.dropPieces(["piece-3-1"], 150)).toBe(farOff);
      const alone = world(mk(3, 1, 180, 82));
      expect(at(alone.dropPieces(["piece-3-1"], 25), "piece-3-1")).toEqual([175, 75]); // no neighbours: its own place
    });

    it("clicks exactly or not at all: when the area has no room for the step, the group stays where it was dropped", () => {
      const room = Puzzle.from([mk(0, 0, 25, 25), mk(1, 0, 90, 25)], 200, 100); // piece 1,0 is 15 px from fitting, to the right: there is room
      expect(at(room.dropPieces(["piece-1-0"], 25), "piece-1-0")).toEqual([75, 25]);
      const edge = Puzzle.from([mk(6, 5, 30, 100), mk(5, 5, 12, 100)], 200, 300); // piece 5,5 would have to go to x = 30 - 50 = -20, outside the area
      expect(edge.dropPieces(["piece-5-5"], 40)).toBe(edge); // not moved a little towards it
      const group = Puzzle.from([mk(6, 5, 30, 100), mk(5, 5, 12, 100), mk(5, 6, 12, 150)], 200, 300); // the group of 5,5 and 5,6 has no room either
      expect(group.dropPieces(["piece-5-5"], 40)).toBe(group);
    });

    it("several groups that were dropped together each click on their own", () => {
      const d = world(mk(2, 1, 400, 300), mk(3, 1, 462, 308), mk(7, 5, 600, 500), mk(8, 5, 662, 508));
      const dropped = d.dropPieces(["piece-3-1", "piece-8-5"], 25);
      expect([at(dropped, "piece-3-1"), at(dropped, "piece-8-5")]).toEqual([[450, 300], [650, 500]]);
    });

    it("lets pieces that are stuck go on being stuck when one of them is moved away alone", () => {
      const d = world(mk(2, 1, 400, 300), mk(3, 1, 450, 300));
      expect(d.stuckGroup(["piece-2-1"])).toHaveLength(2);
      const away = d.moveFigure("piece-3-1", 700.5, 500, 50, 25);
      expect(away.stuckGroup(["piece-2-1"])).toEqual(["piece-2-1"]); // it was pulled loose: no longer where it belongs in relation to its neighbour
      expect(away.stuckGroup(["piece-3-1"])).toEqual(["piece-3-1"]);
    });
  });
});

describe("collecting the pieces in the store frame", () => {
  const size = 50;
  const square = { ...DEFAULT_OBJECT, width: size, height: size };
  const mk = (col: number, row: number, x: number, y: number, layer = 10) => ({
    id: `piece-${col}-${row}`,
    centerX: x,
    centerY: y,
    layer,
    object: square,
    piece: { col, row, top: 0, right: 0, bottom: 0, left: 0 } as const,
  });
  // the area: a picture area 400 wide, then the store frame from x = 450, 300 wide, and 1200 high
  const frame = { left: 450, top: 0, width: 300 };
  const world = (...pieces: ReturnType<typeof mk>[]) => Puzzle.from(pieces, 750, 1200);
  const at = (d: Puzzle, id: string) => [d.get(id)!.centerX, d.get(id)!.centerY];
  const left = (d: Puzzle, id: string) => d.get(id)!.centerX - size / 2;
  const top = (d: Puzzle, id: string) => d.get(id)!.centerY - size / 2;

  it("puts the pieces together at the top of the frame, in rows from the top left, close to each other", () => {
    const d = world(mk(0, 0, 700, 900), mk(1, 0, 500, 400), mk(2, 0, 600, 700), mk(3, 0, 480, 1100));
    const c = d.collectPieces(d.items.map((i) => i.id), frame);
    const margin = Math.round(0.35 * size); // 18
    const gap = Math.round(0.3 * size); // 15
    // reading order of how they lay: from the top down: 1,0 (400), 2,0 (700), 0,0 (900), 3,0 (1100)
    expect([left(c, "piece-1-0"), top(c, "piece-1-0")]).toEqual([frame.left + margin, margin]);
    expect(left(c, "piece-2-0")).toBe(frame.left + margin + size + gap);
    expect(top(c, "piece-2-0")).toBe(margin); // the same row
    expect(left(c, "piece-0-0")).toBe(frame.left + margin + 2 * (size + gap));
    expect(top(c, "piece-0-0")).toBe(margin);
    // the frame is 300 wide, and a row can go to 18 px from its right edge: four pieces fit (the fourth ends at 713, the limit is 732), so all four are in one row
    expect(left(c, "piece-3-0")).toBe(frame.left + margin + 3 * (size + gap));
    expect(top(c, "piece-3-0")).toBe(margin);
  });

  it("with a random, the pieces lie more by chance: the places and the distances differ, and every piece is still inside the frame", () => {
    const pieces = Array.from({ length: 12 }, (_, i) => mk(i, 0, 470 + (i % 5) * 50, 100 + i * 80));
    const d = world(...pieces);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // the same numbers every run
    const tidy = d.collectPieces(d.items.map((i) => i.id), frame);
    const loose = d.collectPieces(d.items.map((i) => i.id), frame, random);
    expect(loose).not.toBe(tidy);
    const gaps = new Set(pieces.slice(0, 11).map((_, i) => Math.round(left(loose, pieces[i + 1].id) - left(loose, pieces[i].id))));
    expect(gaps.size).toBeGreaterThan(2); // not one distance every time
    for (const p of pieces) {
      expect(left(loose, p.id)).toBeGreaterThanOrEqual(frame.left);
      expect(left(loose, p.id) + size).toBeLessThanOrEqual(frame.left + frame.width);
      expect(top(loose, p.id)).toBeGreaterThanOrEqual(0);
    }
    // no piece is put on another: they are at least a gap apart or in another row (the same pieces as the tidy way, only further apart)
    expect(new Set(pieces.map((p) => at(loose, p.id).join(","))).size).toBe(12);
  });

  it("wraps to the next row when the row is full, and every piece is inside the frame", () => {
    const pieces = Array.from({ length: 12 }, (_, i) => mk(i, 0, 470 + (i % 5) * 50, 100 + i * 80));
    const d = world(...pieces);
    const c = d.collectPieces(d.items.map((i) => i.id), frame);
    const tops = new Set(pieces.map((p) => top(c, p.id)));
    expect(tops.size).toBeGreaterThan(1); // more than one row
    for (const p of pieces) {
      expect(left(c, p.id)).toBeGreaterThanOrEqual(frame.left);
      expect(left(c, p.id) + size).toBeLessThanOrEqual(frame.left + frame.width);
      expect(top(c, p.id)).toBeGreaterThanOrEqual(0);
    }
    // all of the first row is higher than all of the second
    const rows = [...tops].sort((a, b) => a - b);
    expect(rows[1] - rows[0]).toBe(size + Math.round(0.3 * size));
  });

  it("does not put one piece over another", () => {
    const pieces = Array.from({ length: 20 }, (_, i) => mk(i % 8, Math.floor(i / 8), 480 + ((i * 37) % 240), 100 + ((i * 91) % 1000)));
    const d = world(...pieces);
    const c = d.collectPieces(d.items.map((i) => i.id), frame);
    for (const a of pieces) {
      for (const b of pieces) {
        if (a.id === b.id) continue;
        const apart = Math.abs(c.get(a.id)!.centerX - c.get(b.id)!.centerX) >= size || Math.abs(c.get(a.id)!.centerY - c.get(b.id)!.centerY) >= size;
        expect(apart).toBe(true);
      }
    }
  });

  it("keeps the pieces that stick together as they are in relation to each other, and puts them where one piece would go", () => {
    const d = world(mk(2, 1, 600, 800), mk(3, 1, 650, 800), mk(2, 2, 600, 850), mk(7, 7, 520, 200));
    expect(d.stuckGroup(["piece-2-1"])).toHaveLength(3);
    const c = d.collectPieces(d.items.map((i) => i.id), frame);
    expect(at(c, "piece-3-1")[0] - at(c, "piece-2-1")[0]).toBe(50); // still exactly one piece apart
    expect(at(c, "piece-2-2")[1] - at(c, "piece-2-1")[1]).toBe(50);
    expect(c.stuckGroup(["piece-2-1"])).toHaveLength(3); // still stuck
    // the loose piece lay higher: it is first, and the group comes after it, in the same row
    expect(top(c, "piece-7-7")).toBe(Math.round(0.35 * size));
    expect(left(c, "piece-2-1")).toBe(frame.left + Math.round(0.35 * size) + size + Math.round(0.3 * size));
    expect(top(c, "piece-2-1")).toBe(Math.round(0.35 * size));
  });

  it("collects only the pieces it is asked for, and not a group that has a piece that is not in the frame", () => {
    const d = world(mk(2, 1, 600, 800), mk(3, 1, 650, 800), mk(7, 7, 520, 200), mk(0, 0, 100, 100));
    const c = d.collectPieces(["piece-2-1", "piece-7-7"], frame); // 3,1 sticks to 2,1 but is not asked for: the group stays; 0,0 is on the picture area
    expect(at(c, "piece-2-1")).toEqual(at(d, "piece-2-1"));
    expect(at(c, "piece-3-1")).toEqual(at(d, "piece-3-1"));
    expect(at(c, "piece-0-0")).toEqual([100, 100]);
    expect(top(c, "piece-7-7")).toBe(Math.round(0.35 * size));
  });

  it("keeps the layers, ignores what is not a piece, and changes nothing when there is nothing to collect or it is collected already", () => {
    const plain = { id: "box", centerX: 600, centerY: 600, object: square };
    const d = Puzzle.from([plain, mk(1, 0, 500, 400, 33)], 750, 1200);
    const c = d.collectPieces(["box", "piece-1-0", "nobody"], frame);
    expect(c.get("piece-1-0")!.layer).toBe(33);
    expect(at(c, "box")).toEqual([600, 600]);
    expect(d.collectPieces([], frame)).toBe(d);
    expect(d.collectPieces(["box"], frame)).toBe(d);
    expect(c.collectPieces(["piece-1-0"], frame)).toBe(c); // already at the top
  });

  it("is a valid arrangement: places are whole or half pixels and everything is inside the area", () => {
    const pieces = Array.from({ length: 30 }, (_, i) => mk(i % 6, Math.floor(i / 6), 470 + ((i * 53) % 250), 60 + i * 37));
    const c = world(...pieces).collectPieces(pieces.map((p) => p.id), frame);
    expect(Puzzle.validate(c.toData(), 750, 1200)).toBe("");
  });
});

describe("a piece that is picked up goes to the front", () => {
  const square = { ...DEFAULT_OBJECT, width: 50, height: 50 };
  const mk = (id: string, layer: number) => ({ id, centerX: 100, centerY: 100, layer, object: square, piece: { col: 0, row: 0, top: 0, right: 0, bottom: 0, left: 0 } as const });

  it("is put on a layer above all the others, and stays there", () => {
    const d = Puzzle.from([mk("a", 10), mk("b", 40), mk("c", 25)], 400, 400);
    const front = d.bringToFront("a");
    expect(front.get("a")!.layer).toBe(41);
    expect(front.get("b")!.layer).toBe(40); // the others are as they were
    expect(front.get("c")!.layer).toBe(25);
    expect(front.bringToFront("a")).toBe(front); // already in front: nothing changes
    expect(d.bringToFront("nobody")).toBe(d);
  });

  it("stays within the layers there are", () => {
    const d = Puzzle.from([mk("a", 5), mk("b", 1000)], 400, 400);
    expect(d.bringToFront("a").get("a")!.layer).toBe(1000);
    expect(Puzzle.validate(d.bringToFront("a").toData(), 400, 400)).toBe("");
  });
});

describe("moving several pieces at once", () => {
  const square = { ...DEFAULT_OBJECT, width: 50, height: 50 };
  const mk = (id: string, x: number, y: number) => ({ id, centerX: x, centerY: y, layer: 10, object: square, piece: { col: 0, row: 0, top: 0, right: 0, bottom: 0, left: 0 } as const });
  const group = () => Puzzle.from([mk("a", 100, 100), mk("b", 160, 130), mk("c", 400, 300), mk("other", 500, 350)], 600, 400);
  const at = (d: Puzzle, id: string) => [d.get(id)!.centerX, d.get(id)!.centerY];

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
    expect(Puzzle.validate(down.toData(), 600, 400)).toBe("");
  });

  it("changes nothing when it cannot move, or the move is nothing, and ignores what is not a figure", () => {
    const d = group();
    expect(d.moveGroup(["a", "b"], 0, 0)).toBe(d);
    expect(d.moveGroup(["a", "b"], 0.2, -0.2)).toBe(d); // less than half a pixel
    expect(d.moveGroup([], 10, 10)).toBe(d);
    expect(d.moveGroup(["nobody"], 10, 10)).toBe(d);
    expect(d.moveGroup(["a"], Number.NaN, 1)).toBe(d);
    const edge = Puzzle.from([mk("a", 25, 100)], 600, 400);
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
    expect(new JigsawSettings(input).error()).toBe(""); // inside the frame
    const left = 450;
    for (const p of again.placed) expect(p.centerX - 25).toBeGreaterThanOrEqual(left);
  });

  it("brings back a piece that was moved onto the picture area, and leaves what is not a piece alone", () => {
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
    expect(PlacedFigure.stored({ ...base, piece: { ...piece, extra: 1 } as never }).piece).toEqual(piece);
    expect("piece" in PlacedFigure.stored(base)).toBe(false);
  });

  it("is refused when the piece is bad", () => {
    const bad = (p: unknown) => Puzzle.validate([{ ...base, piece: p }], 200, 200);
    expect(bad(piece)).toBe("");
    for (const p of [null, 5, { ...piece, col: -1 }, { ...piece, row: 1.5 }, { ...piece, top: 2 }, { ...piece, left: "1" }, { col: 1, row: 1 }]) {
      expect(bad(p)).toContain("bad jigsaw piece");
    }
  });

  it("keeps its piece when it is moved", () => {
    const moved = Puzzle.from([{ ...base, piece }], 200, 200).moveFigure("p", 125, 75, 50, 25);
    expect(moved.get("p")?.data.piece).toEqual(piece);
  });
});

describe("a grid whose points are half a step in from the edge", () => {
  const object = { ...DEFAULT_OBJECT, width: 50, height: 50 };
  const at = () => Puzzle.from([{ id: "o", centerX: 25, centerY: 25, object }], 200, 150);

  it("sticks an object's centre to those points: 25, 75, 125 ...", () => {
    const placed = (x: number, y: number) => at().moveFigure("o", x, y, 50, 25).items[0];
    expect([placed(60, 40).centerX, placed(60, 40).centerY]).toEqual([75, 25]);
    expect([placed(110, 140).centerX, placed(110, 140).centerY]).toEqual([125, 125]);
    expect([placed(0, 0).centerX, placed(0, 0).centerY]).toEqual([25, 25]); // an object at the corner fits in the cell
    expect([placed(199, 149).centerX, placed(199, 149).centerY]).toEqual([175, 125]);
  });

  it("moves to those points too, and the plain grid is as it was without an origin", () => {
    expect(at().moveFigure("o", 100, 80, 50, 25).get("o")).toMatchObject({ data: { centerX: 125, centerY: 75 } });
    const plain = at().moveFigure("o", 60, 40, 50);
    expect([plain.items[0].centerX, plain.items[0].centerY]).toEqual([50, 50]);
  });
});

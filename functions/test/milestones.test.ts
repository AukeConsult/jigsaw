import { describe, expect, it } from "vitest";
import { JigsawCut, Puzzle } from "../src/models";

// The points of a round that can be celebrated: the border, half of the pieces, all of them.

const grid = { columns: 4, rows: 3 };
const size = 100;
const cut = JigsawCut.cut(grid.columns * size, grid.rows * size, size);
const inner = (col: number, row: number) => col > 0 && row > 0 && col < grid.columns - 1 && row < grid.rows - 1;

/** the pieces, those that `home` says on their own place, the rest far off it */
const puzzle = (home: (col: number, row: number, n: number) => boolean) =>
  Puzzle.from(
    cut.placed.map((p, n) => {
      const { col, row } = p.piece!;
      return home(col, row, n) ? { ...p, centerX: (col + 0.5) * size, centerY: (row + 0.5) * size } : { ...p, centerX: 600 + n, centerY: 50 };
    }),
    900,
    600,
  );

describe("the milestones of a round", () => {
  it("has none when nothing is on its place", () => {
    expect(puzzle(() => false).milestones(grid)).toEqual([]);
  });

  it("has the border when every border piece is on its place, and half when they are half or more", () => {
    expect(puzzle((col, row) => !inner(col, row)).milestones(grid)).toEqual(["border", "halfway"]);
    expect(puzzle((col, row) => !inner(col, row) && !(col === 0 && row === 0)).milestones(grid)).toEqual(["halfway"]);
  });

  it("is halfway at half of the pieces and not before", () => {
    expect(puzzle((_c, _r, n) => n < 5).milestones(grid)).not.toContain("halfway");
    expect(puzzle((_c, _r, n) => n < 6).milestones(grid)).toContain("halfway");
  });

  it("is finished when all are on their places, and nothing without pieces", () => {
    expect(puzzle(() => true).milestones(grid)).toEqual(["border", "halfway", "finished"]);
    expect(Puzzle.from([], 900, 600).milestones(grid)).toEqual([]);
  });
});

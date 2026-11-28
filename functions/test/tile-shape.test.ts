import { describe, expect, it } from "vitest";
import { TileShapes } from "../src/models";

// The shape of a picture tile of the home page: the picture's own, within limits.

describe("the shape of a picture tile", () => {
  it("is the picture's own: landscape, square and portrait", () => {
    expect(TileShapes.of(1200, 900)).toBeCloseTo(4 / 3);
    expect(TileShapes.of(700, 700)).toBe(1);
    expect(TileShapes.of(1200, 1600)).toBeCloseTo(3 / 4);
    expect(TileShapes.of(1600, 900)).toBeCloseTo(16 / 9);
  });

  it("keeps the long shapes of a phone camera whole", () => {
    expect(TileShapes.of(900, 2000)).toBeCloseTo(0.45);
    expect(TileShapes.of(1200, 540)).toBeCloseTo(2.22, 1);
    expect(TileShapes.of(900, 2100)).toBeCloseTo(9 / 21);
    expect(TileShapes.of(2100, 900)).toBeCloseTo(21 / 9);
  });

  it("is limited for a very wide or very tall picture", () => {
    expect(TileShapes.of(2000, 400)).toBe(TileShapes.WIDEST);
    expect(TileShapes.of(400, 2000)).toBe(TileShapes.NARROWEST);
  });

  it("is the plain one when the size is not known", () => {
    for (const [width, height] of [[undefined, undefined], [0, 900], [1200, 0], [-4, 3], ["1200", 900]]) {
      expect(TileShapes.of(width, height)).toBe(TileShapes.PLAIN);
    }
  });
});

import { describe, expect, it } from "vitest";
import { Puzzle } from "../src/models";

// The piece scroller area collects its pieces by itself when it has all but run empty while others wait further on.

describe("a piece scroller area that runs empty", () => {
  it("asks for pieces when it shows hardly any and there are more further on", () => {
    expect(Puzzle.scrollerNeedsPieces(0, 10)).toBe(true);
    expect(Puzzle.scrollerNeedsPieces(Puzzle.SCROLLER_ALMOST_EMPTY, 1)).toBe(true);
  });

  it("is left alone while it still shows some, or when nothing waits further on (also at its end, with pieces back where one came from)", () => {
    expect(Puzzle.scrollerNeedsPieces(Puzzle.SCROLLER_ALMOST_EMPTY + 1, 10)).toBe(false);
    expect(Puzzle.scrollerNeedsPieces(0, 0)).toBe(false);
    expect(Puzzle.scrollerNeedsPieces(1, 0)).toBe(false);
  });
});

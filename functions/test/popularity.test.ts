import { describe, expect, it } from "vitest";
import { POPULAR_SHOWN, Popularity } from "../src/models";
import type { JigsawSpec } from "../src/models";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1000 * DAY;
const jigsaw = (id: string, ageDays: number): JigsawSpec => ({ id, name: id, width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], createdAt: NOW - ageDays * DAY });
const ids = (list: JigsawSpec[]) => list.map((j) => j.id);

describe("what makes a jigsaw popular", () => {
  it("is the rounds played on it: more rounds come first", () => {
    const ranked = Popularity.rank([{ jigsaw: jigsaw("few", 200), rounds: 1 }, { jigsaw: jigsaw("many", 200), rounds: 9 }, { jigsaw: jigsaw("some", 200), rounds: 4 }], NOW);
    expect(ids(ranked)).toEqual(["many", "some", "few"]);
  });

  it("is also being new: a jigsaw nobody has played yet beats one that was played once long ago, but not one played a lot", () => {
    const ranked = Popularity.rank([{ jigsaw: jigsaw("old", 300), rounds: 1 }, { jigsaw: jigsaw("fresh", 0), rounds: 0 }, { jigsaw: jigsaw("busy", 300), rounds: 8 }], NOW);
    expect(ids(ranked)).toEqual(["busy", "fresh", "old"]);
  });

  it("lets the bonus for being new halve every two weeks", () => {
    const at = (ageDays: number) => Popularity.score({ jigsaw: jigsaw("x", ageDays), rounds: 0 }, NOW);
    expect(at(0)).toBeCloseTo(5);
    expect(at(14)).toBeCloseTo(2.5);
    expect(at(28)).toBeCloseTo(1.25);
  });

  it("puts the newer jigsaw first when the scores are the same", () => {
    const ranked = Popularity.rank([{ jigsaw: jigsaw("older", 400), rounds: 3 }, { jigsaw: jigsaw("newer", 399), rounds: 3 }], NOW * 100);
    expect(ids(ranked)).toEqual(["newer", "older"]);
  });

  it("shows at most ten, and never counts a jigsaw from the future as older than new", () => {
    const many = Array.from({ length: 15 }, (_, i) => ({ jigsaw: jigsaw(`j${i}`, 100), rounds: i }));
    expect(Popularity.rank(many, NOW)).toHaveLength(POPULAR_SHOWN);
    expect(ids(Popularity.rank(many, NOW, 3))).toEqual(["j14", "j13", "j12"]);
    expect(Popularity.score({ jigsaw: jigsaw("x", -5), rounds: 0 }, NOW)).toBeCloseTo(5);
    expect(Popularity.rank([], NOW)).toEqual([]);
  });
});

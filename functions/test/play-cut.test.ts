import { describe, expect, it } from "vitest";
import { JigsawCut, JigsawPieces, JigsawSettings, Plays } from "../src/models";
import type { JigsawSpec, PlaySpec } from "../src/models";

// A round of a picture has a cut and a difficulty of its own; a round of a ready jigsaw has none and inherits the jigsaw's.

const seeded = (seed = 7) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const picture = { id: "p1", kind: "picture" as const, width: 1200, height: 800 };
const user = { id: "u1", name: "Ann" };
const choices = JigsawCut.pieceChoices(1200, 800);
const small = choices[0];
const big = choices[choices.length - 1];
const ready: JigsawSpec = { id: "j1", name: "R", width: 400, height: 300, gridSize: 50, gridVisible: false, placed: [], storeWidth: 200, snapPercent: 40, createdAt: 1 };
const round = (over: Partial<PlaySpec> = {}): PlaySpec => ({ id: "r", jigsawId: "p1", userId: "u1", userName: "Ann", status: "active", startedAt: 1, matched: 0, total: 24, storeWidth: 300, overrides: {}, ...over });
const layoutOfPicture = { ...picture, gridSize: 0, storeWidth: undefined as number | undefined, snapPercent: undefined as number | undefined };

describe("the choice at the start of a round", () => {
  it("is needed for a picture and refused for a ready jigsaw", () => {
    expect(Plays.choiceError(picture, undefined)).toMatch(/Choose the number/);
    expect(Plays.choiceError(picture, { columns: small.columns, rows: small.rows, snapPercent: 25 })).toBe("");
    expect(Plays.choiceError(ready, undefined)).toBe("");
    expect(Plays.choiceError(ready, { columns: 4, rows: 3, snapPercent: 25 })).toMatch(/ready cut/);
  });

  it("allows only the numbers of pieces that are offered and the three difficulties", () => {
    expect(Plays.choiceError(picture, { columns: 7, rows: 5, snapPercent: 25 })).toMatch(/offered/);
    expect(Plays.choiceError(picture, { columns: 40, rows: 40, snapPercent: 25 })).toMatch(/offered/);
    expect(Plays.choiceError(picture, { columns: small.columns, rows: small.rows, snapPercent: 33 })).toMatch(/difficulty/);
    expect(Plays.choiceError(picture, "x")).toMatch(/Choose/);
  });
});

describe("starting a round of a picture", () => {
  it("cuts the picture to the choice and keeps the cut and the difficulty on the round", () => {
    const started = Plays.startOwn(picture, user, { columns: big.columns, rows: big.rows, snapPercent: 10 }, 5, seeded());
    if ("error" in started) throw new Error(started.error);
    expect(started.pieces).toHaveLength(big.count);
    expect(started.play.total).toBe(big.count);
    expect(started.play.cut).toMatchObject({ columns: big.columns, rows: big.rows });
    expect(started.play.snapPercent).toBe(10);
    expect(started.play.fresh).toBe(true);
    expect(Object.keys(started.positions)).toHaveLength(big.count);
    const grid = started.play.cut!.grid;
    expect(started.pieces.every((p) => p.size === grid)).toBe(true);
  });

  it("gives two rounds of one picture their own sizes", () => {
    const a = Plays.startOwn(picture, user, { columns: small.columns, rows: small.rows, snapPercent: 40 }, 1, seeded(1));
    const b = Plays.startOwn(picture, { id: "u2", name: "Bo" }, { columns: big.columns, rows: big.rows, snapPercent: 10 }, 1, seeded(2));
    if ("error" in a || "error" in b) throw new Error("not started");
    expect(a.play.total).toBe(small.count);
    expect(b.play.total).toBe(big.count);
    expect(Plays.jigsawFor(layoutOfPicture, a.play).gridSize).not.toBe(Plays.jigsawFor(layoutOfPicture, b.play).gridSize);
  });

  it("refuses a choice that is not allowed", () => {
    expect("error" in Plays.startOwn(picture, user, { columns: 3, rows: 3, snapPercent: 25 }, 1)).toBe(true);
    expect("error" in Plays.startOwn({ ...picture, kind: undefined as never }, user, { columns: small.columns, rows: small.rows, snapPercent: 25 }, 1)).toBe(true);
  });

  it("keeps the cut and the difficulty when the round is started over", () => {
    const started = Plays.startOwn(picture, user, { columns: small.columns, rows: small.rows, snapPercent: 10 }, 1, seeded());
    if ("error" in started) throw new Error(started.error);
    const again = Plays.restart({ ...started.play, id: "r" }, Plays.jigsawFor(layoutOfPicture, started.play), started.pieces, 9, seeded(3));
    if ("error" in again) throw new Error(again.error);
    expect(again.play.cut).toEqual(started.play.cut);
    expect(again.play.snapPercent).toBe(10);
  });
});

describe("the clock of a round", () => {
  it("is chosen at the start: a round can be started without one, and the choice must be yes or no", () => {
    const own = { columns: small.columns, rows: small.rows, snapPercent: 25 };
    expect(Plays.choiceError(picture, { ...own, timed: false })).toBe("");
    expect(Plays.choiceError(picture, { ...own, timed: "no" })).toMatch(/timed/);
    const without = Plays.startOwn(picture, user, { ...own, timed: false }, 1, seeded());
    const withClock = Plays.startOwn(picture, user, { ...own, timed: true }, 1, seeded());
    if ("error" in without || "error" in withClock) throw new Error("not started");
    expect(without.play.timed).toBe(false);
    expect(withClock.play.timed).toBeUndefined(); // a clock is what a round that says nothing has
  });

  it("is kept when the round is started over, stored, and told to the page as the round's own", () => {
    const own = { columns: small.columns, rows: small.rows, snapPercent: 25, timed: false };
    const started = Plays.startOwn(picture, user, own, 1, seeded());
    if ("error" in started) throw new Error(started.error);
    const again = Plays.restart({ ...started.play, id: "r" }, Plays.jigsawFor(layoutOfPicture, started.play), started.pieces, 9, seeded(3));
    if ("error" in again) throw new Error(again.error);
    expect(again.play.timed).toBe(false);
    expect(Plays.publicOf({ ...again.play, id: "r" } as PlaySpec).timed).toBe(false);
    expect(Plays.jigsawFor({ ...ready, kind: "picture" as const }, round({ timed: false })).timed).toBe(false); // the round has no clock, whatever the picture says
    expect(Plays.jigsawFor(ready, round({ jigsawId: "j1" }))).toBe(ready);
  });
});

describe("the jigsaw as a round plays it", () => {
  it("is the jigsaw itself for a round with no cut or difficulty of its own", () => {
    expect(Plays.jigsawFor(ready, round({ jigsawId: "j1" }))).toBe(ready);
  });

  it("takes the cut, the store and the difficulty of the round when it has them", () => {
    const merged = Plays.jigsawFor({ ...ready, kind: "picture" as const }, round({ cut: { columns: 6, rows: 4, grid: 100 }, snapPercent: 10, storeWidth: 640 }));
    expect(merged).toMatchObject({ width: 600, height: 400, gridSize: 100, storeWidth: 640, snapPercent: 10, name: "R" });
    expect(Plays.jigsawFor(ready, round({ snapPercent: 10 }))).toMatchObject({ width: 400, gridSize: 50, snapPercent: 10 });
  });

  it("plays at the difficulty of the round, else of the jigsaw, else the default", () => {
    expect(Plays.effective(ready, round()).snapPercent).toBe(40);
    expect(Plays.effective(ready, round({ snapPercent: 10 })).snapPercent).toBe(10);
    expect(Plays.effective({}, round()).snapPercent).toBe(JigsawSettings.DEFAULT_SNAP_PERCENT);
  });

  it("is stored with the cut and the difficulty, and without them for an ordinary round", () => {
    const own = Plays.stored({ ...round({ cut: { columns: 6, rows: 4, grid: 100 }, snapPercent: 10 }), junk: 1 } as never);
    expect(own).toMatchObject({ cut: { columns: 6, rows: 4, grid: 100 }, snapPercent: 10 });
    expect(own).not.toHaveProperty("junk");
    const plain = Plays.stored(round());
    expect(plain).not.toHaveProperty("cut");
    expect(plain).not.toHaveProperty("snapPercent");
  });
});

describe("the number of pieces to have chosen", () => {
  it("is the offered one nearest to the last choice, and not one that was solved when another is offered", () => {
    expect(Plays.choiceNear(choices, 100)!.count).toBe(choices.reduce((b, c) => (Math.abs(Math.log(c.count / 100)) < Math.abs(Math.log(b.count / 100)) ? c : b)).count);
    expect(Plays.choiceNear(choices, 1)).toBe(small);
    expect(Plays.choiceNear(choices, 100000)).toBe(big);
    expect(Plays.choiceNear(choices, small.count, [small.count])!.count).not.toBe(small.count);
    expect(Plays.choiceNear(choices, 1, choices.map((c) => c.count))).toBe(small); // all solved: still one
    expect(Plays.choiceNear([], 100)).toBeUndefined();
  });
});

describe("a solved round, and one going, of the same user", () => {
  const solved = (total: number) => ({ status: "solved" as const, total });
  it("blocks a picture only at the size that was solved", () => {
    expect(Plays.blockedBy([solved(24)], 24)).toMatch(/solved/);
    expect(Plays.blockedBy([solved(24)], 48)).toBe("");
    expect(Plays.blockedBy([], 24)).toBe("");
  });
  it("blocks a ready jigsaw whatever the size, as before", () => {
    expect(Plays.blockedBy([solved(24)])).toMatch(/solved/);
    expect(Plays.blockedBy([{ status: "active" as const, total: 24 }])).toBe("");
  });
  it("allows one round going at a time, and a round only opened is replaced", () => {
    expect(Plays.goingError([{ status: "active", fresh: undefined }])).toMatch(/going/);
    expect(Plays.goingError([{ status: "active", fresh: true }])).toBe("");
    expect(Plays.goingError([{ status: "solved" }])).toBe("");
  });
});

describe("the pieces a round of a picture is cut into", () => {
  it("are whole, each once, with the edges of a jigsaw", () => {
    const started = Plays.startOwn(picture, user, { columns: small.columns, rows: small.rows, snapPercent: 25 }, 1, seeded());
    if ("error" in started) throw new Error(started.error);
    expect(new Set(started.pieces.map((p) => p.id)).size).toBe(small.count);
    expect(started.pieces.every((p) => JigsawPieces.error(p) === "")).toBe(true);
  });
});

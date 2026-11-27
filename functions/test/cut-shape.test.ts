import { describe, expect, it } from "vitest";
import { CUT_SHAPES, CutShapes, JigsawCut, JigsawPieces, JigsawSettings, Plays } from "../src/models";

// The shape of the tabs of a jigsaw: carried by each piece, drawn from it, and the same for a tab and the blank it fills.

const seeded = () => {
  let n = 1;
  return () => (n = (n * 16807) % 2147483647) / 2147483647;
};
const piecesOf = (shape?: (typeof CUT_SHAPES)[number]) => {
  const cutting = JigsawCut.cut(200, 150, 50, seeded(), shape);
  if ("error" in cutting) throw new Error(cutting.error);
  return JigsawPieces.ofCut(cutting);
};

describe("the shapes a jigsaw can be cut in", () => {
  it("knows its shapes; classic is what says nothing, and is not kept", () => {
    expect(CutShapes.is("round")).toBe(true);
    expect(CutShapes.is("star")).toBe(false);
    expect(CutShapes.of(undefined)).toBe("classic");
    expect(CutShapes.kept("classic")).toBeUndefined();
    expect(CutShapes.kept("wave")).toBe("wave");
  });

  it("has outlines that are the same seen from either end, and stay near their edge", () => {
    for (const shape of CUT_SHAPES) {
      const { from, steps } = CutShapes.outline(shape);
      const points = [[from, 0] as const, ...steps.flatMap((s) => s.points)];
      const back = points.map(([along, out]) => [1 - along, out] as const).reverse();
      points.forEach(([along, out], i) => {
        expect(along).toBeCloseTo(back[i][0]);
        expect(out).toBeCloseTo(back[i][1]);
        expect(out).toBeGreaterThanOrEqual(0);
        expect(out).toBeLessThanOrEqual(0.34);
      });
    }
  });

  it("is carried by every piece of the cut, kept in the database and checked", () => {
    expect(piecesOf().every((p) => p.shape === undefined)).toBe(true);
    const round = piecesOf("round");
    expect(round.every((p) => p.shape === "round")).toBe(true);
    expect(JigsawPieces.stored(round[0]).shape).toBe("round");
    expect(JigsawPieces.toPlaced(round[0]).piece?.shape).toBe("round");
    expect(JigsawPieces.error(round[0])).toBe("");
    expect(JigsawPieces.error({ ...round[0], shape: "star" })).not.toBe("");
  });

  it("draws a piece by its shape, and stays so when the pieces are scattered again", () => {
    const [classic, pointed] = [piecesOf()[5], piecesOf("pointed")[5]];
    expect(JigsawCut.path(100, classic)).not.toBe(JigsawCut.path(100, pointed));
    const started = Plays.start({ id: "j", width: 200, height: 150, gridSize: 50 }, { id: "u", name: "U" }, piecesOf("square"), 0, seeded());
    expect("error" in started).toBe(false);
  });

  it("is chosen at the start of a round of a picture, and the round keeps it", () => {
    const picture = { id: "p", kind: "picture" as const, width: 800, height: 600 };
    const option = JigsawCut.pieceChoices(800, 600)[0];
    const choice = { columns: option.columns, rows: option.rows, snapPercent: 25 };
    const started = Plays.startOwn(picture, { id: "u", name: "U" }, { ...choice, cutShape: "wave" }, 0, seeded());
    if ("error" in started) throw new Error(started.error);
    expect(started.play.cut?.shape).toBe("wave");
    expect(started.pieces.every((p) => p.shape === "wave")).toBe(true);
    expect(Plays.stored(started.play).cut?.shape).toBe("wave");
    expect(Plays.choiceError(picture, { ...choice, cutShape: "star" })).not.toBe("");
  });

  it("is part of a ready jigsaw: kept, and a change of it changes what every round shares", () => {
    const base = { name: "J", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [] };
    expect(new JigsawSettings({ ...base, cutShape: "round" }).stored().cutShape).toBe("round");
    expect(new JigsawSettings({ ...base, cutShape: "classic" }).stored().cutShape).toBeUndefined();
    expect(new JigsawSettings({ ...base, cutShape: "star" }).error()).not.toBe("");
    expect(JigsawSettings.changesWhatPlayersShare(base, { ...base, cutShape: "round" })).toBe(true);
    expect(JigsawSettings.changesWhatPlayersShare(base, { ...base, cutShape: "classic" })).toBe(false);
  });
});

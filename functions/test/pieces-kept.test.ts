import { describe, expect, it } from "vitest";
import { JigsawCut, JigsawPieces, JigsawSettings, MAX_LAYER, PlayPositions, Plays, Puzzle } from "../src/models";
import type { JigsawPiece, PlacedObject } from "../src/models";

/** a steady "random" so a failure can be run again */
function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const sameSet = (a: readonly PlacedObject[], b: readonly PlacedObject[]) => expect(a.map((p) => p.id).sort()).toEqual(b.map((p) => p.id).sort());
const sound = (data: readonly PlacedObject[]) => {
  for (const p of data) {
    expect(Number.isFinite(p.centerX) && Number.isFinite(p.centerY), `${p.id} has a place`).toBe(true);
    if (p.layer !== undefined) expect(p.layer >= 1 && p.layer <= MAX_LAYER, `${p.id} is on a layer`).toBe(true);
  }
};

describe("pieces are never lost", () => {
  for (const [width, height, grid] of [[200, 150, 50], [400, 300, 50], [770, 630, 70], [600, 900, 100]] as const) {
    it(`whatever is done to the pieces of a ${width}x${height} jigsaw (${grid} px), all of them are still there, each once, with a place and a layer`, () => {
      for (let seed = 1; seed <= 12; seed++) {
        const random = seeded(seed);
        const result = JigsawCut.cut(width, height, grid, random);
        if ("error" in result) throw new Error(result.error);
        const extent = JigsawSettings.extent(width, height, result.storeWidth)!;
        const store = JigsawSettings.storeFrame(height, result.storeWidth)!;
        let puzzle = Puzzle.from(result.placed, extent.width, extent.height).settled();
        const ids = puzzle.items.map((p) => p.id);
        const pick = () => ids[Math.floor(random() * ids.length)];
        const wild = () => (random() - 0.2) * 1.6 * Math.max(extent.width, extent.height); // also far outside
        for (let step = 0; step < 60; step++) {
          const kind = Math.floor(random() * 8);
          if (kind === 0) puzzle = puzzle.moveFigure(pick(), wild(), wild(), grid / 50, grid / 2);
          else if (kind === 1) puzzle = puzzle.moveGroup([pick(), pick(), pick()], wild() / 4, wild() / 4);
          else if (kind === 2) puzzle = puzzle.dropPieces([pick(), pick()], grid * 0.5);
          else if (kind === 3) puzzle = puzzle.settled();
          else if (kind === 4) puzzle = puzzle.confine({ left: 0, top: height, width: store.left, height: extent.height }, { left: 0, top: height, width: width / 2, height: extent.height / 2 });
          else if (kind === 5) puzzle = puzzle.collectPieces(ids.filter(() => random() < 0.5), { left: store.left, top: 0, width: store.width }, random);
          else if (kind === 6) puzzle = puzzle.bringToFront(pick());
          else puzzle = puzzle.setLayer([pick()], 1 + Math.floor(random() * MAX_LAYER));
          sameSet(puzzle.toData(), result.placed);
          sound(puzzle.toData());
        }
        // and it still goes through what the page does when a round is opened and saved again
        sameSet(Puzzle.from(puzzle.toData(), extent.width, extent.height).settled().toData(), result.placed);
      }
    });
  }

  it("a round keeps every piece it has: moves of unknown pieces and moves with nothing in them leave the places alone", () => {
    const made = JigsawCut.cut(200, 150, 50, seeded(3));
    if ("error" in made) throw new Error(made.error);
    const pieces: JigsawPiece[] = made.placed.map((p) => ({ id: p.id, number: 1, col: p.piece!.col, row: p.piece!.row, edges: p.piece!.edges, size: 50, centerX: p.centerX, centerY: p.centerY, layer: p.layer ?? 1, matched: false }) as unknown as JigsawPiece);
    const positions: PlayPositions = {};
    for (const p of pieces) positions[p.id] = [p.centerX, p.centerY, p.layer];
    const play = { id: "p", jigsawId: "j", userId: "u", userName: "U", status: "active", startedAt: 1, matched: 0, total: pieces.length, overrides: {} } as never;
    const after = Plays.moved(play, pieces, positions, [{ id: "nobody", centerX: 5, centerY: 5, layer: 3 }, { id: pieces[0].id, centerX: 30, centerY: 40, layer: 9 }], 2);
    expect(Object.keys(after.positions).sort()).toEqual(Object.keys(positions).sort());
    expect(after.positions[pieces[0].id]).toEqual([30, 40, 9]);
    expect(Plays.moved(play, pieces, positions, [], 3).positions).toEqual(positions);
    // a round that has no place for some piece (an older one) still has the piece, where the jigsaw has it
    const some = { [pieces[0].id]: positions[pieces[0].id] };
    expect(Plays.piecesOf(pieces, some).map((p) => p.id)).toEqual(pieces.map((p) => p.id));
    expect(JigsawPieces.moveError({ id: pieces[0].id, centerX: Number.NaN, centerY: 1, layer: 1 })).not.toBe(""); // a move without a place is refused, it cannot put a piece nowhere
  });
});

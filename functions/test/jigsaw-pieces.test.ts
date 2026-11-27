import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { memoryPlays } from "./memory-plays";
import type { JigsawStore } from "../src/common/jigsaw-list";
import type { JigsawSpec } from "../src/models";
import type { PieceStore } from "../src/jigsaw/jigsaw-pieces";
import { JIGSAW_MAX_PIECES, DEFAULT_OBJECT, JigsawCut, JigsawPiece, JigsawPieces } from "../src/models";

/** the pieces in memory: what the subcollection is in the app */
function memoryPieces(jigsaws: string[]) {
  const docs = new Map<string, Map<string, JigsawPiece>>();
  const store: PieceStore = {
    async list(id) {
      return [...(docs.get(id)?.values() ?? [])].sort((a, b) => a.number - b.number);
    },
    async replaceAll(id, pieces) {
      if (!jigsaws.includes(id)) return false;
      docs.set(id, new Map(pieces.map((p) => [p.id, p])));
      return true;
    },
    async removeAll(id) {
      docs.delete(id);
    },
  };
  return { store, docs };
}

const id = "AbCdEf123456";

/** the pieces of a small cut, as the page sends them */
function cutPieces() {
  const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
  if ("error" in cut) throw new Error(cut.error);
  return cut.placed.map((p) => JigsawPieces.of(p, cut.columns)!);
}

describe("the pieces of a jigsaw in the database", () => {
  const setup = (jigsaws = [id]) => {
    const m = memoryPieces(jigsaws);
    const app = createJigsawApp({ jigsawPieces: m.store, jigsawExists: async (x) => jigsaws.includes(x), plays: memoryPlays(), jigsaw: { ...({} as JigsawStore), list: async () => jigsaws.map((x) => ({ id: x }) as JigsawSpec) } });
    return { ...m, app };
  };

  it("keeps each piece with its number, edges, place, layer and whether it is matched, and reads them back by number", async () => {
    const { app } = setup();
    const pieces = cutPieces();
    const put = await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ pieces: 12 });
    const got = (await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}`)).body.pieces as JigsawPiece[];
    expect(got).toHaveLength(12);
    expect(got.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const sent = pieces.find((p) => p.number === 6)!;
    expect(got.find((p) => p.number === 6)).toEqual(JigsawPieces.stored(sent)); // number 6: column 1, row 1 of 4 columns
    expect(got[5]).toMatchObject({ col: 1, row: 1, size: 50 });
  });

  it("says a piece is matched when it lies on its own place, whatever the page says, and not when it does not", async () => {
    const { app } = setup();
    const pieces = cutPieces();
    const own = { ...pieces[5], centerX: 75, centerY: 75, matched: false }; // number 6: column 1, row 1: its own place is 75, 75
    const wrong = { ...pieces[0], centerX: 80, centerY: 75, matched: true }; // lies somewhere else, and says it is matched
    await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces: [own, wrong] });
    const got = (await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}`)).body.pieces as JigsawPiece[];
    expect(got.find((p) => p.id === own.id)?.matched).toBe(true);
    expect(got.find((p) => p.id === wrong.id)?.matched).toBe(false);
  });

  it("replaces all the pieces when the jigsaw is cut again", async () => {
    const { app, docs } = setup();
    await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces() });
    expect(docs.get(id)?.size).toBe(12);
    await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces().slice(0, 3) });
    expect(docs.get(id)?.size).toBe(3);
  });

  it("keeps only what a piece has: anything else that is sent with it is left out", async () => {
    const { app, docs } = setup();
    const put = await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces: [{ ...cutPieces()[0], graphic: "data:image/webp;base64,AAAA" }] });
    expect(put.status).toBe(200);
    expect(JSON.stringify([...docs.get(id)!.values()])).not.toContain("graphic");
  });

  it("refuses bad pieces and too many", async () => {
    const { app, docs } = setup();
    const pieces = cutPieces();
    const put = (list: unknown) => request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces: list });
    expect((await put("no")).status).toBe(400);
    expect((await put([{ ...pieces[0], col: -1 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], top: 2 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], number: 0 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], size: 0 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], layer: 5000 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], centerX: Number.NaN }])).status).toBe(400);
    expect((await put([pieces[0], pieces[0]])).status).toBe(400); // repeated
    expect((await put(Array.from({ length: JIGSAW_MAX_PIECES + 1 }, (_, i) => ({ ...pieces[0], id: `p${i}` })))).status).toBe(400);
    expect((await request(app).get("/jigsaw/api/jigsaw-pieces/short")).status).toBe(400);
    expect(docs.size).toBe(0);
  });

  it("needs a jigsaw that is there", async () => {
    const { app, docs } = setup([]);
    expect((await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}`)).status).toBe(404);
    expect((await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces() })).status).toBe(404);
    expect(docs.size).toBe(0);
  });

  it("takes as many pieces as a jigsaw can have", async () => {
    const { app } = setup();
    const pieces = Array.from({ length: JIGSAW_MAX_PIECES }, (_, i) => ({ ...cutPieces()[i % 12], id: `piece-${i}-0`, number: i + 1, centerX: 123.5, centerY: 98.5 }));
    const put = await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.status).toBe(200);
    expect(put.body.pieces).toBe(JIGSAW_MAX_PIECES);
  });
});

describe("the piece of a jigsaw as a model", () => {
  const placed = { id: "piece-2-1", centerX: 125, centerY: 75, layer: 12, object: { ...DEFAULT_OBJECT, width: 50, height: 50 }, piece: { col: 2, row: 1, top: 1, right: -1, bottom: 0, left: 1 } as const };

  it("is made from a placed piece and goes back to one, with its number and whether it is matched", () => {
    const piece = JigsawPieces.of(placed, 8)!;
    expect(piece).toEqual({ id: "piece-2-1", number: 11, col: 2, row: 1, top: 1, right: -1, bottom: 0, left: 1, size: 50, centerX: 125, centerY: 75, layer: 12, matched: true });
    expect(JigsawPieces.of({ ...placed, centerX: 300 }, 8)?.matched).toBe(false);
    const back = JigsawPieces.toPlaced(piece);
    expect(back).toMatchObject({ id: "piece-2-1", centerX: 125, centerY: 75, layer: 12, piece: placed.piece });
    expect(back.object).toMatchObject({ width: 50, height: 50, name: "Piece 3,2" });
    expect(JigsawPieces.of({ ...placed, piece: undefined }, 8)).toBeNull(); // not a piece
    expect(JigsawPieces.numberOf(0, 0, 8)).toBe(1);
    expect(JigsawPieces.numberOf(7, 5, 8)).toBe(48);
  });

  it("is matched within half a pixel of its own place", () => {
    const at = (x: number, y: number) => JigsawPieces.matched({ col: 2, row: 1, size: 50, centerX: x, centerY: y });
    expect([at(125, 75), at(125.5, 74.5), at(126, 75), at(125, 76), at(0, 0)]).toEqual([true, true, false, false, false]);
  });
});

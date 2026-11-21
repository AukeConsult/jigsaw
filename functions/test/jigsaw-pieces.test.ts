import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { etagOf } from "../src/jigsaw-image";
import { MAX_PIECE_GRAPHIC_BYTES, PieceGraphic, PieceStore } from "../src/jigsaw-pieces";
import { JIGSAW_MAX_PIECES, DEFAULT_OBJECT, JigsawCut, JigsawPiece, JigsawPieces, PieceMove } from "../src/models";

/** the pieces in memory: what the subcollection and the bucket are in the app */
function memoryPieces(jigsaws: string[]) {
  const docs = new Map<string, Map<string, JigsawPiece>>();
  const graphics = new Map<string, Map<string, PieceGraphic>>();
  const store: PieceStore = {
    async list(id) {
      return [...(docs.get(id)?.values() ?? [])].sort((a, b) => a.number - b.number);
    },
    async replaceAll(id, pieces, g) {
      if (!jigsaws.includes(id)) return false;
      docs.set(id, new Map(pieces.map((p) => [p.id, p])));
      graphics.set(id, new Map(g));
      return true;
    },
    async move(id, moves: PieceMove[]) {
      if (!jigsaws.includes(id)) return false;
      for (const m of moves) {
        const was = docs.get(id)?.get(m.id);
        if (was) docs.get(id)!.set(m.id, JigsawPieces.stored({ ...was, centerX: m.centerX, centerY: m.centerY, layer: m.layer }));
      }
      return true;
    },
    async graphic(id, pieceId) {
      const g = graphics.get(id)?.get(pieceId);
      return g ? { ...g, etag: etagOf(g.data) } : null;
    },
    async removeAll(id) {
      docs.delete(id);
      graphics.delete(id);
    },
  };
  return { store, docs, graphics };
}

const id = "AbCdEf123456";
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(30, 5)]);
const dataAddress = (b: Buffer, type = "webp") => `data:image/${type};base64,${b.toString("base64")}`;

/** the pieces of a small cut, as the page sends them */
function cutPieces(graphic?: string) {
  const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
  if ("error" in cut) throw new Error(cut.error);
  return cut.placed.map((p) => ({ ...JigsawPieces.of(p, cut.columns)!, ...(graphic ? { graphic } : {}) }));
}

describe("the pieces of a jigsaw in the database", () => {
  const setup = (jigsaws = [id]) => {
    const m = memoryPieces(jigsaws);
    const app = createApp({ jigsawPieces: m.store, jigsawExists: async (x) => jigsaws.includes(x) });
    return { ...m, app };
  };

  it("keeps each piece with its number, edges, place, layer and whether it is matched, and reads them back by number", async () => {
    const { app } = setup();
    const pieces = cutPieces(dataAddress(webp));
    const put = await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ pieces: 12, graphics: 12 });
    const got = (await request(app).get(`/api/jigsaw-pieces/${id}`)).body.pieces as JigsawPiece[];
    expect(got).toHaveLength(12);
    expect(got.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const sent = pieces.find((p) => p.number === 6)!;
    expect(got.find((p) => p.number === 6)).toEqual(JigsawPieces.stored(sent)); // number 6: column 1, row 1 of 4 columns
    expect(got[5]).toMatchObject({ col: 1, row: 1, size: 50 });
    expect(JSON.stringify(got)).not.toContain("graphic"); // the graphics are not in the list
  });

  it("says a piece is matched when it lies on its own place, whatever the page says, and not when it does not", async () => {
    const { app } = setup();
    const pieces = cutPieces();
    const own = { ...pieces[5], centerX: 75, centerY: 75, matched: false }; // number 6: column 1, row 1: its own place is 75, 75
    const wrong = { ...pieces[0], centerX: 80, centerY: 75, matched: true }; // lies somewhere else, and says it is matched
    await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: [own, wrong] });
    const got = (await request(app).get(`/api/jigsaw-pieces/${id}`)).body.pieces as JigsawPiece[];
    expect(got.find((p) => p.id === own.id)?.matched).toBe(true);
    expect(got.find((p) => p.id === wrong.id)?.matched).toBe(false);
  });

  it("saves where pieces are and on which layer, and the matched status follows from that", async () => {
    const { app } = setup();
    const pieces = cutPieces();
    await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces });
    const piece = pieces[5]; // its own place is 75, 75
    const moved = await request(app).patch(`/api/jigsaw-pieces/${id}`).send({ moves: [{ id: piece.id, centerX: 75, centerY: 75, layer: 99 }, { id: "piece-9-9", centerX: 1, centerY: 1, layer: 1 }] });
    expect(moved.status).toBe(200);
    let got = (await request(app).get(`/api/jigsaw-pieces/${id}`)).body.pieces as JigsawPiece[];
    expect(got.find((p) => p.id === piece.id)).toMatchObject({ centerX: 75, centerY: 75, layer: 99, matched: true });
    expect(got).toHaveLength(12); // a piece that is not there is left out, not made
    await request(app).patch(`/api/jigsaw-pieces/${id}`).send({ moves: [{ id: piece.id, centerX: 500, centerY: 20, layer: 100 }] });
    got = (await request(app).get(`/api/jigsaw-pieces/${id}`)).body.pieces as JigsawPiece[];
    expect(got.find((p) => p.id === piece.id)).toMatchObject({ centerX: 500, layer: 100, matched: false });
    expect(got.find((p) => p.id === piece.id)?.number).toBe(6); // what it is does not change
  });

  it("replaces all the pieces and their graphics when the jigsaw is cut again", async () => {
    const { app, graphics, docs } = setup();
    await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces(dataAddress(webp)) });
    expect(graphics.get(id)?.size).toBe(12);
    await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces().slice(0, 3) });
    expect(docs.get(id)?.size).toBe(3);
    expect(graphics.get(id)?.size).toBe(0);
  });

  it("serves the graphic of a piece, with its type found from its bytes, and 404 when it has none", async () => {
    const { app } = setup();
    const pieces = cutPieces();
    const withGraphic = { ...pieces[0], graphic: dataAddress(webp, "png") }; // says png, is webp
    await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: [withGraphic, pieces[1]] });
    const ok = await request(app).get(`/api/jigsaw-pieces/${id}/graphic/${pieces[0].id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toBe("image/webp");
    expect(ok.body.equals(webp)).toBe(true);
    expect((await request(app).get(`/api/jigsaw-pieces/${id}/graphic/${pieces[1].id}`)).status).toBe(404);
    const tag = ok.headers.etag;
    expect((await request(app).get(`/api/jigsaw-pieces/${id}/graphic/${pieces[0].id}`).set("If-None-Match", tag)).status).toBe(304);
  });

  it("refuses bad pieces, bad graphics, bad moves and too many", async () => {
    const { app, docs } = setup();
    const pieces = cutPieces();
    const put = (list: unknown) => request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: list });
    expect((await put("no")).status).toBe(400);
    expect((await put([{ ...pieces[0], col: -1 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], top: 2 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], number: 0 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], size: 0 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], layer: 5000 }])).status).toBe(400);
    expect((await put([{ ...pieces[0], centerX: Number.NaN }])).status).toBe(400);
    expect((await put([pieces[0], pieces[0]])).status).toBe(400); // repeated
    expect((await put([{ ...pieces[0], graphic: "not an address" }])).status).toBe(400);
    expect((await put([{ ...pieces[0], graphic: dataAddress(Buffer.from("just text, not a picture")) }])).status).toBe(400);
    expect((await put([{ ...pieces[0], graphic: dataAddress(Buffer.concat([webp, Buffer.alloc(MAX_PIECE_GRAPHIC_BYTES)])) }])).status).toBe(400);
    expect((await put(Array.from({ length: JIGSAW_MAX_PIECES + 1 }, (_, i) => ({ ...pieces[0], id: `p${i}` })))).status).toBe(400);
    const patch = (moves: unknown) => request(app).patch(`/api/jigsaw-pieces/${id}`).send({ moves });
    expect((await patch("no")).status).toBe(400);
    expect((await patch([{ id: "x", centerX: -1, centerY: 0, layer: 5 }])).status).toBe(400);
    expect((await patch([{ id: "x", centerX: 1, centerY: 1, layer: 0 }])).status).toBe(400);
    expect((await patch([{ id: "x", centerX: 1.3, centerY: 1, layer: 5 }])).status).toBe(400); // whole or half pixels
    expect((await request(app).get("/api/jigsaw-pieces/short")).status).toBe(400);
    expect(docs.size).toBe(0);
  });

  it("needs a jigsaw that is there", async () => {
    const { app, docs } = setup([]);
    expect((await request(app).get(`/api/jigsaw-pieces/${id}`)).status).toBe(404);
    expect((await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces() })).status).toBe(404);
    expect((await request(app).patch(`/api/jigsaw-pieces/${id}`).send({ moves: [] })).status).toBe(404);
    expect(docs.size).toBe(0);
  });

  it("takes all the pieces away with DELETE", async () => {
    const { app, docs } = setup();
    await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces: cutPieces() });
    expect((await request(app).delete(`/api/jigsaw-pieces/${id}`)).status).toBe(204);
    expect(docs.has(id)).toBe(false);
  });

  it("takes a body big enough for all the graphics of a jigsaw", async () => {
    const { app } = setup();
    const graphic = dataAddress(Buffer.concat([webp, Buffer.alloc(60 * 1024, 3)])); // 60 KB each
    const pieces = Array.from({ length: 100 }, (_, i) => ({ ...cutPieces()[i % 12], id: `piece-${i}-0`, graphic })); // about 8 MB in all
    const put = await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.status).toBe(200);
    expect(put.body.graphics).toBe(100);
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

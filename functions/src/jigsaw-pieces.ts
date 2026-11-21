import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import express from "express";
import { JIGSAW_ROOT, Picture, etagOf, isPictureId, pictureType } from "./jigsaw-image";
import { JIGSAW, JIGSAW_MAX_PIECES, JIGSAW_PIECES, JigsawPiece, JigsawPieces, PieceMove } from "./models";

// The pieces of a jigsaw: one document each in the subcollection `jigsaw/<id>/pieces`, with its number, its edges, where it is, on which layer and
// whether it is matched (the server says so, from where the piece is). The graphic of a piece is a small picture in Storage, `jigsaw/<id>/pieces/<piece id>`,
// kept like the background picture (see `jigsaw-image.ts`). Opening a saved jigsaw reads them back, so the game goes on where it was left.

/** The biggest graphic of a piece, in bytes. */
export const MAX_PIECE_GRAPHIC_BYTES = 150 * 1024;
/** The biggest request that sets all the pieces (the graphics are in it), in bytes. */
export const MAX_PIECES_BODY = "30mb";

/** The graphic of a piece to store. */
export interface PieceGraphic {
  data: Buffer;
  mime: string;
}

/** Where the pieces are kept (Firestore and Storage in the app, memory in the tests). */
export interface PieceStore {
  /** the pieces of a jigsaw, by number */
  list(jigsawId: string): Promise<JigsawPiece[]>;
  /** Replaces all the pieces of a jigsaw (the old ones and their graphics are gone): the jigsaw is cut again. False when there is no such jigsaw. */
  replaceAll(jigsawId: string, pieces: JigsawPiece[], graphics: ReadonlyMap<string, PieceGraphic>): Promise<boolean>;
  /** Saves where pieces are and on which layer (whether they are matched follows from that). False when there is no such jigsaw; pieces that are not there are left out. */
  move(jigsawId: string, moves: PieceMove[]): Promise<boolean>;
  graphic(jigsawId: string, pieceId: string): Promise<Picture | null>;
  /** Takes away everything of a jigsaw that is kept in these two places: its pieces, their graphics and its picture. */
  removeAll(jigsawId: string): Promise<void>;
}

const BATCH = 400;
const UPLOADS_AT_ONCE = 10;

/** The pieces in the subcollection of the jigsaw document, and their graphics in the bucket. */
export function firestorePieceStore(): PieceStore {
  const db = () => getFirestore();
  const parent = (id: string) => db().collection(JIGSAW).doc(id);
  const pieces = (id: string) => parent(id).collection(JIGSAW_PIECES);
  const bucket = () => getStorage().bucket();
  const graphicFile = (id: string, pieceId: string) => bucket().file(`${JIGSAW_ROOT}/${id}/${JIGSAW_PIECES}/${pieceId}`);
  const exists = async (id: string) => (await parent(id).get()).exists;

  return {
    async list(id) {
      const snap = await pieces(id).get();
      return snap.docs.map((d) => d.data() as JigsawPiece).sort((a, b) => a.number - b.number);
    },
    async replaceAll(id, list, graphics) {
      if (!(await exists(id))) return false;
      await db().recursiveDelete(pieces(id));
      await bucket().deleteFiles({ prefix: `${JIGSAW_ROOT}/${id}/${JIGSAW_PIECES}/`, force: true });
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = db().batch();
        for (const piece of list.slice(i, i + BATCH)) batch.set(pieces(id).doc(piece.id), { ...JigsawPieces.stored(piece), hasGraphic: graphics.has(piece.id) });
        await batch.commit();
      }
      const withGraphic = [...graphics.entries()];
      for (let i = 0; i < withGraphic.length; i += UPLOADS_AT_ONCE) {
        await Promise.all(
          withGraphic.slice(i, i + UPLOADS_AT_ONCE).map(([pieceId, g]) =>
            graphicFile(id, pieceId).save(g.data, { contentType: g.mime, resumable: false, metadata: { cacheControl: "private, no-cache" } }),
          ),
        );
      }
      return true;
    },
    async move(id, moves) {
      if (!(await exists(id))) return false;
      for (let i = 0; i < moves.length; i += BATCH) {
        const chunk = moves.slice(i, i + BATCH);
        const refs = chunk.map((m) => pieces(id).doc(m.id));
        const snaps = await db().getAll(...refs);
        const batch = db().batch();
        snaps.forEach((snap, k) => {
          if (!snap.exists) return;
          const was = snap.data() as JigsawPiece;
          const now = { ...was, centerX: chunk[k].centerX, centerY: chunk[k].centerY, layer: chunk[k].layer };
          batch.update(refs[k], { centerX: now.centerX, centerY: now.centerY, layer: now.layer, matched: JigsawPieces.matched(now) });
        });
        await batch.commit();
      }
      return true;
    },
    async graphic(id, pieceId) {
      try {
        const [[data], [meta]] = await Promise.all([graphicFile(id, pieceId).download(), graphicFile(id, pieceId).getMetadata()]);
        return { data, mime: String(meta.contentType ?? "application/octet-stream"), etag: etagOf(data) };
      } catch (err: any) {
        if (err?.code === 404) return null;
        throw err;
      }
    },
    async removeAll(id) {
      await db().recursiveDelete(pieces(id));
      await bucket().deleteFiles({ prefix: `${JIGSAW_ROOT}/${id}/`, force: true }); // the pieces' graphics and the picture
    },
  };
}

/** A graphic as it comes in a request: a data address of a png, webp or jpeg (found from its first bytes, not from what it says), not too big; or the reason it is not allowed. */
export function readGraphic(value: unknown): PieceGraphic | { error: string } {
  const match = typeof value === "string" ? /^data:image\/(?:png|webp|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(value) : null;
  if (!match) return { error: "A graphic must be a png, webp or jpeg data address." };
  const data = Buffer.from(match[1], "base64");
  const mime = pictureType(data);
  if (!mime) return { error: "That is not a supported graphic (png, webp or jpeg)." };
  if (data.length > MAX_PIECE_GRAPHIC_BYTES) return { error: `A graphic can be at most ${Math.round(MAX_PIECE_GRAPHIC_BYTES / 1024)} KB.` };
  return { data, mime };
}

/**
 * The pieces of a jigsaw, `/jigsaw-pieces/:id`:
 *  GET: its pieces (without the graphics). PUT {pieces: [...with `graphic`: a data address]}: cut again, all the pieces are replaced.
 *  PATCH {moves: [{id, centerX, centerY, layer}]}: where pieces are now. GET /graphic/:pieceId: the graphic of a piece. DELETE: takes all the pieces away.
 */
export function jigsawPiecesRouter(store: PieceStore, exists: (id: string) => Promise<boolean>): express.Router {
  const router = express.Router();
  const json = express.json({ limit: MAX_PIECES_BODY });
  const bad = (res: express.Response, error: string, status = 400) => void res.status(status).json({ error });

  router.use("/:id", (req, res, next) => {
    if (!isPictureId(req.params.id)) return bad(res, "Not a jcanvas id.");
    next();
  });

  router.get("/:id", async (req, res) => {
    if (!(await exists(req.params.id))) return bad(res, "No such canvas.", 404);
    res.json({ pieces: await store.list(req.params.id) });
  });

  router.put("/:id", json, async (req, res) => {
    const list = (req.body as { pieces?: (JigsawPiece & { graphic?: unknown })[] } | undefined)?.pieces;
    if (!Array.isArray(list)) return bad(res, "Send the pieces as a list.");
    if (list.length > JIGSAW_MAX_PIECES) return bad(res, `At most ${JIGSAW_MAX_PIECES} pieces fit on a canvas.`);
    const ids = new Set<string>();
    const graphics = new Map<string, PieceGraphic>();
    for (const piece of list) {
      const error = JigsawPieces.error(piece);
      if (error) return bad(res, error);
      if (ids.has(piece.id)) return bad(res, "A piece is repeated.");
      ids.add(piece.id);
      if (piece.graphic !== undefined) {
        const read = readGraphic(piece.graphic);
        if ("error" in read) return bad(res, `Piece ${piece.id}: ${read.error}`);
        graphics.set(piece.id, read);
      }
    }
    if (!(await store.replaceAll(req.params.id, list.map((p) => JigsawPieces.stored(p)), graphics))) return bad(res, "No such canvas.", 404);
    res.json({ pieces: list.length, graphics: graphics.size });
  });

  router.patch("/:id", json, async (req, res) => {
    const moves = (req.body as { moves?: PieceMove[] } | undefined)?.moves;
    if (!Array.isArray(moves)) return bad(res, "Send the moves as a list.");
    if (moves.length > JIGSAW_MAX_PIECES) return bad(res, `At most ${JIGSAW_MAX_PIECES} pieces fit on a canvas.`);
    for (const move of moves) {
      const error = JigsawPieces.moveError(move);
      if (error) return bad(res, error);
    }
    if (!(await store.move(req.params.id, moves.map((m) => ({ id: m.id, centerX: m.centerX, centerY: m.centerY, layer: m.layer }))))) return bad(res, "No such canvas.", 404);
    res.json({ moved: moves.length });
  });

  router.get("/:id/graphic/:pieceId", async (req, res) => {
    if (!isPictureId(req.params.pieceId) && !/^piece-\d{1,4}-\d{1,4}$/.test(req.params.pieceId)) return bad(res, "Not a piece id.");
    const graphic = await store.graphic(req.params.id, req.params.pieceId);
    if (!graphic) return bad(res, "No graphic.", 404);
    const etag = `"${graphic.etag}"`;
    res.set({ "Content-Type": graphic.mime, "Content-Length": String(graphic.data.length), "Cache-Control": "private, no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" });
    if (req.headers["if-none-match"] === etag) return void res.status(304).end();
    res.end(req.method === "HEAD" ? undefined : graphic.data);
  });

  router.delete("/:id", async (req, res) => {
    await store.removeAll(req.params.id);
    res.status(204).end();
  });

  return router;
}


import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import express from "express";
import { JIGSAW_ROOT, Picture, documentExists, isPictureId, pictureType, readStoredFile, sendPicture } from "./jigsaw-image";
import { JIGSAW, JIGSAW_MAX_PIECES, JIGSAW_PIECES, JigsawPiece, JigsawPieces } from "../models";
import { apiRouter, bad } from "../common/http";

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
  const exists = (id: string) => documentExists(parent(id));

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
    graphic: (id, pieceId) => readStoredFile(graphicFile(id, pieceId)),
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
 *  GET /graphic/:pieceId: the graphic of a piece. (Where the pieces are while a game is played is kept with the round, and a jigsaw's pieces go when it is deleted.)
 */
export function jigsawPiecesRouter(store: PieceStore, exists: (id: string) => Promise<boolean>): express.Router {
  const router = apiRouter();
  const json = express.json({ limit: MAX_PIECES_BODY });

  router.use("/:id", (req, res, next) => {
    if (!isPictureId(req.params.id)) return bad(res, "Not a jigsaw id.");
    next();
  });

  router.get("/:id", async (req, res) => {
    if (!(await exists(req.params.id))) return bad(res, "No such jigsaw.", 404);
    res.json({ pieces: await store.list(req.params.id) });
  });

  router.put("/:id", json, async (req, res) => {
    const list = (req.body as { pieces?: (JigsawPiece & { graphic?: unknown })[] } | undefined)?.pieces;
    if (!Array.isArray(list)) return bad(res, "Send the pieces as a list.");
    if (list.length > JIGSAW_MAX_PIECES) return bad(res, `At most ${JIGSAW_MAX_PIECES} pieces fit in a jigsaw.`);
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
    if (!(await store.replaceAll(req.params.id, list.map((p) => JigsawPieces.stored(p)), graphics))) return bad(res, "No such jigsaw.", 404);
    res.json({ pieces: list.length, graphics: graphics.size });
  });

  router.get("/:id/graphic/:pieceId", async (req, res) => {
    if (!isPictureId(req.params.pieceId) && !/^piece-\d{1,4}-\d{1,4}$/.test(req.params.pieceId)) return bad(res, "Not a piece id.");
    const graphic = await store.graphic(req.params.id, req.params.pieceId);
    if (!graphic) return bad(res, "No graphic.", 404);
    sendPicture(req, res, graphic);
  });

  return router;
}


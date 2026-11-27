import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import express from "express";
import { JIGSAW_ROOT, documentExists, isPictureId } from "./jigsaw-image";
import { JIGSAW, JIGSAW_MAX_PIECES, JIGSAW_PIECES, JigsawPiece, JigsawPieces } from "../models";
import { apiRouter, bad } from "../common/http";

// The pieces of a jigsaw: one document each in the subcollection `jigsaw/<id>/pieces`, with its number, its edges, where it is, on which layer and
// whether it is matched (the server says so, from where the piece is). Opening a saved jigsaw reads them back, so the game goes on where it was left.
// (The page draws a piece from the picture of the jigsaw: there is no picture of a piece.)

/** Where the pieces are kept (Firestore and Storage in the app, memory in the tests). */
export interface PieceStore {
  /** the pieces of a jigsaw, by number */
  list(jigsawId: string): Promise<JigsawPiece[]>;
  /** Replaces all the pieces of a jigsaw: it is cut again. False when there is no such jigsaw. */
  replaceAll(jigsawId: string, pieces: JigsawPiece[]): Promise<boolean>;
  /** Takes away everything of a jigsaw that is kept in these two places: its pieces and its files in Storage (the picture). */
  removeAll(jigsawId: string): Promise<void>;
}

const BATCH = 400;

/** The pieces in the subcollection of the jigsaw document, and the files of the jigsaw in the bucket. */
export function firestorePieceStore(): PieceStore {
  const db = () => getFirestore();
  const parent = (id: string) => db().collection(JIGSAW).doc(id);
  const pieces = (id: string) => parent(id).collection(JIGSAW_PIECES);
  const bucket = () => getStorage().bucket();
  const exists = (id: string) => documentExists(parent(id));

  return {
    async list(id) {
      const snap = await pieces(id).get();
      return snap.docs.map((d) => d.data() as JigsawPiece).sort((a, b) => a.number - b.number);
    },
    async replaceAll(id, list) {
      if (!(await exists(id))) return false;
      await db().recursiveDelete(pieces(id));
      for (let i = 0; i < list.length; i += BATCH) {
        const batch = db().batch();
        for (const piece of list.slice(i, i + BATCH)) batch.set(pieces(id).doc(piece.id), JigsawPieces.stored(piece));
        await batch.commit();
      }
      return true;
    },
    async removeAll(id) {
      await db().recursiveDelete(pieces(id));
      await bucket().deleteFiles({ prefix: `${JIGSAW_ROOT}/${id}/`, force: true }); // the picture, and the pictures of pieces that jigsaws saved earlier have
    },
  };
}

/**
 * The pieces of a jigsaw, `/jigsaw-pieces/:id`:
 *  GET: its pieces. PUT {pieces: [...]}: cut again, all the pieces are replaced. (Where the pieces are while a game is played is kept with the round, and a jigsaw's pieces go when it is deleted.)
 */
export function jigsawPiecesRouter(store: PieceStore, exists: (id: string) => Promise<boolean>): express.Router {
  const router = apiRouter();

  router.use("/:id", (req, res, next) => {
    if (!isPictureId(req.params.id)) return bad(res, "Not a jigsaw id.");
    next();
  });

  router.get("/:id", async (req, res) => {
    if (!(await exists(req.params.id))) return bad(res, "No such jigsaw.", 404);
    res.json({ pieces: await store.list(req.params.id) });
  });

  router.put("/:id", async (req, res) => {
    const list = (req.body as { pieces?: JigsawPiece[] } | undefined)?.pieces;
    if (!Array.isArray(list)) return bad(res, "Send the pieces as a list.");
    if (list.length > JIGSAW_MAX_PIECES) return bad(res, `At most ${JIGSAW_MAX_PIECES} pieces fit in a jigsaw.`);
    const ids = new Set<string>();
    for (const piece of list) {
      const error = JigsawPieces.error(piece);
      if (error) return bad(res, error);
      if (ids.has(piece.id)) return bad(res, "A piece is repeated.");
      ids.add(piece.id);
    }
    if (!(await store.replaceAll(req.params.id, list.map((p) => JigsawPieces.stored(p))))) return bad(res, "No such jigsaw.", 404);
    res.json({ pieces: list.length });
  });

  return router;
}


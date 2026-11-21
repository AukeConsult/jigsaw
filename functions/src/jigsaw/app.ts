import cors from "cors";
import express from "express";
import { CanvasStore, canvasListRouter, firestoreCanvasStore } from "../common/canvas-list";
import { ALLOWED_ORIGINS } from "../common/cors";
import { ImageStore, firestoreJigsawExists, jigsawImageRouter, storageImageStore } from "./jigsaw-image";
import { PieceStore, firestorePieceStore, jigsawPiecesRouter } from "./jigsaw-pieces";
import { JIGSAW, JigsawUsers } from "../models";
import { UserStore, firestoreUserStore, jigsawUsersRouter } from "./jigsaw-users";
import { PlayStore, firestorePlayStore, playsRouter, userPlaysRouter } from "./plays";

/** The address the API of Karins jigsaw answers on (Hosting forwards the full path to the function). */
export const JIGSAW_API = "/jigsaw/api";

/** The Express app behind the `jigsawApi` Cloud Function (also used directly by the tests): the jigsaws, their pieces and pictures, the users and their plays. */
export function createJigsawApp(stores: { jigsaw?: CanvasStore; jigsawImages?: ImageStore; jigsawPieces?: PieceStore; jigsawExists?: (id: string) => Promise<boolean>; plays?: PlayStore; users?: UserStore } = {}): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  // the pieces of a jigsaw come with their graphics: that route reads its own, bigger body
  const json = express.json({ limit: "600kb" });
  app.use((req, res, next) => (req.path.startsWith(`${JIGSAW_API}/jigsaw-pieces/`) ? next() : json(req, res, next)));

  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "jigsaw" });
  });
  // a jigsaw: its settings are a document in Firestore; its pieces are documents under it, and its picture and the graphics of its pieces are files in
  // Storage. A jigsaw that is deleted takes all of that with it.
  const jigsaw = stores.jigsaw ?? firestoreCanvasStore(JIGSAW);
  const pieces = stores.jigsawPieces ?? firestorePieceStore();
  const jigsawExists = stores.jigsawExists ?? firestoreJigsawExists;
  const plays = stores.plays ?? firestorePlayStore();
  const jigsawById = async (id: string) => (await jigsaw.list()).find((c) => c.id === id) ?? null;
  // the plays of a jigsaw: one game each, by one user; a play chooses only the difficulty and the look, never the size, the picture or the pieces
  const users = stores.users ?? firestoreUserStore();
  // the games of a user over all the jigsaws (before the users, whose own routes would take the address first)
  router.use("/jigsaw-users/:id/plays", userPlaysRouter(plays, { jigsaws: () => jigsaw.list(), userOf: async (userId) => (await users.get(userId)) ?? null }));
  router.use("/jigsaw-users", jigsawUsersRouter(users));
  router.use("/jigsaw/:id/plays", playsRouter(plays, { jigsaw: jigsawById, pieces, userOf: async (userId) => (await users.get(userId)) ?? null }));
  // the owner of a jigsaw is a user that exists (chosen from the users); the author of the jigsaw is then that user's name, put there here, not taken from the request
  const stampOwner: express.RequestHandler = async (req, res, next) => {
    const body = (req.body ?? {}) as { ownerUid?: unknown; author?: unknown };
    if (body.ownerUid === undefined) return next();
    const user = typeof body.ownerUid === "string" && !JigsawUsers.idError(body.ownerUid) ? await users.get(body.ownerUid) : null;
    if (!user) return void res.status(400).json({ error: "The owner must be a user that exists: choose the author from the users." });
    body.author = user.name;
    next();
  };
  // a jigsaw is deleted by its owner only (the header `X-Jigsaw-User` is the UID of who asks; a jigsaw from before owners has none and can be deleted by anyone). There is
  // no sign-in yet, so this keeps the app honest, it is not a lock.
  router.delete("/jigsaw/:id", async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now?.ownerUid && req.get("X-Jigsaw-User") !== now.ownerUid) return void res.status(403).json({ error: "Only the owner of a jigsaw can delete it." });
    next();
  });
  router.post("/jigsaw", stampOwner);
  router.put("/jigsaw/:id", stampOwner);
  // a jigsaw only its owner sees can be changed by its owner only (for anyone else it is not there)
  router.put("/jigsaw/:id", async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now?.visibility === "owner" && req.get("X-Jigsaw-User") !== now.ownerUid) return void res.status(404).json({ error: "No such canvas." });
    next();
  });
  // a jigsaw that has been played keeps its size, grid and pieces (every play shares them): a change of them is refused
  router.put("/jigsaw/:id", async (req, res, next) => {
    const body = (req.body ?? {}) as { width?: unknown; height?: unknown; gridSize?: unknown };
    const now = await jigsawById(req.params.id);
    if (!now) return next();
    if (!(await plays.has(req.params.id))) {
      await plays.removeFresh(req.params.id); // not played: the rounds that are only opened go, their pieces would be out of date after the change
      return next();
    }
    if (body.width !== now.width || body.height !== now.height || body.gridSize !== now.gridSize) {
      return void res.status(409).json({ error: "This jigsaw has been played: its size and pieces can not change." });
    }
    next();
  });
  router.use(
    "/jigsaw",
    canvasListRouter({
      ...jigsaw,
      remove: async (id) => (await jigsaw.remove(id)) && (await Promise.all([pieces.removeAll(id), plays.removeAll(id)]).then(() => true, () => true)),
    }),
  );
  router.use("/jigsaw-image", jigsawImageRouter(stores.jigsawImages ?? storageImageStore(), jigsawExists));
  router.use("/jigsaw-pieces", jigsawPiecesRouter(pieces, jigsawExists));
  app.use(JIGSAW_API, router);
  return app;
}

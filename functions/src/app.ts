import cors from "cors";
import express from "express";
import { CanvasStore, canvasListRouter, firestoreCanvasStore } from "./canvas-list";
import { ImageStore, firestoreJigsawExists, jigsawImageRouter, storageImageStore } from "./jigsaw-image";
import { PieceStore, firestorePieceStore, jigsawPiecesRouter } from "./jigsaw-pieces";
import { JIGSAW } from "./models";
import { CanvasObjectStore, canvasObjectsRouter, firestoreCanvasObjectStore } from "./canvas-objects";

/** The addresses of the app that may call the API from a browser. */
const ALLOWED_ORIGINS = ["https://canvas-auke.web.app", "https://canvas-auke.firebaseapp.com", "http://localhost:4210", "http://localhost:5010"];

/** The Express app behind the `canvasApi` Cloud Function (also used directly by the tests). */
export function createApp(stores: { canvasList?: CanvasStore; jigsaw?: CanvasStore; jigsawImages?: ImageStore; jigsawPieces?: PieceStore; jigsawExists?: (id: string) => Promise<boolean>; canvasObjects?: CanvasObjectStore } = {}): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  // the pieces of a jigsaw come with their graphics: that route reads its own, bigger body
  const json = express.json({ limit: "600kb" });
  app.use((req, res, next) => (req.path.startsWith("/api/jigsaw-pieces/") ? next() : json(req, res, next)));

  // Hosting forwards the full path (including /api) to the function.
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "canvas" });
  });
  router.use("/canvas-list", canvasListRouter(stores.canvasList ?? firestoreCanvasStore()));
  // a jigsaw: its settings are a document in Firestore; its pieces are documents under it, and its picture and the graphics of its pieces are files in
  // Storage. A jigsaw that is deleted takes all of that with it.
  const jigsaw = stores.jigsaw ?? firestoreCanvasStore(JIGSAW);
  const pieces = stores.jigsawPieces ?? firestorePieceStore();
  const jigsawExists = stores.jigsawExists ?? firestoreJigsawExists;
  router.use("/jigsaw", canvasListRouter({ ...jigsaw, remove: async (id) => (await jigsaw.remove(id)) && (await pieces.removeAll(id).then(() => true, () => true)) }));
  router.use("/jigsaw-image", jigsawImageRouter(stores.jigsawImages ?? storageImageStore(), jigsawExists));
  router.use("/jigsaw-pieces", jigsawPiecesRouter(pieces, jigsawExists));
  router.use("/canvas-objects", canvasObjectsRouter(stores.canvasObjects ?? firestoreCanvasObjectStore()));
  app.use("/api", router);
  return app;
}

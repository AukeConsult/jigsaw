import cors from "cors";
import express from "express";
import { CanvasStore, canvasListRouter, firestoreCanvasStore } from "./canvas-list";
import { JIGSAW } from "./models";
import { CanvasObjectStore, canvasObjectsRouter, firestoreCanvasObjectStore } from "./canvas-objects";

/** The addresses of the app that may call the API from a browser. */
const ALLOWED_ORIGINS = ["https://canvas-auke.web.app", "https://canvas-auke.firebaseapp.com", "http://localhost:4210", "http://localhost:5010"];

/** The Express app behind the `canvasApi` Cloud Function (also used directly by the tests). */
export function createApp(stores: { canvasList?: CanvasStore; jigsaw?: CanvasStore; canvasObjects?: CanvasObjectStore } = {}): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json({ limit: "200kb" }));

  // Hosting forwards the full path (including /api) to the function.
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "canvas" });
  });
  router.use("/canvas-list", canvasListRouter(stores.canvasList ?? firestoreCanvasStore()));
  router.use("/jigsaw", canvasListRouter(stores.jigsaw ?? firestoreCanvasStore(JIGSAW)));
  router.use("/canvas-objects", canvasObjectsRouter(stores.canvasObjects ?? firestoreCanvasObjectStore()));
  app.use("/api", router);
  return app;
}

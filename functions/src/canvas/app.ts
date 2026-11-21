import cors from "cors";
import express from "express";
import { CanvasStore, canvasListRouter, firestoreCanvasStore } from "../common/canvas-list";
import { ALLOWED_ORIGINS } from "../common/cors";
import { CanvasObjectStore, canvasObjectsRouter, firestoreCanvasObjectStore } from "./canvas-objects";

/** The address the API of Canvas answers on (Hosting forwards the full path to the function). */
export const CANVAS_API = "/canvas/api";

/** The Express app behind the `canvasApi` Cloud Function (also used directly by the tests): the saved canvases and the canvas objects. */
export function createCanvasApp(stores: { canvasList?: CanvasStore; canvasObjects?: CanvasObjectStore } = {}): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json({ limit: "600kb" }));

  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "canvas" });
  });
  router.use("/canvas-list", canvasListRouter(stores.canvasList ?? firestoreCanvasStore()));
  router.use("/canvas-objects", canvasObjectsRouter(stores.canvasObjects ?? firestoreCanvasObjectStore()));
  app.use(CANVAS_API, router);
  return app;
}

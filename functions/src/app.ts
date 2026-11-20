import cors from "cors";
import express from "express";

/** The addresses of the app that may call the API from a browser. */
const ALLOWED_ORIGINS = ["https://canvas.web.app", "https://canvas.firebaseapp.com", "http://localhost:4200", "http://localhost:5010"];

/** The Express app behind the `canvasApi` Cloud Function (also used directly by the tests). */
export function createApp(): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  app.use(express.json({ limit: "200kb" }));

  // Hosting forwards the full path (including /api) to the function.
  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "canvas" });
  });
  app.use("/api", router);
  return app;
}

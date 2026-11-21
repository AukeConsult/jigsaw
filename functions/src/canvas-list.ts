import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { DocumentStore, documentStore } from "./document-store";
import { CANVAS_LIST, CanvasArea, CanvasInput, CanvasSpec } from "./models";

/** Where the canvas areas are kept (Firestore in the app, a memory store in the tests). */
export type CanvasStore = DocumentStore<CanvasInput, CanvasSpec>;

/** The Firestore collection `canvas-list` (or another with the same kind of documents, like `jigsaw`): the newest 100; a canvas that an older version saved is read as the model says (see `CanvasArea.fromStored`). */
export function firestoreCanvasStore(collection: string = CANVAS_LIST): CanvasStore {
  return documentStore<CanvasInput, CanvasSpec>(() => getFirestore().collection(collection), 100, (id, doc) => CanvasArea.fromStored(id, doc as Partial<CanvasSpec>));
}

/** The checked canvas of a request body, as it is stored (only the known fields), or the reason it is not allowed. */
function readInput(body: Record<string, unknown>): { input: CanvasInput } | { error: string } {
  const area = new CanvasArea(body);
  const error = area.error();
  return error ? { error } : { input: area.stored() };
}

/** The routes of a collection of canvas areas (`/canvas-list`, and `/jigsaw` the same way). GET /canvas-list: the saved canvas areas, newest first. POST /canvas-list: save a new one. PUT /canvas-list/:id: change a saved one (the page autosaves with these). DELETE /canvas-list/:id: delete one. */
export function canvasListRouter(store: CanvasStore): express.Router {
  const router = express.Router();

  // a jigsaw its owner keeps to themselves is listed for the owner only (the header `X-Jigsaw-User` is the UID of who asks; there is no sign-in yet, so this keeps the lists honest, it is not a lock)
  router.get("/", async (req, res) => {
    const me = req.get("X-Jigsaw-User");
    res.json((await store.list()).filter((c) => c.visibility !== "owner" || (!!me && c.ownerUid === me)));
  });

  router.post("/", async (req, res) => {
    const read = readInput((req.body ?? {}) as Record<string, unknown>);
    if ("error" in read) {
      res.status(400).json({ error: read.error });
      return;
    }
    res.status(201).json(await store.add(read.input));
  });

  router.put("/:id", async (req, res) => {
    const read = readInput((req.body ?? {}) as Record<string, unknown>);
    if ("error" in read) {
      res.status(400).json({ error: read.error });
      return;
    }
    const saved = await store.update(req.params.id, read.input);
    if (!saved) {
      res.status(404).json({ error: "No such canvas." });
      return;
    }
    res.json(saved);
  });

  router.delete("/:id", async (req, res) => {
    if (!(await store.remove(req.params.id))) {
      res.status(404).json({ error: "No such canvas." });
      return;
    }
    res.status(204).end();
  });

  return router;
}

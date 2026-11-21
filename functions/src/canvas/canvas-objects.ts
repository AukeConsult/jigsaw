import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { DocumentStore, documentStore } from "../common/document-store";
import { CANVAS_OBJECTS, CanvasBaseObject, CanvasObject, CanvasObjectInput } from "../models";

/** Where the canvas objects are kept (Firestore in the app, a memory store in the tests). */
export type CanvasObjectStore = DocumentStore<CanvasObjectInput, CanvasObject>;

/** The Firestore collection `canvas-objects`: the newest 200; an object that an older version saved is read as the model says (see `CanvasBaseObject.fromStored`). */
export function firestoreCanvasObjectStore(): CanvasObjectStore {
  return documentStore<CanvasObjectInput, CanvasObject>(() => getFirestore().collection(CANVAS_OBJECTS), 200, (id, doc) => ({
    id,
    ...CanvasBaseObject.fromStored(doc as Partial<CanvasObjectInput>),
    createdAt: doc["createdAt"] as number,
  }));
}

/** The checked object of a request body, as it is stored (only the known fields), or the reason it is not allowed. */
function readInput(body: Record<string, unknown>): { input: CanvasObjectInput } | { error: string } {
  const error = CanvasBaseObject.of(body as Partial<CanvasObjectInput>).error();
  return error ? { error } : { input: CanvasBaseObject.stored(body as unknown as CanvasObjectInput) };
}

/** GET /canvas-objects: the saved objects, newest first. POST /canvas-objects: save one (see CanvasObjectInput). PUT /canvas-objects/:id: change a saved one (the page autosaves with these). DELETE /canvas-objects/:id: delete one. */
export function canvasObjectsRouter(store: CanvasObjectStore): express.Router {
  const router = express.Router();

  router.get("/", async (_req, res) => {
    res.json(await store.list());
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
      res.status(404).json({ error: "No such object." });
      return;
    }
    res.json(saved);
  });

  router.delete("/:id", async (req, res) => {
    if (!(await store.remove(req.params.id))) {
      res.status(404).json({ error: "No such object." });
      return;
    }
    res.status(204).end();
  });

  return router;
}

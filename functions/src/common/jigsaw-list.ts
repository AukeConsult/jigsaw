import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { DocumentStore, documentStore } from "./document-store";
import { JIGSAW_HEAD_FIELDS, JigsawSettings, JigsawInput, JigsawSpec, JigsawVisibilities } from "../models";

/** Where the jigsaws are kept (Firestore in the app, a memory store in the tests). */
export type JigsawStore = DocumentStore<JigsawInput, JigsawSpec>;

/** The jigsaws in a Firestore collection (`jigsaw`): the newest 100; a jigsaw that an older version saved is read as the model says (see `JigsawSettings.fromStored`). */
export function firestoreJigsawStore(collection: string): JigsawStore {
  return documentStore<JigsawInput, JigsawSpec>(() => getFirestore().collection(collection), 100, (id, doc) => JigsawSettings.fromStored(id, doc as Partial<JigsawSpec>), {
    headFields: JIGSAW_HEAD_FIELDS, // everything but the objects placed on the board (`placed`), which can be most of a document
    async peek(id, fields) {
      const ref = getFirestore().collection(collection).doc(id);
      return (await getFirestore().getAll(ref, { fieldMask: [...fields] }))[0];
    },
  });
}

/** The jigsaws newest first without what is placed on their boards (the list does not use it): what `heads()` of the store reads. */
export const jigsawHeads = (store: JigsawStore): Promise<JigsawSpec[]> => (store.heads ? store.heads() : store.list());

/** The checked jigsaw of a request body, as it is stored (only the known fields), or the reason it is not allowed. */
function readInput(body: Record<string, unknown>): { input: JigsawInput } | { error: string } {
  const settings = new JigsawSettings(body);
  const error = settings.error();
  return error ? { error } : { input: settings.stored() };
}

/** The routes of the list of jigsaws (mounted at `/jigsaw`). GET: the saved jigsaws, newest first. POST: save a new one. PUT /:id: change a saved one (the page autosaves with these). DELETE /:id: delete one. */
export function jigsawListRouter(store: JigsawStore, canSee: (jigsaw: JigsawSpec, me: string | undefined) => Promise<boolean> = async (j, me) => !JigsawVisibilities.restricted(j.visibility) || (!!me && j.ownerUid === me),
  /** the jigsaw as an answer for somebody who may see it: with the key of its pictures when it is private or hidden (it is never kept) */
  keyed: (jigsaw: JigsawSpec) => Promise<JigsawSpec> = async (j) => j,
): express.Router {
  const router = express.Router();

  // a jigsaw its owner keeps to themselves is listed for those `canSee` says (the owner, and whoever the app adds: the header `X-Jigsaw-User` is the UID of who asks; there is no
  // sign-in yet, so this keeps the lists honest, it is not a lock)
  router.get("/", async (req, res) => {
    const me = req.get("X-Jigsaw-User");
    const all = await jigsawHeads(store); // the page does not need what is placed on each board: the jigsaw itself is read by its id
    const seen = await Promise.all(all.map((j) => canSee(j, me)));
    res.json(await Promise.all(all.filter((_, i) => seen[i]).map(keyed)));
  });

  // one jigsaw by its id (for the page of a jigsaw, a round and the forms: they do not need the whole list); a jigsaw the person may not see is not there
  router.get("/:id", async (req, res) => {
    const one = store.get ? await store.get(req.params.id) : ((await store.list()).find((j) => j.id === req.params.id) ?? null);
    if (!one || !(await canSee(one, req.get("X-Jigsaw-User")))) return void res.status(404).json({ error: "No such jigsaw." });
    res.json(await keyed(one));
  });

  router.post("/", async (req, res) => {
    const read = readInput((req.body ?? {}) as Record<string, unknown>);
    if ("error" in read) {
      res.status(400).json({ error: read.error });
      return;
    }
    res.status(201).json(await keyed(await store.add(read.input)));
  });

  router.put("/:id", async (req, res) => {
    const read = readInput((req.body ?? {}) as Record<string, unknown>);
    if ("error" in read) {
      res.status(400).json({ error: read.error });
      return;
    }
    const saved = await store.update(req.params.id, read.input);
    if (!saved) {
      res.status(404).json({ error: "No such jigsaw." });
      return;
    }
    res.json(await keyed(saved));
  });

  router.delete("/:id", async (req, res) => {
    if (!(await store.remove(req.params.id))) {
      res.status(404).json({ error: "No such jigsaw." });
      return;
    }
    res.status(204).end();
  });

  return router;
}

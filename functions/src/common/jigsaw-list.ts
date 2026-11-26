import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { DocumentStore, documentStore, findById } from "./document-store";
import { JIGSAW_HEAD_FIELDS, JigsawSettings, JigsawInput, JigsawSpec, JigsawVisibilities } from "../models";
import { apiRouter, askerOf, bad } from "./http";
import { filterAsync } from "./filter-async";

/** Where the jigsaws are kept (Firestore in the app, a memory store in the tests). */
export type JigsawStore = DocumentStore<JigsawInput, JigsawSpec> & {
  /** how many jigsaws an account owns, however old (a fake store may leave it out: its list is counted then) */
  countOwned?(ownerUid: string): Promise<number>;
  /** how many of them are not public (private or hidden; a fake store may leave it out) */
  countNotPublic?(ownerUid: string): Promise<number>;
};

/** The jigsaws in a Firestore collection (`jigsaw`): the newest 100; a jigsaw that an older version saved is read as the model says (see `JigsawSettings.fromStored`). */
export function firestoreJigsawStore(collection: string): JigsawStore {
  const store = documentStore<JigsawInput, JigsawSpec>(() => getFirestore().collection(collection), 100, (id, doc) => JigsawSettings.fromStored(id, doc as Partial<JigsawSpec>), {
    headFields: JIGSAW_HEAD_FIELDS, // everything but the objects placed on the board (`placed`), which can be most of a document
    async peek(id, fields) {
      const ref = getFirestore().collection(collection).doc(id);
      return (await getFirestore().getAll(ref, { fieldMask: [...fields] }))[0];
    },
  });
  return {
    ...store,
    // one equality on one field, counted by Firestore: no composite index, and no document is read
    countOwned: async (ownerUid) => (await getFirestore().collection(collection).where("ownerUid", "==", ownerUid).count().get()).data().count,
    // (only who sees each is read, and counted here: no composite index)
    countNotPublic: async (ownerUid) => (await getFirestore().collection(collection).where("ownerUid", "==", ownerUid).select("visibility").get()).docs.filter((d) => JigsawVisibilities.restricted(d.data().visibility as string | undefined)).length,
  };
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
export function jigsawListRouter(
  store: JigsawStore,
  /** whether the person may see this one jigsaw (the request may carry the key of a link that opens it) */
  canSee: (jigsaw: JigsawSpec, me: string | undefined, req?: express.Request) => Promise<boolean>,
  /** the jigsaw as an answer for somebody who may see it: with the key of its pictures when it is private or hidden (it is never kept) */
  keyed: (jigsaw: JigsawSpec) => Promise<JigsawSpec>,
  /** whether the jigsaw is in the LIST for the person (the front page's rule: a private one for its owner and its players, a hidden one for its owner; an admin who may open it does not find it in the list) */
  canList: (jigsaw: JigsawSpec, me: string | undefined) => Promise<boolean>,
): express.Router {
  const router = apiRouter();

  // a jigsaw its owner keeps to themselves is listed for those `canSee` says (the owner, and whoever the app adds: the header `X-Jigsaw-User` is the UID of who asks; there is no
  // sign-in yet, so this keeps the lists honest, it is not a lock)
  router.get("/", async (req, res) => {
    const me = askerOf(req);
    const all = await jigsawHeads(store); // the page does not need what is placed on each board: the jigsaw itself is read by its id
    res.json(await Promise.all((await filterAsync(all, (j) => canList(j, me))).map(keyed)));
  });

  // one jigsaw by its id (for the page of a jigsaw, a round and the forms: they do not need the whole list); a jigsaw the person may not see is not there
  router.get("/:id", async (req, res) => {
    const one = await findById(store, req.params.id);
    if (!one || !(await canSee(one, askerOf(req), req))) return bad(res, "No such jigsaw.", 404);
    res.json(await keyed(one));
  });

  router.post("/", async (req, res) => {
    const read = readInput((req.body ?? {}) as Record<string, unknown>);
    if ("error" in read) {
      bad(res, read.error);
      return;
    }
    res.status(201).json(await keyed(await store.add(read.input)));
  });

  router.put("/:id", async (req, res) => {
    const read = readInput((req.body ?? {}) as Record<string, unknown>);
    if ("error" in read) {
      bad(res, read.error);
      return;
    }
    const saved = await store.update(req.params.id, read.input);
    if (!saved) {
      bad(res, "No such jigsaw.", 404);
      return;
    }
    res.json(await keyed(saved));
  });

  router.delete("/:id", async (req, res) => {
    if (!(await store.remove(req.params.id))) {
      bad(res, "No such jigsaw.", 404);
      return;
    }
    res.status(204).end();
  });

  return router;
}

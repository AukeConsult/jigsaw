import { FieldValue, getFirestore } from "firebase-admin/firestore";
import express from "express";
import { JIGSAW_USERS, JigsawUserSpec, JigsawUsers } from "./models";

// The users of the jigsaws: one document each in the collection `jigsaw-users`, with an id the database makes (the UID, the one a play is kept by), the user name the
// person chose (the extra, for looking a user up and showing who is who: unique) and a name. There is no sign-in: knowing a user name is enough to play as that user, for
// now. A user that an earlier version made has its user name as the id of its document and no `username` field: that is read as the user name (see `JigsawUsers.fromStored`).

/** The most users that are listed. */
const LIST_LIMIT = 500;

/** Where the users are kept (Firestore in the app, memory in the tests). */
export interface UserStore {
  /** the users, by name (at most `LIST_LIMIT`) */
  list(): Promise<JigsawUserSpec[]>;
  /** the user with this UID */
  get(id: string): Promise<JigsawUserSpec | null>;
  /** the user who has this user name (already in small letters) */
  findByUsername(username: string): Promise<JigsawUserSpec | null>;
  /** Makes the user, with a UID of its own; null when the user name is already taken (nothing is made then). */
  create(user: Omit<JigsawUserSpec, "id">): Promise<JigsawUserSpec | null>;
  /**
   * Changes a user: only what is in the change (an e-mail address that is null is taken away). The user as it is then; null when there is no such user; "taken" when the
   * new user name is another user's (nothing is changed then).
   */
  update(id: string, change: UserChange): Promise<JigsawUserSpec | "taken" | null>;
}

/** What can be changed of a user. */
export interface UserChange {
  name?: string;
  username?: string;
  email?: string | null;
}

/** The collection `jigsaw-users`. */
export function firestoreUserStore(): UserStore {
  const db = () => getFirestore();
  const users = () => db().collection(JIGSAW_USERS);
  const read = (id: string, data: unknown) => JigsawUsers.fromStored(id, data as Partial<JigsawUserSpec>);
  const findByUsername = async (username: string): Promise<JigsawUserSpec | null> => {
    const found = await users().where("username", "==", username).limit(1).get(); // one equality: no index needed
    if (!found.empty) return read(found.docs[0].id, found.docs[0].data());
    const legacy = await users().doc(username).get(); // a user an earlier version made: its user name is the id of its document
    return legacy.exists ? read(legacy.id, legacy.data()) : null;
  };
  return {
    async list() {
      const snap = await users().limit(LIST_LIMIT).get();
      return snap.docs.map((d) => read(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    },
    async get(id) {
      const doc = await users().doc(id).get();
      return doc.exists ? read(id, doc.data()) : null;
    },
    findByUsername,
    async create(user) {
      const ref = users().doc(); // the UID: made by the database
      // checked and made as one step, so two people cannot take the same user name at the same time
      return db().runTransaction(async (tx) => {
        const [same, legacy] = await Promise.all([tx.get(users().where("username", "==", user.username).limit(1)), tx.get(users().doc(user.username))]);
        if (!same.empty || legacy.exists) return null;
        tx.create(ref, { username: user.username, name: user.name, ...(user.email ? { email: user.email } : {}), createdAt: user.createdAt });
        return { id: ref.id, ...user };
      });
    },
    async update(id, change) {
      const ref = users().doc(id);
      // read, checked and changed as one step, so a user name cannot be taken by two at the same time
      return db().runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) return null;
        const current = read(id, doc.data());
        let taken = false;
        if (change.username !== undefined && change.username !== current.username) {
          const [same, legacy] = await Promise.all([tx.get(users().where("username", "==", change.username).limit(1)), tx.get(users().doc(change.username))]);
          taken = (!same.empty && same.docs[0].id !== id) || (legacy.exists && legacy.id !== id);
        }
        if (taken) return "taken" as const;
        const data: Record<string, unknown> = {};
        if (change.name !== undefined) data.name = change.name;
        if (change.username !== undefined) data.username = change.username;
        if (change.email !== undefined) data.email = change.email ?? FieldValue.delete();
        if (Object.keys(data).length) tx.update(ref, data);
        const next: Partial<JigsawUserSpec> = { ...(doc.data() as object), ...(change.name !== undefined ? { name: change.name } : {}), ...(change.username !== undefined ? { username: change.username } : {}) };
        if (change.email === null) delete next.email;
        else if (change.email !== undefined) next.email = change.email;
        return read(id, next);
      });
    },
  };
}

/**
 * The users, `/jigsaw-users`: POST {username, name, email?} makes a user (the e-mail address is optional and private: given back only here, never in a lookup) and gives it a UID (409 when the user name is taken); GET /by-username/:username finds a user by the user
 * name (404 when there is none: that is how the page finds out whether a user name exists); GET /:id reads a user by its UID; PUT /:id {name?, username?, email?} changes a user (an empty e-mail takes it away; 409 when the new user name is taken).
 * GET / lists the users (id, user name and name; never the e-mail addresses), to choose who plays from.
 */
export function jigsawUsersRouter(store: UserStore, now: () => number = Date.now): express.Router {
  const router = express.Router();
  const bad = (res: express.Response, error: string, status = 400) => void res.status(status).json({ error });

  router.get("/", async (_req, res) => {
    res.json((await store.list()).map(JigsawUsers.publicOf)); // to choose who plays from: without the e-mail addresses, which are private
  });

  router.post("/", async (req, res) => {
    const body = (req.body ?? {}) as { username?: unknown; name?: unknown; email?: unknown };
    const error = JigsawUsers.error(body);
    if (error) return bad(res, error);
    const made = await store.create(JigsawUsers.stored(body as { username: string; name: string; email?: string }, now()));
    if (!made) return bad(res, "That user name is taken: choose another.", 409);
    res.status(201).json(made); // the person who made the user gets everything back, the e-mail address too
  });

  router.get("/by-username/:username", async (req, res) => {
    const error = JigsawUsers.usernameError(req.params.username);
    if (error) return bad(res, error);
    const user = await store.findByUsername(JigsawUsers.normalised(req.params.username));
    if (!user) return bad(res, "No such user.", 404);
    res.json(JigsawUsers.publicOf(user));
  });

  router.get("/:id", async (req, res) => {
    const error = JigsawUsers.idError(req.params.id);
    if (error) return bad(res, error);
    const user = await store.get(req.params.id);
    if (!user) return bad(res, "No such user.", 404);
    res.json(JigsawUsers.publicOf(user));
  });

  router.put("/:id", async (req, res) => {
    const idError = JigsawUsers.idError(req.params.id);
    if (idError) return bad(res, idError);
    const read = JigsawUsers.change((req.body ?? {}) as { name?: unknown; username?: unknown; email?: unknown });
    if ("error" in read) return bad(res, read.error);
    const user = await store.update(req.params.id, read.change);
    if (user === "taken") return bad(res, "That user name is taken: choose another.", 409);
    if (!user) return bad(res, "No such user.", 404);
    res.json(JigsawUsers.publicOf(user)); // the e-mail address is private: it is not given back
  });

  return router;
}

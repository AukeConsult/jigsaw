import { FieldValue, getFirestore } from "firebase-admin/firestore";
import express from "express";
import { ImageStore, documentExists, pictureType } from "./jigsaw-image";
import { JIGSAW_USERS, JigsawUserSpec, JigsawUsers, UserLevel, UserLevels, UserSettings } from "../models";
import type { Levels } from "./user-levels";
import { apiRouter, askerOf, bad } from "../common/http";

// The users of the jigsaws: one document each in the collection `jigsaw-users`, with an id the database makes (the UID, the one a play is kept by), the user name the
// person chose (the extra, for looking a user up and showing who is who: unique) and a name. There is no sign-in: knowing a user name is enough to play as that user, for
// now. A user that an earlier version made has its user name as the id of its document and no `username` field: that is read as the user name (see `JigsawUsers.fromStored`).

/** The most users that are listed. */
const LIST_LIMIT = 500;

/** Where the users are kept (Firestore in the app, memory in the tests). */
export interface UserStore {
  /** the users, by name (at most `LIST_LIMIT`) */
  list(): Promise<JigsawUserSpec[]>;
  /** the ids of the users (at most `LIST_LIMIT`), for who only needs to know who they are: no field is read. A fake store may leave it out: the list is used then. */
  ids?(): Promise<string[]>;
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
  /** The users that have this Firebase account among their verified accounts, by name. */
  linkedTo(uid: string): Promise<JigsawUserSpec[]>;
  /**
   * Changes the list of verified accounts of a user as one step (it is read, `change` says what it should be, and it is written), so two people adding an account at the same moment do not
   * overwrite each other. `change` gets the list now and gives the list it should be, or `{ error }`, which is given back and nothing is written. The list as it is then; null when there is no such user.
   */
  changeLogons(id: string, change: (now: string[]) => string[] | { error: string }): Promise<string[] | { error: string } | null>;
  /** Deletes the user for good, with what is kept under it (its link codes, its AI use); false when there is no such user. */
  remove(id: string): Promise<boolean>;
}

/** What is attached to a user, so the page can be told whether it may be deleted: the jigsaws it owns and the rounds it has played; `clearFresh` takes away its rounds nobody moved a piece in. */
export interface UserUse {
  count(userId: string): Promise<{ jigsaws: number; rounds: number }>;
  clearFresh(userId: string): Promise<void>;
}

/** What can be changed of a user: the settings the person chooses, and what only the server sets. */
export type UserChange = UserSettings & {
  /** when the picture was set (null: it was taken away); the picture itself is a file in Storage */
  pictureAt?: number | null;
  /** set by the server when the account is chosen, never by a body from the page */
  lastUsedAt?: number;
  /** set by an admin only (`userLevelRouter`), never by a body that changes a user; `user` takes the kept level away */
  level?: UserLevel;
};

/** The fields of a change that are written as they are, every one of them (the type sees to it): nothing else of a change is ever saved. `level` and `pictureAt` have rules of their own. */
const WRITTEN: Record<keyof UserSettings | "lastUsedAt", true> = { name: true, username: true, language: true, search: true, listFilter: true, playLook: true, textLook: true, tileSize: true, labelSize: true, tileDetails: true, lastUsedAt: true };

/** The collection `jigsaw-users`. */
export function firestoreUserStore(): UserStore {
  const db = () => getFirestore();
  const users = () => db().collection(JIGSAW_USERS);
  const read = (id: string, data: unknown) => JigsawUsers.fromStored(id, data as Partial<JigsawUserSpec>);
  /** an alias can have any characters, but only one that looks like the ids of earlier versions can be the id of a document (it is looked for there too) */
  const isLegacyId = (username: string) => /^[a-z0-9_-]+$/.test(username);
  const findByUsername = async (username: string): Promise<JigsawUserSpec | null> => {
    const found = await users().where("username", "==", username).limit(1).get(); // one equality: no index needed
    if (!found.empty) return read(found.docs[0].id, found.docs[0].data());
    if (!isLegacyId(username)) return null;
    const legacy = await users().doc(username).get(); // a user an earlier version made: its user name is the id of its document
    return legacy.exists ? read(legacy.id, legacy.data()) : null;
  };
  return {
    async list() {
      const snap = await users().limit(LIST_LIMIT).get();
      return snap.docs.map((d) => read(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    },
    async ids() {
      return (await users().limit(LIST_LIMIT).select().get()).docs.map((d) => d.id);
    },
    async get(id) {
      const doc = await users().doc(id).get();
      return doc.exists ? read(id, doc.data()) : null;
    },
    findByUsername,
    async linkedTo(uid) {
      const snap = await users().where("firebaseUids", "array-contains", uid).limit(LIST_LIMIT).get(); // one array-contains: no index needed
      return snap.docs.map((d) => read(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    },
    async changeLogons(id, change) {
      const ref = users().doc(id);
      return db().runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) return null;
        const now = JigsawUsers.logonsOf(doc.data());
        const next = change(now);
        if (!Array.isArray(next)) return next;
        if (next.length !== now.length || next.some((u, i) => u !== now[i])) tx.update(ref, next.length ? { firebaseUids: next } : { firebaseUids: FieldValue.delete(), level: FieldValue.delete() }); // an account that is open again has no level: it could be taken by the next login
        return next;
      });
    },
    async remove(id) {
      const ref = users().doc(id);
      if (!(await documentExists(ref))) return false;
      await db().recursiveDelete(ref); // its subcollections too (link codes, AI use)
      return true;
    },
    async create(user) {
      const ref = users().doc(); // the UID: made by the database
      // checked and made as one step, so two people cannot take the same user name at the same time
      return db().runTransaction(async (tx) => {
        const [same, legacy] = await Promise.all([tx.get(users().where("username", "==", user.username).limit(1)), isLegacyId(user.username) ? tx.get(users().doc(user.username)) : Promise.resolve(null)]);
        if (!same.empty || legacy?.exists) return null;
        tx.create(ref, { username: user.username, name: user.name, language: user.language, createdAt: user.createdAt, ...(user.firebaseUids?.length ? { firebaseUids: user.firebaseUids } : {}) }); // the language too: it was not kept for a new user; a user made with a login is verified for it from the start
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
          const [same, legacy] = await Promise.all([tx.get(users().where("username", "==", change.username).limit(1)), isLegacyId(change.username) ? tx.get(users().doc(change.username)) : Promise.resolve(null)]);
          taken = (!same.empty && same.docs[0].id !== id) || (!!legacy?.exists && legacy.id !== id);
        }
        if (taken) return "taken" as const;
        const plain = Object.fromEntries((Object.keys(WRITTEN) as (keyof typeof WRITTEN)[]).filter((field) => change[field] !== undefined).map((field) => [field, change[field]]));
        const data = {
          ...plain,
          ...(change.level !== undefined ? { level: change.level === "user" ? FieldValue.delete() : change.level } : {}),
          ...(change.pictureAt !== undefined ? { pictureAt: change.pictureAt ?? FieldValue.delete() } : {}),
        };
        if (Object.keys(data).length) tx.update(ref, data);
        const next: Partial<JigsawUserSpec> = { ...(doc.data() as object), ...plain, ...(change.level !== undefined ? { level: change.level } : {}) };
        if (change.pictureAt !== undefined) {
          if (change.pictureAt) next.pictureAt = change.pictureAt;
          else delete next.pictureAt;
        }
        return read(id, next);
      });
    },
  };
}

/**
 * The users, `/jigsaw-users`: POST {username, name} makes a user and gives it a UID (409 when the user name is taken); GET /by-username/:username finds a user by the user
 * name (404 when there is none: that is how the page finds out whether a user name exists); GET /:id reads a user by its UID; PUT /:id {name?, username?, language?, search?, listFilter?, picture?} changes a user (`search` is how the user looks for jigsaws, kept when Go is pressed on the Find page, and `listFilter` what the app's picture list is filtered by; an empty e-mail takes it away; 409 when the new user name is taken).
 * GET / lists the users (id, alias, name and when the picture was set), to choose who plays from.
 */
export function jigsawUsersRouter(store: UserStore, pictures: ImageStore, use?: UserUse, now: () => number = Date.now, levels?: Levels): express.Router {
  const router = apiRouter();

  /** The account of the address; else the answer says why not and nothing is given. */
  const accountOf = async (req: express.Request, res: express.Response): Promise<JigsawUserSpec | null> => {
    const id = String(req.params.id);
    const idError = JigsawUsers.idError(id);
    const user = idError ? null : await store.get(id);
    if (!user) bad(res, idError || "No such account.", idError ? 400 : 404);
    return user;
  };

  router.get("/", async (_req, res) => {
    res.json((await store.list()).map(JigsawUsers.publicOf)); // to choose who plays from: without what is private (the logins, the picture itself)
  });

  router.post("/", async (req, res) => {
    const body = (req.body ?? {}) as { username?: unknown; name?: unknown; language?: unknown };
    const error = JigsawUsers.error(body);
    if (error) return bad(res, error);
    const logonUid = res.locals.logonUid as string | undefined; // set by the logons when the body asks for a user linked to the login that is signed in (`linkLogon`); never taken from the body
    const made = await store.create({ ...JigsawUsers.stored(body as { username: string; name: string; language?: string }, now()), ...(logonUid ? { firebaseUids: [logonUid] } : {}) });
    if (!made) return bad(res, "That alias is taken: choose another.", 409);
    res.status(201).json(JigsawUsers.ownerView(made)); // the person who made the user gets it back (never the verified accounts)
  });

  router.get("/by-username/:username", async (req, res) => {
    const error = JigsawUsers.usernameError(req.params.username);
    if (error) return bad(res, error);
    const user = await store.findByUsername(JigsawUsers.normalised(req.params.username));
    if (!user) return bad(res, "No such account.", 404);
    res.json(JigsawUsers.publicOf(user));
  });

  router.get("/:id", async (req, res) => {
    const user = await accountOf(req, res);
    if (user) res.json(JigsawUsers.publicOf(user));
  });

  router.put("/:id", async (req, res) => {
    const idError = JigsawUsers.idError(req.params.id);
    if (idError) return bad(res, idError);
    const read = JigsawUsers.change(req.body);
    if ("error" in read) return bad(res, read.error);
    const { picture, ...rest } = read.change;
    let pictureAt: number | null | undefined;
    if (picture !== undefined) {
      if (!(await store.get(req.params.id))) return bad(res, "No such account.", 404);
      if (picture === null) await pictures.remove(req.params.id);
      else {
        const bytes = Buffer.from(picture.slice(picture.indexOf(",") + 1), "base64"); // a picture that `JigsawUsers.pictureError` allowed
        if (pictureType(bytes) !== "image/jpeg") return bad(res, "The picture must be a small JPEG.");
        await pictures.put(req.params.id, bytes, "image/jpeg");
      }
      pictureAt = picture === null ? null : now();
    }
    const user = await store.update(req.params.id, { ...rest, ...(pictureAt !== undefined ? { pictureAt } : {}) });
    if (user === "taken") return bad(res, "That alias is taken: choose another.", 409);
    if (!user) return bad(res, "No such account.", 404);
    res.json(JigsawUsers.publicOf(user)); // the e-mail address is private: it is not given back
  });

  // GET /:id/picture: the picture of the account as an image (open, like the name: it is in lists); the page asks with `?v=` the time it was set, so it is kept a long time
  router.get("/:id/picture", async (req, res) => {
    const user = JigsawUsers.idError(req.params.id) ? null : await store.get(req.params.id);
    const picture = user?.pictureAt ? await pictures.get(req.params.id) : null;
    if (!picture) return bad(res, "No picture.", 404);
    res.set({ "Content-Type": picture.mime, "Cache-Control": "public, max-age=86400", ETag: picture.etag }).send(picture.data);
  });

  // POST /:id/used: the account was chosen to play as (the gate has seen that the login may); written at most once a minute
  router.post("/:id/used", async (req, res) => {
    const user = await accountOf(req, res);
    if (!user) return;
    const at = now();
    if (at - (user.lastUsedAt ?? 0) >= JigsawUsers.USED_KEEP_MS) await store.update(user.id, { lastUsedAt: at });
    res.status(204).end();
  });

  // DELETE /:id: a user with nothing attached (see `JigsawUsers.removeError`); the gate has already seen that the login is one of its logins when it has any
  router.delete("/:id", async (req, res) => {
    const user = await accountOf(req, res);
    if (!user) return;
    const attached = use ? await use.count(user.id) : { jigsaws: 0, rounds: 0 };
    // an admin deleting the account of another is not one of its logins and cannot take them away: the logins do not count then; the last admin is not deleted
    const me = askerOf(req);
    const byAdmin = !!levels && me !== user.id && UserLevels.isAdmin(await levels.of(me));
    const why = JigsawUsers.removeError({ ...attached, logins: byAdmin ? 0 : JigsawUsers.logonsOf(user).length });
    if (why) return bad(res, why, 409);
    if (levels && UserLevels.isAdmin(UserLevels.of(user)) && !UserLevels.otherAdmins(await store.list(), user.id)) return bad(res, UserLevels.changeError("admin", "user", 0), 409);
    await use?.clearFresh(user.id);
    await pictures.remove(user.id);
    await store.remove(user.id);
    levels?.forget(user.id);
    res.status(204).end();
  });

  return router;
}

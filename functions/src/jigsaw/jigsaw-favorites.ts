import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { JIGSAW_FAVORITES, JigsawFavorites } from "../models";

// The favorites of the users: `/jigsaw-favorites`. Whose favorites they are is said by the header `X-Jigsaw-User` (the UID of the user who plays; there is no sign-in yet, so this
// keeps the app honest, it is not a lock). GET / gives the ids of the jigsaws the user has as favorites; PUT /:jigsawId makes one a favorite and DELETE /:jigsawId takes it away.

/** Where the favorites are kept (Firestore in the app, a small fake in the tests). */
export interface FavoriteStore {
  /** the ids of the jigsaws the user has as favorites */
  list(userId: string): Promise<string[]>;
  add(userId: string, jigsawId: string, at: number): Promise<void>;
  remove(userId: string, jigsawId: string): Promise<void>;
  /** the favorites of a jigsaw that is deleted go with it, for every user */
  removeAllOf(jigsawId: string): Promise<void>;
}

/** The favorites in the Firestore collection `jigsaw-favorites`. */
export function firestoreFavoriteStore(): FavoriteStore {
  const collection = () => getFirestore().collection(JIGSAW_FAVORITES);
  return {
    async list(userId) {
      const snap = await collection().where("userId", "==", userId).select("jigsawId").get();
      return snap.docs.map((d) => (d.data() as { jigsawId: string }).jigsawId);
    },
    async add(userId, jigsawId, at) {
      await collection().doc(JigsawFavorites.idOf(userId, jigsawId)).set(JigsawFavorites.stored(userId, jigsawId, at));
    },
    async remove(userId, jigsawId) {
      await collection().doc(JigsawFavorites.idOf(userId, jigsawId)).delete();
    },
    async removeAllOf(jigsawId) {
      const snap = await collection().where("jigsawId", "==", jigsawId).select().get();
      await Promise.all(snap.docs.map((d) => d.ref.delete()));
    },
  };
}

/** What the routes need to know from the app: that the user exists, and whether the person may see the jigsaw (it is there, and not private to somebody else). */
export interface FavoriteDeps {
  userExists(userId: string): Promise<boolean>;
  mayFavor(jigsawId: string, userId: string): Promise<boolean>;
  now: () => number;
}

export function jigsawFavoritesRouter(store: FavoriteStore, deps: FavoriteDeps): express.Router {
  const router = express.Router();
  const bad = (res: express.Response, error: string, status = 400) => void res.status(status).json({ error });

  /** who asks, when it is a user that exists */
  const userOf = async (req: express.Request, res: express.Response): Promise<string | null> => {
    const userId = req.get("X-Jigsaw-User");
    const error = JigsawFavorites.error(userId, "x"); // only the user is looked at here
    if (error) {
      bad(res, error, 401);
      return null;
    }
    if (!(await deps.userExists(userId as string))) {
      bad(res, "No such account: choose an account first.", 404);
      return null;
    }
    return userId as string;
  };

  router.get("/", async (req, res) => {
    const userId = await userOf(req, res);
    if (userId) res.json({ ids: await store.list(userId) });
  });

  router.put("/:jigsawId", async (req, res) => {
    const userId = await userOf(req, res);
    if (!userId) return;
    const wrong = JigsawFavorites.error(userId, req.params.jigsawId);
    if (wrong) return bad(res, wrong);
    if (!(await deps.mayFavor(req.params.jigsawId, userId))) return bad(res, "No such jigsaw.", 404);
    await store.add(userId, req.params.jigsawId, deps.now());
    res.status(204).end();
  });

  router.delete("/:jigsawId", async (req, res) => {
    const userId = await userOf(req, res);
    if (!userId) return;
    const wrong = JigsawFavorites.error(userId, req.params.jigsawId);
    if (wrong) return bad(res, wrong);
    await store.remove(userId, req.params.jigsawId); // taking away what is not there is fine
    res.status(204).end();
  });

  return router;
}

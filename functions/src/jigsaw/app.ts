import cors from "cors";
import express from "express";
import { JigsawStore, jigsawListRouter, firestoreJigsawStore } from "../common/jigsaw-list";
import { JigsawSearchStore, firestoreJigsawSearch, jigsawSearchRouter } from "./jigsaw-search";
import { FavoriteStore, firestoreFavoriteStore, jigsawFavoritesRouter } from "./jigsaw-favorites";
import { Classifier, configuredClassifier } from "./classifier";
import { jigsawClassifyRouter } from "./jigsaw-classify";
import { TokenUsageStore, firestoreTokenUsageStore, tokenUsageRouter } from "./token-usage";
import { ALLOWED_ORIGINS } from "../common/cors";
import { ImageStore, firestoreJigsawExists, jigsawImageRouter, storageImageStore } from "./jigsaw-image";
import { PieceStore, firestorePieceStore, jigsawPiecesRouter } from "./jigsaw-pieces";
import { JigsawSettings, JigsawVisibilities, JIGSAW, JigsawUsers, Popularity } from "../models";
import { UserStore, firestoreUserStore, jigsawUsersRouter } from "./jigsaw-users";
import { PlayStore, firestorePlayStore, playsRouter, userPlaysRouter } from "./plays";

/** The address the API of Karins jigsaw answers on (Hosting forwards the full path to the function). */
export const JIGSAW_API = "/jigsaw/api";

/** The Express app behind the `jigsawApi` Cloud Function (also used directly by the tests): the jigsaws, their pieces and pictures, the users and their plays. */
export function createJigsawApp(stores: { jigsaw?: JigsawStore; jigsawImages?: ImageStore; jigsawPieces?: PieceStore; jigsawSearch?: JigsawSearchStore; favorites?: FavoriteStore; classifier?: Classifier; tokenUsage?: TokenUsageStore; jigsawExists?: (id: string) => Promise<boolean>; plays?: PlayStore; users?: UserStore; now?: () => number } = {}): express.Express {
  const app = express();
  app.use(cors({ origin: ALLOWED_ORIGINS }));
  // the pieces of a jigsaw come with their graphics: that route reads its own, bigger body
  const json = express.json({ limit: "600kb" });
  app.use((req, res, next) => (req.path.startsWith(`${JIGSAW_API}/jigsaw-pieces/`) ? next() : json(req, res, next)));

  const router = express.Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "jigsaw" });
  });
  // a jigsaw: its settings are a document in Firestore; its pieces are documents under it, and its picture and the graphics of its pieces are files in
  // Storage. A jigsaw that is deleted takes all of that with it.
  const jigsaw = stores.jigsaw ?? firestoreJigsawStore(JIGSAW);
  const pieces = stores.jigsawPieces ?? firestorePieceStore();
  const jigsawExists = stores.jigsawExists ?? firestoreJigsawExists;
  const plays = stores.plays ?? firestorePlayStore();
  const images = stores.jigsawImages ?? storageImageStore();
  // one jigsaw by its id: read by itself (the list is only the newest), so an old jigsaw is found too
  const jigsawById = async (id: string) => (jigsaw.get ? jigsaw.get(id) : ((await jigsaw.list()).find((c) => c.id === id) ?? null));
  // the plays of a jigsaw: one game each, by one user; a play chooses only the difficulty and the look, never the size, the picture or the pieces
  const users = stores.users ?? firestoreUserStore();
  // the games of a user over all the jigsaws (before the users, whose own routes would take the address first)
  router.use("/jigsaw-users/:id/plays", userPlaysRouter(plays, { jigsaws: () => jigsaw.list(), userOf: async (userId) => (await users.get(userId)) ?? null }));
  // what the AI has used for a user, kept under the user (written by the classification, read here)
  const tokenUsage = stores.tokenUsage ?? firestoreTokenUsageStore();
  router.use("/jigsaw-users/:id/token-usage", tokenUsageRouter(tokenUsage));
  router.use("/jigsaw-users", jigsawUsersRouter(users));
  // A jigsaw only its owner sees (`visibility: "owner"`) is seen by its owner and by the players who have a round on it (they keep what they started); nobody else sees it,
  // its rounds either. A player who is not the owner cannot start another round of it. (The header `X-Jigsaw-User` is the UID of who asks.)
  const isOwnerOf = (c: { ownerUid?: string }, me: string | undefined) => !!me && c.ownerUid === me;
  const hasRoundOn = async (c: { id: string }, me: string | undefined) => !!me && (await plays.list(c.id, me)).length > 0;
  const canSee = async (c: { id: string; visibility?: string; ownerUid?: string }, me: string | undefined) => !JigsawVisibilities.restricted(c.visibility) || isOwnerOf(c, me) || (await hasRoundOn(c, me));
  router.use("/jigsaw/:id/plays", async (req, res, next) => {
    const c = await jigsawById(req.params.id);
    if (!c || !JigsawVisibilities.restricted(c.visibility)) return next();
    const me = req.get("X-Jigsaw-User");
    if (!(await canSee(c, me))) return void res.status(404).json({ error: "No such jigsaw." });
    if (req.method === "POST" && !isOwnerOf(c, me)) return void res.status(403).json({ error: "Only its owner can start a round of a jigsaw only they see: you can go on with the round you have." });
    next();
  });
  router.use("/jigsaw/:id/plays", playsRouter(plays, { jigsaw: jigsawById, pieces, userOf: async (userId) => (await users.get(userId)) ?? null }));
  // the owner of a jigsaw is a user that exists (chosen from the users); the author of the jigsaw is then that user's name, put there here, not taken from the request
  const stampOwner: express.RequestHandler = async (req, res, next) => {
    const body = (req.body ?? {}) as { ownerUid?: unknown; author?: unknown };
    if (body.ownerUid === undefined) return next();
    const user = typeof body.ownerUid === "string" && !JigsawUsers.idError(body.ownerUid) ? await users.get(body.ownerUid) : null;
    if (!user) return void res.status(400).json({ error: "The owner must be a user that exists: choose the author from the users." });
    body.author = user.name;
    next();
  };
  // Who may change a jigsaw, said once and used by every route that changes it (the header `X-Jigsaw-User` is the UID of who asks; there is no sign-in yet, so this keeps the
  // app honest, it is not a lock):
  //  - only its owner changes or deletes a jigsaw; one from before owners has none, and is anybody's;
  //  - once somebody has started a round of it, nobody (the owner too) changes what every round shares: its size, pieces, picture, difficulty and clock.
  const ownerOnly = (what: string): express.RequestHandler => async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now?.ownerUid && req.get("X-Jigsaw-User") !== now.ownerUid) return void res.status(403).json({ error: `Only the owner of a jigsaw can ${what} it.` });
    next();
  };
  const notWhenPlayed: express.RequestHandler = async (req, res, next) => {
    if (await plays.has(req.params.id)) return void res.status(409).json({ error: JigsawSettings.PLAYED_MESSAGE });
    next();
  };
  // the popular jigsaws, for the front page: the ones the person may see, ranked by the rounds played and by being new (`Popularity`); before the routes of one jigsaw
  router.get("/jigsaw-popular", async (req, res) => {
    const me = req.get("X-Jigsaw-User");
    const all = await jigsaw.list();
    const seen = await Promise.all(all.map((j) => canSee(j, me)));
    const visible = all.filter((j, i) => seen[i] && JigsawVisibilities.listed(j.visibility)); // a hidden jigsaw is not among the popular
    const counted = await Promise.all(visible.map(async (j) => ({ jigsaw: j, rounds: await plays.count(j.id) })));
    res.json(Popularity.rank(counted, (stores.now ?? Date.now)()));
  });
  // the favorites of the users: a jigsaw ticked with a heart, one document for each user and jigsaw in `jigsaw-favorites`; they go with a jigsaw that is deleted
  const favorites = stores.favorites ?? firestoreFavoriteStore();
  // looking for jigsaws by category, size, difficulty, language, owner and words, and the counts of each choice: over the newest jigsaws and up to 500 of each owner's, read at the same time
  // and kept for a few seconds (before the routes of one jigsaw); the owners are the users
  const search = stores.jigsawSearch ?? firestoreJigsawSearch(JIGSAW);
  router.use(
    "/jigsaw-favorites",
    jigsawFavoritesRouter(favorites, {
      userExists: async (userId) => !!(await users.get(userId)),
      mayFavor: async (id, userId) => {
        const c = await jigsawById(id);
        return !!c && (await canSee(c, userId));
      },
      now: stores.now ?? Date.now,
    }),
  );
  // the jigsaws among these that the user has solved (a round of theirs is solved): one question for each jigsaw, a few at a time, since a play belongs to a jigsaw
  const solvedBy = async (userId: string, among: readonly { id: string }[]): Promise<string[]> => {
    const found: string[] = [];
    for (let i = 0; i < among.length; i += 25) {
      const batch = among.slice(i, i + 25);
      const rounds = await Promise.all(batch.map((j) => plays.list(j.id, userId).catch(() => [])));
      batch.forEach((j, n) => rounds[n].some((p) => p.status === "solved") && found.push(j.id));
    }
    return found;
  };
  router.use("/jigsaw-search", jigsawSearchRouter(search, (c, me) => canSee(c, me), async () => (await users.list()).map((u) => u.id), (userId) => favorites.list(userId), (userId, among) => solvedBy(userId, among)));
  // the AI classification of one jigsaw by its picture (categories, name and description); its settings are read when it is asked for (before the routes of one jigsaw)
  router.use(
    "/jigsaw/:id/classify",
    jigsawClassifyRouter({
      classifier: stores.classifier ?? configuredClassifier(),
      jigsawById,
      pictureOf: (id) => images.get(id),
      update: async (id, input) => (search.forget(), jigsaw.update(id, input)),
      keepUsage: (userId, usage) => tokenUsage.add(userId, usage),
      now: stores.now,
    }),
  );
  router.delete("/jigsaw/:id", ownerOnly("delete"));
  // the owner takes away all the rounds of a jigsaw (also other players'), so its picture, size, pieces and difficulty can be changed again
  router.delete("/jigsaw/:id/plays", ownerOnly("take away the rounds of"), async (req, res) => {
    if (!(await jigsawById(req.params.id))) return void res.status(404).json({ error: "No such jigsaw." });
    await plays.removeAll(req.params.id);
    res.status(204).end();
  });
  router.post("/jigsaw", stampOwner);
  router.put("/jigsaw/:id", stampOwner);
  // a jigsaw only its owner sees can be changed by its owner only (for anyone else it is not there)
  router.put("/jigsaw/:id", async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now && JigsawVisibilities.restricted(now.visibility) && req.get("X-Jigsaw-User") !== now.ownerUid) return void res.status(404).json({ error: "No such jigsaw." });
    next();
  });
  router.put("/jigsaw/:id", ownerOnly("change"));
  // a jigsaw that has been played keeps what every round shares (see `JigsawSettings.changesWhatPlayersShare`): a change of it is refused
  router.put("/jigsaw/:id", async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (!now) return next();
    if (!(await plays.has(req.params.id))) {
      await plays.removeFresh(req.params.id); // not played: the rounds that are only opened go, their pieces would be out of date after the change
      return next();
    }
    if (JigsawSettings.changesWhatPlayersShare(now, (req.body ?? {}) as Record<string, unknown>)) return void res.status(409).json({ error: JigsawSettings.PLAYED_MESSAGE });
    next();
  });
  // nor can its picture or its cut into pieces be put in again, taken away or moved once it has been played (the pieces of every round are the ones it has); a jigsaw that
  // is not played can have them put in by whoever is making it (a jigsaw can be made for another user, who is then its owner)
  router.put(["/jigsaw-image/:id", "/jigsaw-pieces/:id"], notWhenPlayed);
  router.delete(["/jigsaw-image/:id", "/jigsaw-pieces/:id"], ownerOnly("change"), notWhenPlayed);
  router.patch("/jigsaw-pieces/:id", ownerOnly("change"), notWhenPlayed);
  router.use(
    "/jigsaw",
    jigsawListRouter(
      {
        // what the search has read is forgotten when a jigsaw is made, changed or deleted, so the next question sees it
        add: async (input) => (search.forget(), jigsaw.add(input)),
        update: async (id, input) => (search.forget(), jigsaw.update(id, input)),
        list: () => jigsaw.list(),
        remove: async (id) => (search.forget(), (await jigsaw.remove(id)) && (await Promise.all([pieces.removeAll(id), plays.removeAll(id), favorites.removeAllOf(id)]).then(() => true, () => true))),
      },
      (c, me) => canSee(c, me),
    ),
  );
  router.use("/jigsaw-image", jigsawImageRouter(images, jigsawExists));
  router.use("/jigsaw-pieces", jigsawPiecesRouter(pieces, jigsawExists));
  app.use(JIGSAW_API, router);
  return app;
}

import cors from "cors";
import express from "express";
import { JigsawStore, jigsawHeads, jigsawListRouter, firestoreJigsawStore } from "../common/jigsaw-list";
import { JigsawSearchStore, firestoreJigsawSearch, jigsawSearchRouter } from "./jigsaw-search";
import { FavoriteStore, firestoreFavoriteStore, jigsawFavoritesRouter } from "./jigsaw-favorites";
import { BoughtStore, boughtPackages, boughtRouter, firestoreBoughtStore } from "./jigsaw-bought";
import { FeedStore, PackagePictures, feedManageRouter, firestoreFeedStore, firestorePackagePictures, jigsawFeedRouter } from "./jigsaw-feed";
import { Translator, configuredTranslator } from "./translator";
import { Classifier, configuredClassifier } from "./classifier";
import { jigsawClassifyRouter } from "./jigsaw-classify";
import { TokenUsageStore, firestoreTokenUsageStore, tokenUsageRouter } from "./token-usage";
import { ALLOWED_ORIGINS } from "../common/cors";
import { ImageStore, JIGSAW_ROOT, firestoreJigsawExists, jigsawImageRouter, storageImageStore } from "./jigsaw-image";
import { PieceStore, firestorePieceStore, jigsawPiecesRouter } from "./jigsaw-pieces";
import { AccountLimits, BoughtPackages, PackageItem, JIGSAW_INFO, JIGSAW_OFFERS, JIGSAW_PACKAGES, FeedItems, JigsawKinds, JigsawSettings, JigsawSpec, JigsawVisibilities, JIGSAW, JigsawUsers, Popularity, UserLevels } from "../models";
import { ImageAccess } from "./image-access";
import { roundsListRouter } from "./rounds-list";
import { SecretSource, ViewKeys, firestoreSecret } from "./view-key";
import { UserStore, firestoreUserStore, jigsawUsersRouter } from "./jigsaw-users";
import { LogonDeps, createLogons } from "../logons";
import { PlayStore, firestorePlayStore, playsRouter, userPlaysRouter } from "./plays";
import { Levels, intoAccount, userLevelRouter, userLevels } from "./user-levels";

/** The address the API of Karins jigsaw answers on (Hosting forwards the full path to the function). */
export const JIGSAW_API = "/jigsaw/api";

/** The Express app behind the `jigsawApi` Cloud Function (also used directly by the tests): the jigsaws, their pieces and pictures, the users and their plays. */
export function createJigsawApp(stores: { jigsaw?: JigsawStore; jigsawImages?: ImageStore; accountPictures?: ImageStore; jigsawPieces?: PieceStore; jigsawSearch?: JigsawSearchStore; favorites?: FavoriteStore; feedInfo?: FeedStore; feedOffers?: FeedStore; feedPackages?: FeedStore; packagePictures?: PackagePictures; bought?: BoughtStore; translator?: Translator; classifier?: Classifier; tokenUsage?: TokenUsageStore; jigsawExists?: (id: string) => Promise<boolean>; plays?: PlayStore; users?: UserStore; logons?: LogonDeps; viewKeySecret?: SecretSource; levels?: Levels; now?: () => number; random?: () => number } = {}): express.Express {
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
  // the newest jigsaws without what is placed on their boards: for lists that only name, count or rank them
  const heads = () => jigsawHeads(jigsaw);
  // one jigsaw by its id: read by itself (the list is only the newest), so an old jigsaw is found too
  const jigsawById = async (id: string) => (jigsaw.get ? jigsaw.get(id) : ((await jigsaw.list()).find((c) => c.id === id) ?? null));
  // the plays of a jigsaw: one game each, by one user; a play chooses only the difficulty and the look, never the size, the picture or the pieces
  const users = stores.users ?? firestoreUserStore();
  // a jigsaw user that has verified Firebase accounts is used only by somebody signed in with one of them: the gate looks at the token that comes with every call, and the user the call acts as decides
  // whether it is needed (`functions/src/logons/`); a user with none is used as before
  const logons = createLogons(users, { ...stores.logons, now: stores.now });
  router.use(logons.gate);
  router.use(intoAccount); // an admin who is in an account has the rights of an admin for the call (see `intoAccount`)
  // the level of an account (user, publisher, admin): what it may do beyond playing; it counts only for an account that needs a login, which the gate has checked (`UserLevels.of`)
  const levels = stores.levels ?? userLevels(users, stores.now);
  const isAdmin = async (me: string | undefined) => UserLevels.isAdmin(await levels.of(me));
  router.use("/jigsaw-levels", userLevelRouter(users, levels, logons.forget));
  // the games of a user over all the jigsaws (before the users, whose own routes would take the address first)
  router.use("/jigsaw-users/:id/plays", userPlaysRouter(plays, { jigsaws: () => heads(), userOf: async (userId) => (await users.get(userId)) ?? null, imageKeyFor: (c, me) => keyIfSeen(c, me) }));
  // what the AI has used for a user, kept under the user (written by the classification, read here)
  const tokenUsage = stores.tokenUsage ?? firestoreTokenUsageStore();
  router.use("/jigsaw-users/:id/token-usage", tokenUsageRouter(tokenUsage));
  router.use("/jigsaw-users/:id/bought-packages", (req, res, next) => packagesOfAccount(req, res, next));
  router.use("/jigsaw-users/:id/logons", logons.link); // the logins of one user: add, take away, link codes
  router.get("/jigsaw-users", logons.sweepList);
  router.post("/jigsaw-users", logons.attachLogon);
  router.use("/jigsaw-users", jigsawUsersRouter(users, stores.accountPictures ?? storageImageStore(`${JIGSAW_ROOT}/accounts`), {
    // what is attached to a user: the jigsaws it owns and the rounds it has played (a round nobody moved a piece in does not count)
    async count(userId) {
      const [owned, rounds] = await Promise.all([search.load([userId], 1), plays.listOfUser(userId)]); // asked at the same time
      return { jigsaws: owned.filter((j) => j.ownerUid === userId).length, rounds: rounds.filter((r) => !r.play.fresh).length };
    },
    async clearFresh(userId) {
      await Promise.all((await plays.listOfUser(userId)).map((r) => plays.remove(r.jigsawId, r.play.id)));
    },
  }, stores.now, levels));
  // the packages of the home page, and what each account has got or bought of them (`jigsaw-users/<id>/bought-packages`): the pictures of a package are for those who have it
  const feedPackages = stores.feedPackages ?? firestoreFeedStore(JIGSAW_PACKAGES, "package");
  const bought = boughtPackages(stores.bought ?? firestoreBoughtStore(), stores.now ?? Date.now);
  /** whether the account has this picture as far as packages go (a picture of a package: its owner, an account that has the package, and an admin) */
  const hasPicture = async (c: { packageId?: string; ownerUid?: string }, me: string | undefined) => !c.packageId || BoughtPackages.mayUse(c, me, await bought.ids(me)) || (await isAdmin(me));
  /** the package of this id as the home page has it, when this account may get it now */
  const packageFor = async (packageId: string, me: string): Promise<PackageItem | null> => {
    const found = await (feedPackages.get ? feedPackages.get(packageId) : feedPackages.list().then((all) => all.find((p) => p.id === packageId) ?? null));
    return (FeedItems.shown(found ? [found as unknown as Record<string, unknown>] : [], (stores.now ?? Date.now)(), me)[0] as PackageItem | undefined) ?? null;
  };
  const packagesOfAccount = boughtRouter({ bought, packageFor, accountOf: async (userId) => (await users.get(userId)) ?? null, isAdmin: (me) => isAdmin(me), now: stores.now ?? Date.now });
  // A jigsaw only its owner sees (`visibility: "owner"`) is seen by its owner and by the players who have a round on it (they keep what they started); nobody else sees it,
  // its rounds either. A player who is not the owner cannot start another round of it. (The header `X-Jigsaw-User` is the UID of who asks.)
  const isOwnerOf = (c: { ownerUid?: string }, me: string | undefined) => !!me && c.ownerUid === me;
  const hasRoundOn = async (c: { id: string }, me: string | undefined) => !!me && (await plays.list(c.id, me)).length > 0;
  // an admin sees all pictures: also the private ones of others (a hidden one is never in a list, but is opened by its address
  const canSee = async (c: { id: string; visibility?: string; ownerUid?: string; packageId?: string }, me: string | undefined) =>
    (await hasPicture(c, me)) && (!JigsawVisibilities.restricted(c.visibility) || isOwnerOf(c, me) || (await isAdmin(me)) || (await hasRoundOn(c, me)));
  // the pictures of a jigsaw that is private or hidden are read with a key that the answers about it give to those who may see it (`ImageAccess`): the key is made at each answer and never kept
  const imageAccess = new ImageAccess(new ViewKeys(stores.viewKeySecret ?? firestoreSecret(), stores.now), async (id) => (await jigsawById(id))?.visibility);
  // what the front page, the search and the popular ones show: a private jigsaw is found by its owner and by each player who has a round on it, and only by them (an admin may open it, but finds it only if it is theirs)
  const canFind = async (c: { id: string; ownerUid?: string }, me: string | undefined) => isOwnerOf(c, me) || (await hasRoundOn(c, me));
  const keyIfSeen = async (c: JigsawSpec, me: string | undefined): Promise<string | undefined> => (JigsawVisibilities.restricted(c.visibility) && (await canSee(c, me)) ? (await imageAccess.keyed(c)).imageKey : undefined);
  router.use("/jigsaw/:id/plays", async (req, res, next) => {
    const c = await jigsawById(req.params.id);
    if (!c || (!JigsawVisibilities.restricted(c.visibility) && !c.packageId)) return next();
    const me = req.get("X-Jigsaw-User");
    if (!(await canSee(c, me))) return void res.status(404).json({ error: "No such jigsaw." });
    if (JigsawVisibilities.restricted(c.visibility) && req.method === "POST" && !isOwnerOf(c, me) && !(await isAdmin(me))) return void res.status(403).json({ error: "Only its owner can start a round of a jigsaw only they see: you can go on with the round you have." });
    next();
  });
  router.use("/jigsaw/:id/plays", logons.identify, playsRouter(plays, { jigsaw: jigsawById, pieces, userOf: async (userId) => (await users.get(userId)) ?? null, mayManage: isAdmin, random: stores.random }));
  // the owner of a jigsaw is a user that exists (chosen from the users); the author of the jigsaw is then that user's name, put there here, not taken from the request
  const stampOwner: express.RequestHandler = async (req, res, next) => {
    const body = (req.body ?? {}) as { ownerUid?: unknown; author?: unknown };
    if (body.ownerUid === undefined) return next();
    const user = typeof body.ownerUid === "string" && !JigsawUsers.idError(body.ownerUid) ? await users.get(body.ownerUid) : null;
    if (!user) return void res.status(400).json({ error: "The owner must be an account that exists: choose the author from the accounts." });
    body.author = user.name;
    next();
  };
  // Who may change a jigsaw, said once and used by every route that changes it (the header `X-Jigsaw-User` is the UID of who asks; there is no sign-in yet, so this keeps the
  // app honest, it is not a lock):
  //  - only its owner (or an admin) changes or deletes a jigsaw; one from before owners has none, and is anybody's;
  //  - only a publisher (or an admin) makes a jigsaw public: an account makes private or hidden ones (`UserLevels.publishError`);
  //  - once somebody has started a round of it, nobody (the owner too) changes what every round shares: its size, pieces, picture, difficulty and clock.
  const ownerOnly = (what: string): express.RequestHandler => async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now?.ownerUid && req.get("X-Jigsaw-User") !== now.ownerUid && !(await isAdmin(req.get("X-Jigsaw-User")))) return void res.status(403).json({ error: `Only the owner of a jigsaw can ${what} it.` });
    next();
  };
  const notWhenPlayed: express.RequestHandler = async (req, res, next) => {
    if (await plays.has(req.params.id)) return void res.status(409).json({ error: JigsawSettings.PLAYED_MESSAGE });
    next();
  };
  // the rounds that the users have played (the person's own too), on the jigsaws the person may see (the button "Rounds" on the front page); before the routes of one jigsaw
  router.use("/jigsaw-rounds", roundsListRouter(plays, { jigsaws: () => heads(), canSee: (c, me) => canSee(c, me), imageKeyFor: (c, me) => keyIfSeen(c, me), now: stores.now }));
  // the popular jigsaws, for the front page: the ones the person may see, ranked by the rounds played and by being new (`Popularity`); before the routes of one jigsaw
  router.get("/jigsaw-popular", async (req, res) => {
    const all = await heads();
    const me = req.get("X-Jigsaw-User");
    const seen = await Promise.all(all.map(async (j) => (!j.packageId || BoughtPackages.mayUse(j, me, await bought.ids(me))) && (j.visibility === "owner" ? await canFind(j, me) : JigsawVisibilities.listed(j.visibility)))); // public ones, and a private one for its owner and its players; a hidden one never
    const visible = all.filter((_, i) => seen[i]);
    const counted = await Promise.all(visible.map(async (j) => ({ jigsaw: j, rounds: await plays.count(j.id) })));
    res.json(await Promise.all(Popularity.rank(counted, (stores.now ?? Date.now)()).map(imageAccess.keyed)));
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
    const solved = new Set((await plays.listOfUser(userId)).filter((r) => r.play.status === "solved").map((r) => r.jigsawId));
    return among.filter((j) => solved.has(j.id)).map((j) => j.id);
  };
  // the tiles of the home page that are not pictures: information and offers each have a collection and routes of their own (a publisher or an admin writes them; the AI makes the words of the other
  // languages when one is saved), the packages are made up for now, and `GET /jigsaw-feed` gives the ones to show (see `jigsaw-feed.ts`)
  const feedInfo = stores.feedInfo ?? firestoreFeedStore(JIGSAW_INFO, "info");
  const feedOffers = stores.feedOffers ?? firestoreFeedStore(JIGSAW_OFFERS, "offer");
  const feedDeps = { levels, translator: stores.translator ?? configuredTranslator(), keepUsage: (userId: string, usage: Parameters<typeof tokenUsage.add>[1]) => tokenUsage.add(userId, usage), now: stores.now ?? Date.now };
  const packagePictures = stores.packagePictures ?? firestorePackagePictures();
  router.use("/jigsaw-info", feedManageRouter("info", feedInfo, feedDeps));
  router.use("/jigsaw-offers", feedManageRouter("offer", feedOffers, feedDeps));
  router.use("/jigsaw-packages", feedManageRouter("package", feedPackages, feedDeps, packagePictures));
  router.use("/jigsaw-feed", jigsawFeedRouter([() => feedInfo.list(), () => feedOffers.list(), () => feedPackages.list()], stores.now ?? Date.now, packagePictures, stores.random, {
    ids: (me) => bought.ids(me),
    find: (id) => (feedPackages.get ? feedPackages.get(id) : feedPackages.list().then((all) => all.find((p) => p.id === id) ?? null)),
    isAdmin: (me) => isAdmin(me),
  }));
  router.use("/jigsaw-search", jigsawSearchRouter(search, (c, me) => canFind(c, me), () => (users.ids ? users.ids() : users.list().then((all) => all.map((u) => u.id))), (userId) => favorites.list(userId), (userId, among) => solvedBy(userId, among), imageAccess.keyed, (userId) => bought.ids(userId)));
  // the AI classification of one jigsaw by its picture (categories, name and description); its settings are read when it is asked for (before the routes of one jigsaw)
  router.use(
    "/jigsaw/:id/classify",
    jigsawClassifyRouter({
      classifier: stores.classifier ?? configuredClassifier(),
      jigsawById,
      pictureOf: (id) => images.get(id),
      update: async (id, input) => (search.forget(), imageAccess.forget(), jigsaw.update(id, input)),
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
  // a jigsaw is made public by a publisher or an admin only; one that is public already can stay so (its owner may still change its name); asked after the owner check, so it says nothing about a jigsaw the person may not see
  const publishing: express.RequestHandler = async (req, res, next) => {
    const was = req.method === "PUT" ? await jigsawById(req.params.id) : null;
    if (req.method === "PUT" && !was) return next(); // no such jigsaw: the route says so
    const error = UserLevels.publishError(await levels.of(req.get("X-Jigsaw-User")), (req.body as { visibility?: unknown } | undefined)?.visibility, was);
    if (error) return void res.status(403).json({ error });
    next();
  };
  // a picture that belongs to a package says which (`packageId`): the package has to be there, and the one who makes the picture has to be the one who may change the package (its owner, or an admin)
  const inPackage: express.RequestHandler = async (req, res, next) => {
    const id = (req.body as { packageId?: unknown } | undefined)?.packageId;
    if (id === undefined || id === null || id === "") return next();
    const me = req.get("X-Jigsaw-User");
    const pack = typeof id === "string" ? await (feedPackages.get ? feedPackages.get(id) : feedPackages.list().then((all) => all.find((p) => p.id === id) ?? null)) : null;
    if (!pack) return void res.status(400).json({ error: "That package does not exist." });
    if (!FeedItems.mayChange(pack, me, await isAdmin(me))) return void res.status(403).json({ error: "Only the owner of a package can put pictures in it." });
    next();
  };
  // an account that is not verified has only a few uploaded pictures (`AccountLimits`): a new one for it is refused when it is full, and so is giving it one that was another's (an admin is not stopped)
  const pictureLimit: express.RequestHandler = async (req, res, next) => {
    const me = req.get("X-Jigsaw-User");
    if (await isAdmin(me)) return next();
    const given = (req.body as { ownerUid?: unknown } | undefined)?.ownerUid;
    const owner = typeof given === "string" ? given : req.method === "POST" ? me : undefined;
    if (!owner || (req.method === "PUT" && (await jigsawById(req.params.id))?.ownerUid === owner)) return next();
    const account = await users.get(owner);
    if (!account || AccountLimits.verified(account)) return next();
    const has = jigsaw.countOwned ? await jigsaw.countOwned(owner) : (await jigsaw.list()).filter((j) => j.ownerUid === owner).length;
    const error = AccountLimits.pictureError(account, has);
    if (error) return void res.status(403).json({ error });
    next();
  };
  router.post("/jigsaw", publishing, stampOwner, inPackage, pictureLimit);
  router.put("/jigsaw/:id", stampOwner, inPackage);
  // a jigsaw only its owner sees can be changed by its owner only (for anyone else it is not there)
  router.put("/jigsaw/:id", async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now && JigsawVisibilities.restricted(now.visibility) && req.get("X-Jigsaw-User") !== now.ownerUid && !(await isAdmin(req.get("X-Jigsaw-User")))) return void res.status(404).json({ error: "No such jigsaw." });
    next();
  });
  router.put("/jigsaw/:id", ownerOnly("change"), publishing, pictureLimit);
  // a picture of a package stays in it: a change replaces the whole document, and the forms do not send `packageId`, so what the picture has is put back (a change does not move it to another package)
  router.put("/jigsaw/:id", async (req, _res, next) => {
    const now = await jigsawById(req.params.id);
    if (now?.packageId) req.body = { ...(req.body as object), packageId: now.packageId };
    next();
  });
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
  // a picture is not cut: its pieces are cut in each round, so none is put in, moved or taken away for the picture itself
  const notPicture: express.RequestHandler = async (req, res, next) => {
    const now = await jigsawById(req.params.id);
    if (now && JigsawKinds.isPicture(now)) return void res.status(409).json({ error: "A picture is not cut: its rounds are." });
    next();
  };
  router.put(["/jigsaw-image/:id", "/jigsaw-pieces/:id"], notWhenPlayed);
  router.put("/jigsaw-pieces/:id", notPicture);
  router.patch("/jigsaw-pieces/:id", notPicture);
  router.delete("/jigsaw-pieces/:id", notPicture);
  router.delete(["/jigsaw-image/:id", "/jigsaw-pieces/:id"], ownerOnly("change"), notWhenPlayed);
  router.patch("/jigsaw-pieces/:id", ownerOnly("change"), notWhenPlayed);
  router.use(
    "/jigsaw",
    jigsawListRouter(
      {
        // what the search has read is forgotten when a jigsaw is made, changed or deleted, so the next question sees it
        add: async (input) => (search.forget(), imageAccess.forget(), jigsaw.add(input)),
        update: async (id, input) => {
          // a ready jigsaw that is made a picture (it can only be while nobody has played it) loses its pieces: a picture is cut in each round
          const before = JigsawKinds.isPicture(input) ? ((await jigsawById(id)) ?? undefined) : undefined;
          search.forget();
          imageAccess.forget();
          const saved = await jigsaw.update(id, input);
          if (saved && before && !JigsawKinds.isPicture(before)) await pieces.replaceAll(id, [], new Map());
          return saved;
        },
        list: () => jigsaw.list(),
        heads: () => jigsawHeads(jigsaw),
        get: jigsawById, // one jigsaw by its id (also an old one), not found in the list of all of them
        remove: async (id) => (search.forget(), imageAccess.forget(), (await jigsaw.remove(id)) && (await Promise.all([pieces.removeAll(id), plays.removeAll(id), favorites.removeAllOf(id)]).then(() => true, () => true))),
      },
      (c, me) => canSee(c, me),
      imageAccess.keyed,
      async (c, me) => (!c.packageId || BoughtPackages.mayUse(c, me, await bought.ids(me))) && (!JigsawVisibilities.restricted(c.visibility) || isOwnerOf(c, me) || (c.visibility === "owner" && (await hasRoundOn(c, me)))), // the list: public, the owner's own, and the private ones the person has a round on (an admin opens others' by their address, but does not find them here)
    ),
  );
  // a picture, or the graphic of a piece, of a jigsaw that is private or hidden is read only with its key (a jigsaw that everybody sees has none); this is before the routes that give them
  router.get(["/jigsaw-image/:id", "/jigsaw-pieces/:id/graphic/:pieceId"], imageAccess.guard);
  router.use("/jigsaw-image", jigsawImageRouter(images, jigsawExists));
  router.use("/jigsaw-pieces", jigsawPiecesRouter(pieces, jigsawExists));
  // signing in with Firebase, beside the users above (which are not changed): the account is shared with Seven Friends
  router.use("/session", logons.session);
  app.use(JIGSAW_API, router);
  return app;
}

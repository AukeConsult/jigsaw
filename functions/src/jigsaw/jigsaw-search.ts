import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { JigsawIndex, JigsawSearch, JigsawSummary, JigsawVisibilities, SEARCH_MAX_READ, SUMMARY_FIELDS } from "../models";

// Looking for jigsaws. Firestore is asked for the newest jigsaws overall (an order on one field) and for the jigsaws of each owner (one equality), all at the same time, and only for the
// fields a list needs (`select`): the pieces and the objects of a jigsaw (`placed`) are never read. What matches, the counts, the order and the pages are worked out here on those
// summaries, so a search and the counts on the Find page are over the same jigsaws, and agree. A query with an equality and an order on another field would need a composite index (not
// ours to deploy in the shared project), so an owner's jigsaws are asked for without an order: when an owner has more than `SEARCH_MAX_READ`, which ones are read is not said. A
// Firestore read is one document whatever fields it gives, so `select` keeps what is sent over the network small and the limits keep the number of reads down; what was read is kept
// for a few seconds, since the Find page asks again at every tick.

/** Where the jigsaws are looked for (Firestore in the app, a small fake in the tests). */
export interface JigsawSearchStore {
  /**
   * The summaries to look in, the newest first, each once: the newest `limit` jigsaws overall (also the ones with no owner), and up to `limit` of each of these owners. The queries are
   * made in parallel. Private ones are in it too: who may see them is for the caller.
   */
  load(owners: readonly string[], limit: number): Promise<JigsawSummary[]>;
  /** What was kept is not used again: a jigsaw was made, changed or deleted, and the next question reads them anew. */
  forget(): void;
}

type Docs = { docs: { id: string; data(): unknown }[] };
type Selectable = { limit(count: number): { select(...fields: string[]): { get(): Promise<Docs> } } };

/** The part of a Firestore collection that the search uses (the real one fits it, so a test can give a small fake). */
export interface SearchCollectionLike {
  orderBy(field: string, direction: "desc"): Selectable;
  where(field: string, op: "==", value: string): Selectable;
}

/** How long what was read is kept (milliseconds). */
const KEEP_MS = 10_000;

/** The search of a Firestore collection of jigsaws. */
export function firestoreJigsawSearch(
  collection: string,
  query: () => SearchCollectionLike = () => getFirestore().collection(collection) as unknown as SearchCollectionLike,
  now: () => number = Date.now,
): JigsawSearchStore {
  const kept = new Map<string, { at: number; found: Promise<JigsawSummary[]> }>();
  const read = async (owners: readonly string[], limit: number): Promise<JigsawSummary[]> => {
    const asks = [query().orderBy("createdAt", "desc"), ...owners.map((owner) => query().where("ownerUid", "==", owner))];
    const answers = await Promise.all(asks.map((ask) => ask.limit(limit).select(...SUMMARY_FIELDS).get())); // all at the same time
    const found = new Map<string, JigsawSummary>();
    for (const answer of answers) for (const d of answer.docs) found.set(d.id, JigsawIndex.summaryOf(d.id, (d.data() ?? {}) as Record<string, unknown>));
    return [...found.values()].sort((a, b) => b.createdAt - a.createdAt);
  };
  return {
    load(owners, limit) {
      const key = `${limit}:${[...owners].sort().join(",")}`;
      const same = kept.get(key);
      if (same && now() - same.at < KEEP_MS) return same.found;
      const found = read(owners, limit);
      kept.set(key, { at: now(), found });
      found.catch(() => kept.delete(key)); // a failed read is not kept
      return found;
    },
    forget() {
      kept.clear();
    },
  };
}

/**
 * The route of the search (mounted at `/jigsaw-search`). GET with categories, sizes, difficulties, languages, owners, text, favorites, sort, limit and page: the jigsaws the person may see that
 * match, a page of them, with how many there are in all. `/facets` counts the jigsaws for each choice. Both are over what `store.load` reads (the newest jigsaws, and up to
 * `SEARCH_MAX_READ` of each owner's, `owners` says who the owners are); `canSee` says which private ones are the person's to see (only when they say who they are: nobody sees a
 * private jigsaw without).
 */
export function jigsawSearchRouter(
  store: JigsawSearchStore,
  canSee: (jigsaw: JigsawSummary, me: string | undefined) => Promise<boolean>,
  owners: () => Promise<string[]>,
  favorites: (userId: string) => Promise<string[]>,
  solvedOf: (userId: string, among: readonly JigsawSummary[]) => Promise<string[]>,
): express.Router {
  const router = express.Router();
  /** The jigsaws the person may see, the newest first; with `only.favorites`, those the person has ticked, with `only.solved`, those the person has solved (none for nobody). */
  const visible = async (me: string | undefined, only: { favorites?: boolean; solved?: boolean } = {}): Promise<JigsawSummary[]> => {
    const [all, mine] = await Promise.all([store.load(await owners(), SEARCH_MAX_READ), only.favorites && me ? favorites(me) : Promise.resolve([] as string[])]);
    const seen = await Promise.all(all.map((j, i) => (!JigsawVisibilities.listed(j.visibility) ? false : j.visibility !== "owner" ? true : me ? canSee(j, me) : false))); // a hidden one is never found; the private ones are asked about at the same time
    const seeable = all.filter((j, i) => seen[i]);
    const favored = new Set(mine);
    const solved = new Set(only.solved && me ? await solvedOf(me, seeable) : []);
    return seeable.filter((j) => (!only.favorites || favored.has(j.id)) && (!only.solved || (!!me && solved.has(j.id))));
  };
  // the jigsaws of the user who asks (`X-Jigsaw-User`), all of them also the private and the hidden ones, with words, a choice of who sees them, an order and a page: the page where a
  // user looks after their jigsaws (up to `SEARCH_MAX_READ` of them are read); 401 without the header
  router.get("/mine", async (req, res) => {
    const me = req.get("X-Jigsaw-User");
    if (!me) return void res.status(401).json({ error: "Say who you are." });
    const parsed = JigsawSearch.parse(req.query as Record<string, unknown>);
    if ("error" in parsed) return void res.status(400).json({ error: parsed.error });
    const visibility = req.query.visibility;
    if (visibility !== undefined && visibility !== "" && visibility !== "everyone" && visibility !== "owner" && visibility !== "hidden") return void res.status(400).json({ error: "The visibility must be everyone, owner or hidden." });
    const own = (await store.load([me], SEARCH_MAX_READ)).filter((j) => j.ownerUid === me);
    const answer = JigsawSearch.mine(own, parsed.query, visibility === "everyone" || visibility === "owner" || visibility === "hidden" ? visibility : undefined);
    res.json({ ...answer, items: answer.items.map(({ description: _description, ...summary }) => summary) });
  });
  // how many jigsaws there are for each choice of the filter, with the rest of it kept (what the Find page shows beside each tick)
  router.get("/facets", async (req, res) => {
    const parsed = JigsawSearch.parse(req.query as Record<string, unknown>);
    if ("error" in parsed) return void res.status(400).json({ error: parsed.error });
    res.json(JigsawSearch.facets(await visible(req.get("X-Jigsaw-User"), { favorites: parsed.query.favorites, solved: parsed.query.solved }), parsed.query));
  });
  router.get("/", async (req, res) => {
    const parsed = JigsawSearch.parse(req.query as Record<string, unknown>);
    if ("error" in parsed) return void res.status(400).json({ error: parsed.error });
    const found = (await visible(req.get("X-Jigsaw-User"), { favorites: parsed.query.favorites, solved: parsed.query.solved })).filter((j) => JigsawSearch.matches(j, parsed.query));
    const page = JigsawSearch.page(found, parsed.query);
    res.json({ ...page, items: page.items.map(({ description: _description, ...summary }) => summary) }); // the description was read to look for words in it: a list does not show it
  });
  return router;
}

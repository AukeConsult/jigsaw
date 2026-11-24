import express from "express";
import { JigsawSpec, JigsawVisibilities, ListedRound, Plays, RoundsList } from "../models";
import type { PlayStore } from "./plays";

// The list of rounds, `GET /jigsaw-rounds?page=&limit=&whose=&status=&sort=`: what the button "Rounds" on the front page shows, the rounds of every user (the person's own too; `whose` keeps all of
// them, only the person's or only the others'). A round is stored under its jigsaw, so there is no one question for "all the rounds of all the users" (a query over every jigsaw would need an
// index that this shared project cannot deploy). The rounds of the jigsaws the person may see are read instead, a few jigsaws at a time, and the model (`RoundsList`) says which are shown, in what
// order and how they are paged. The answer is kept a few seconds for the person, so the next pages of the list (the page asks for them one by one) are the same list and do not read everything again.

/** How many jigsaws are asked about their rounds at the same time. */
const AT_ONCE = 50;
/** How long the list of a person is kept (milliseconds). */
const KEEP_MS = 15_000;
const KEEP_MAX = 200;

export interface RoundsListDeps {
  /** the jigsaws to look at (the newest the store lists) */
  jigsaws: () => Promise<JigsawSpec[]>;
  /** whether the person may see the jigsaw (the rules of the jigsaw: private and hidden ones only for their owner and the players) */
  canSee: (jigsaw: JigsawSpec, me: string | undefined) => Promise<boolean>;
  /** the key of the pictures of a private or hidden jigsaw for whoever may see it (nothing for any other jigsaw) */
  imageKeyFor: (jigsaw: JigsawSpec, me: string | undefined) => Promise<string | undefined>;
  now?: () => number;
}

export function roundsListRouter(plays: PlayStore, deps: RoundsListDeps): express.Router {
  const router = express.Router();
  const now = deps.now ?? Date.now;
  const kept = new Map<string, { at: number; list: Promise<ListedRound[]> }>();

  /** The rounds of every user on the jigsaws `me` may see (the same for every view of the list). A hidden jigsaw is not looked at: it is only in the list of its owner. */
  const read = async (me: string): Promise<ListedRound[]> => {
    const listed = (await deps.jigsaws()).filter((j) => JigsawVisibilities.listed(j.visibility));
    const seen = await Promise.all(listed.map((j) => deps.canSee(j, me)));
    const visible = listed.filter((_, i) => seen[i]);
    const found: ListedRound[] = [];
    for (let i = 0; i < visible.length; i += AT_ONCE) {
      const batch = visible.slice(i, i + AT_ONCE);
      // each jigsaw reads its rounds and then asks for its key, all the jigsaws of the batch at the same time (the key is asked only for a jigsaw that has rounds to show)
      const listed = await Promise.all(
        batch.map(async (j) => {
          const rounds = await plays.list(j.id);
          const imageKey = rounds.length ? await deps.imageKeyFor(j, me) : undefined;
          return rounds.map((play): ListedRound => ({ play: Plays.publicOf(play), jigsaw: { id: j.id, name: j.name, ...(j.timed === false || play.timed === false ? { timed: false } : {}), ...(imageKey ? { imageKey } : {}) } }));
        }),
      );
      found.push(...listed.flat());
    }
    return RoundsList.select(found);
  };

  const listFor = (me: string): Promise<ListedRound[]> => {
    const same = kept.get(me);
    if (same && now() - same.at < KEEP_MS) return same.list;
    if (kept.size >= KEEP_MAX) kept.clear();
    const list = read(me);
    kept.set(me, { at: now(), list });
    list.catch(() => kept.delete(me)); // a failed read is not kept
    return list;
  };

  router.get("/", async (req, res) => {
    const me = req.get("X-Jigsaw-User");
    if (!me) return void res.status(401).json({ error: "Say who you are." });
    const parsed = RoundsList.parse(req.query as { page?: unknown; limit?: unknown; whose?: unknown; status?: unknown; sort?: unknown });
    if ("error" in parsed) return void res.status(400).json({ error: parsed.error });
    res.json(RoundsList.page(RoundsList.arrange(await listFor(me), parsed, me), parsed.page, parsed.limit)); // the list that is kept is the same for every view; the view is applied to it here
  });
  return router;
}

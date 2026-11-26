import express from "express";
import { JigsawSpec, JigsawVisibilities, ListedRound, Plays, RoundsList } from "../models";
import type { PlayStore } from "./plays";
import { apiRouter, askerOf, bad } from "../common/http";
import { TtlCache } from "../common/ttl-cache";
import { filterAsync } from "../common/filter-async";

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
  const router = apiRouter();
  const now = deps.now ?? Date.now;
  const kept = new TtlCache<ListedRound[]>(KEEP_MS, KEEP_MAX, now);

  /** The rounds of every user on the public jigsaws (the same for every view of the list): the front page shows no round on a private or hidden jigsaw, whoever asks (an admin too); those are on the user page. */
  const read = async (me: string): Promise<ListedRound[]> => {
    const listed = (await deps.jigsaws()).filter((j) => !JigsawVisibilities.restricted(j.visibility));
    const visible = await filterAsync(listed, (j) => deps.canSee(j, me));
    const found: ListedRound[] = [];
    for (let i = 0; i < visible.length; i += AT_ONCE) {
      const batch = visible.slice(i, i + AT_ONCE);
      // each jigsaw reads its rounds and then asks for its key, all the jigsaws of the batch at the same time (the key is asked only for a jigsaw that has rounds to show)
      const listed = await Promise.all(
        batch.map(async (j) => {
          const rounds = (await plays.list(j.id)).filter((p) => !p.private); // a private round is never on the front page
          const imageKey = rounds.length ? await deps.imageKeyFor(j, me) : undefined;
          return rounds.map((play): ListedRound => ({ play: Plays.publicOf(play), jigsaw: { id: j.id, name: j.name, ...(j.timed === false || play.timed === false ? { timed: false } : {}), ...(imageKey ? { imageKey } : {}) } }));
        }),
      );
      found.push(...listed.flat());
    }
    return RoundsList.select(found);
  };

  router.get("/", async (req, res) => {
    const me = askerOf(req);
    if (!me) return bad(res, "Say who you are.", 401);
    const parsed = RoundsList.parse(req.query as { page?: unknown; limit?: unknown; whose?: unknown; status?: unknown; sort?: unknown });
    if ("error" in parsed) return bad(res, parsed.error);
    res.json(RoundsList.page(RoundsList.arrange(await kept.get(me, () => read(me)), parsed, me), parsed.page, parsed.limit)); // the list that is kept is the same for every view; the view is applied to it here
  });
  return router;
}

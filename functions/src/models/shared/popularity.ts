import type { JigsawSpec } from './jigsaw-settings';

/** How many jigsaws the front page shows as popular. */
export const POPULAR_SHOWN = 10;

/** A new jigsaw counts as this many rounds, and the bonus halves every `POPULAR_HALF_LIFE_DAYS` days: a fresh jigsaw nobody has played yet can still be seen. */
const NEW_BONUS = 5;
const POPULAR_HALF_LIFE_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A jigsaw with how many rounds have been played on it (a round nobody has moved a piece in is not counted). */
export interface JigsawRounds {
  jigsaw: JigsawSpec;
  rounds: number;
}

/** What makes a jigsaw popular: the rounds played on it, and being new. One rule, so the page and the API cannot disagree. */
export class Popularity {
  /** The score of a jigsaw: its rounds, plus a bonus for being new that halves every two weeks. */
  static score(item: JigsawRounds, now: number): number {
    const ageDays = Math.max(0, now - item.jigsaw.createdAt) / DAY_MS;
    return item.rounds + NEW_BONUS * 0.5 ** (ageDays / POPULAR_HALF_LIFE_DAYS);
  }

  /** The most popular jigsaws, the best first (the newer one first when the scores are the same), at most `limit`. */
  static rank(items: readonly JigsawRounds[], now: number, limit = POPULAR_SHOWN): JigsawSpec[] {
    return [...items]
      .map((item) => ({ item, score: Popularity.score(item, now) }))
      .sort((a, b) => b.score - a.score || b.item.jigsaw.createdAt - a.item.jigsaw.createdAt)
      .slice(0, limit)
      .map((x) => x.item.jigsaw);
  }
}

import { PlaySpec, Plays } from './play';

// The list of rounds on the front page, which the button "Rounds" shows: the rounds that every user has played (the person's own too), which of them are shown (whose, finished or ongoing),
// in what order, and how they are paged. The API reads the rounds of the jigsaws the person may see (see `functions/src/jigsaw/rounds-list.ts`) and this decides the rest.

/** One round of the list, with the jigsaw it is a round of (enough to show it in a list and to open it). */
export interface ListedRound {
  play: PlaySpec;
  /** `timed`: the jigsaw has a clock (the time played is shown); `imageKey`: the key of the pictures of a private jigsaw, only for somebody who may see it (see `ImageAccess`); output only */
  jigsaw: { id: string; name: string; timed?: boolean; imageKey?: string };
}

/** What a page of the list is: the rounds of it, how many there are in all, and whether there are more. */
export interface ListedRoundsPage {
  items: ListedRound[];
  total: number;
  hasMore: boolean;
}

/** Whose rounds are shown: everybody's, the person's own (mine) or the others'. */
export const ROUNDS_WHOSE = ['all', 'mine', 'others'] as const;
export type RoundsWhose = (typeof ROUNDS_WHOSE)[number];
/** Which rounds are shown: all of them, the finished ones (solved) or the ongoing ones. */
export const ROUNDS_STATUSES = ['all', 'finished', 'ongoing'] as const;
export type RoundsStatus = (typeof ROUNDS_STATUSES)[number];
/** How they are in order: the one worked on last first (the date), by the name of the player, or the most finished first (the percent of the pieces in place). */
export const ROUNDS_SORTS = ['date', 'user', 'progress'] as const;
export type RoundsSort = (typeof ROUNDS_SORTS)[number];

/** What is chosen about the list: whose rounds, which of them, and in what order. */
export interface RoundsView {
  whose: RoundsWhose;
  status: RoundsStatus;
  sort: RoundsSort;
}

export class RoundsList {
  /** Everybody's rounds, all of them, the one worked on last first. */
  static readonly DEFAULT_VIEW: RoundsView = { whose: 'all', status: 'all', sort: 'date' };
  /** How many rounds a page has when it is not said, and the most it can have. */
  static readonly PAGE = 20;
  static readonly PAGE_MAX = 50;
  /** The furthest page that can be asked for. */
  static readonly PAGES_MAX = 100;

  /** Whether this is a choice that is allowed (what is read back from the device is checked with it). */
  static isView(value: unknown): value is RoundsView {
    const v = value as Partial<RoundsView> | null;
    return typeof v === 'object' && v !== null && ROUNDS_WHOSE.includes(v.whose as RoundsWhose) && ROUNDS_STATUSES.includes(v.status as RoundsStatus) && ROUNDS_SORTS.includes(v.sort as RoundsSort);
  }

  /** How far a round is, from 0 to 1: the pieces in place of all of them (a round without pieces is at 0). */
  static progress(play: Pick<PlaySpec, 'matched' | 'total'>): number {
    return play.total > 0 ? Math.min(1, Math.max(0, play.matched / play.total)) : 0;
  }

  /**
   * The rounds there are among these: not a round nobody has moved a piece in (it is not a round yet), and not one from a user with no UID (there is no telling whose it is). The person's own
   * rounds are among them.
   */
  static select(rounds: readonly ListedRound[]): ListedRound[] {
    return rounds.filter((r) => !!r.play.userId && !r.play.fresh);
  }

  /**
   * The rounds the view asks for, in its order. `me` is the UID of the person who asks: `whose` keeps the rounds of everybody, only theirs (mine) or only the others'; `status` keeps the finished
   * rounds (solved), the ongoing ones or all; the order is by the date (the one worked on last first), by the name of the player (A to Z, a player's own rounds by date) or by how far the
   * rounds are (the most finished first, then by date).
   */
  static arrange(rounds: readonly ListedRound[], view: RoundsView, me: string): ListedRound[] {
    const finished = (r: ListedRound) => r.play.status === 'solved';
    const mine = (r: ListedRound) => r.play.userId === me;
    const byDate = (a: ListedRound, b: ListedRound) => Plays.lastActive(b.play) - Plays.lastActive(a.play) || (a.play.id < b.play.id ? -1 : 1);
    const order: Record<RoundsSort, (a: ListedRound, b: ListedRound) => number> = {
      date: byDate,
      user: (a, b) => a.play.userName.localeCompare(b.play.userName, undefined, { sensitivity: 'base' }) || byDate(a, b),
      progress: (a, b) => RoundsList.progress(b.play) - RoundsList.progress(a.play) || byDate(a, b),
    };
    return rounds
      .filter((r) => (view.whose === 'all' || (view.whose === 'mine') === mine(r)) && (view.status === 'all' || (view.status === 'finished') === finished(r)))
      .sort(order[view.sort]);
  }

  /** The page asked for of a list that is in order (page 1 is the first). */
  static page(list: readonly ListedRound[], page: number, limit: number): ListedRoundsPage {
    const from = (page - 1) * limit;
    return { items: list.slice(from, from + limit), total: list.length, hasMore: from + limit < list.length };
  }

  /** The page, the size and the view asked for in an address (`?page=2&limit=20&whose=mine&status=finished&sort=user`), or the reason they are not allowed. */
  static parse(query: { page?: unknown; limit?: unknown; whose?: unknown; status?: unknown; sort?: unknown }): ({ page: number; limit: number } & RoundsView) | { error: string } {
    const whole = (v: unknown, fallback: number, max: number, what: string): number | string => {
      if (v === undefined || v === '') return fallback;
      const n = Number(v);
      return Number.isInteger(n) && n >= 1 && n <= max ? n : `The ${what} must be a whole number from 1 to ${max}.`;
    };
    const page = whole(query.page, 1, RoundsList.PAGES_MAX, 'page');
    const limit = whole(query.limit, RoundsList.PAGE, RoundsList.PAGE_MAX, 'limit');
    if (typeof page === 'string') return { error: page };
    if (typeof limit === 'string') return { error: limit };
    const choice = <T extends string>(v: unknown, allowed: readonly T[], fallback: T, what: string): { value: T } | { error: string } =>
      v === undefined || v === '' ? { value: fallback } : allowed.includes(v as T) ? { value: v as T } : { error: `The ${what} must be one of ${allowed.join(', ')}.` };
    const whose = choice(query.whose, ROUNDS_WHOSE, RoundsList.DEFAULT_VIEW.whose, 'whose');
    const status = choice(query.status, ROUNDS_STATUSES, RoundsList.DEFAULT_VIEW.status, 'status');
    const sort = choice(query.sort, ROUNDS_SORTS, RoundsList.DEFAULT_VIEW.sort, 'sort');
    if ('error' in whose) return whose;
    if ('error' in status) return status;
    if ('error' in sort) return sort;
    return { page, limit, whose: whose.value, status: status.value, sort: sort.value };
  }
}

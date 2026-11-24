import { JigsawCategories } from './category';
import { JigsawLanguages, JIGSAW_LANGUAGES } from './language';
import { JigsawMotives, MotiveLevel } from './motive';
import { pieceGrid } from './jigsaw';
import { JigsawSettings, JigsawSpec } from './jigsaw-settings';
import { JIGSAW_KINDS, JigsawKind, JigsawKinds } from './jigsaw-kind';

// Looking for jigsaws: the summary a list needs, what is worked out from a jigsaw to match it, and the search itself (what matches, the counts, the order and the pages). The jigsaws
// are read from Firestore as the newest ones (see `functions/src/jigsaw/jigsaw-search.ts`), and everything here is done on those summaries.

/** The difficulties, as the snap range they stand for (a percent of the grid): the same as the Hard, Medium and Easy of the pages. */
export const DIFFICULTIES = [
  { key: 'hard', percent: 10 },
  { key: 'medium', percent: 25 },
  { key: 'easy', percent: 40 },
] as const;
export type Difficulty = (typeof DIFFICULTIES)[number]['key'];

/** The sizes of a jigsaw in pieces: up to this many pieces is that size. */
export const SIZE_CLASSES = [
  { key: 'small', upTo: 48 },
  { key: 'medium', upTo: 150 },
  { key: 'large', upTo: 352 },
  { key: 'huge', upTo: Number.POSITIVE_INFINITY },
] as const;
export type SizeClass = (typeof SIZE_CLASSES)[number]['key'];

/** The jigsaws a search and the counts read: the newest this many (a jigsaw is one Firestore read whatever fields are asked for). */
export const SEARCH_MAX_READ = 500;
/** How many jigsaws a page of the result has when it is not said, and the most it can have. */
export const SEARCH_PAGE = 36;
export const SEARCH_PAGE_MAX = 100;
/** What stands for "no owner" among the owners (a jigsaw from before owners has none): not a user id, so no user can have it. */
export const NO_OWNER = '~none';
/** The most owners one search can ask for. */
export const SEARCH_MAX_OWNERS = 10;
/** The longest free text a search takes. */
export const SEARCH_MAX_TEXT = 60;
/** The most categories (and sub-categories) one search can ask for. */
export const SEARCH_MAX_CATEGORIES = 6;

/** What is worked out from a jigsaw to match it by (`JigsawIndex.of`): nothing of it is kept in the document. */
export interface JigsawIndexFields {
  /** the categories and the categories of the sub-categories it is in (`nature` and `nature/forest`); none when it is in none */
  tags?: string[];
  /** the motive difficulty of the jigsaw (none when nobody has said it) */
  motive?: MotiveLevel;
  /** the language of the jigsaw (English when it says nothing) */
  language: string;
}

/** The part of a jigsaw a list needs: everything but the pieces and the picture's details. It is all a search reads (`SUMMARY_FIELDS`). */
export type JigsawSummary = Pick<JigsawSpec, 'id' | 'name' | 'author' | 'description' | 'language' | 'ownerUid' | 'kind' | 'visibility' | 'timed' | 'categories' | 'motive' | 'width' | 'height' | 'gridSize' | 'snapPercent' | 'createdAt' | 'imageKey'>;

/** The fields of a document a search reads (not `placed`, the biggest). */
export const SUMMARY_FIELDS = ['name', 'author', 'description', 'language', 'ownerUid', 'kind', 'visibility', 'timed', 'categories', 'motive', 'width', 'height', 'gridSize', 'snapPercent', 'createdAt'] as const;

/** What is worked out from a jigsaw to match it by. */
export class JigsawIndex {
  /** The difficulty of a snap range: the nearest of the levels (a jigsaw that says nothing has the default). */
  static levelOf(snapPercent: number | undefined): Difficulty {
    const percent = snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT;
    return DIFFICULTIES.reduce((best, d) => (Math.abs(d.percent - percent) < Math.abs(best.percent - percent) ? d : best)).key;
  }

  /** The size class of a number of pieces. */
  static sizeClassOf(pieces: number): SizeClass {
    return SIZE_CLASSES.find((s) => pieces <= s.upTo)!.key;
  }

  /** The sizes a jigsaw is found by: its own, or every size for a picture (it is cut in each round, so it can be played at any). */
  static sizeClassesOf(jigsaw: Pick<JigsawSummary, 'kind' | 'width' | 'height' | 'gridSize'>): SizeClass[] {
    return JigsawKinds.isPicture(jigsaw) ? SIZE_CLASSES.map((s) => s.key) : [JigsawIndex.sizeClassOf(JigsawIndex.piecesOf(jigsaw))];
  }

  /** The difficulties a jigsaw is found by: its own, or every difficulty for a picture (each round chooses). */
  static levelsOf(jigsaw: Pick<JigsawSummary, 'kind' | 'snapPercent'>): Difficulty[] {
    return JigsawKinds.isPicture(jigsaw) ? DIFFICULTIES.map((d) => d.key) : [JigsawIndex.levelOf(jigsaw.snapPercent)];
  }

  /** The tags of these categories: each, and the category of each sub-category. */
  static tagsOf(categories: readonly string[] | undefined): string[] {
    const tags = new Set<string>();
    for (const key of JigsawCategories.stored(categories)) {
      const parent = JigsawCategories.of(key)?.parent;
      if (parent) tags.add(parent);
      tags.add(key);
    }
    return [...tags];
  }

  /** How many pieces the jigsaw is cut into. */
  static piecesOf(jigsaw: Pick<JigsawSpec, 'width' | 'height' | 'gridSize'>): number {
    const grid = pieceGrid(jigsaw.width, jigsaw.height, jigsaw.gridSize);
    return grid.columns * grid.rows;
  }

  /** What a jigsaw is matched by (its size and difficulty are not here: a picture has every one, see `sizeClassesOf` and `levelsOf`). */
  static of(jigsaw: Pick<JigsawSpec, 'categories' | 'language'> & { motive?: MotiveLevel }): JigsawIndexFields {
    const tags = JigsawIndex.tagsOf(jigsaw.categories);
    return { ...(tags.length ? { tags } : {}), ...(jigsaw.motive ? { motive: jigsaw.motive } : {}), language: JigsawLanguages.of(jigsaw) };
  }

  /** A summary of a stored document (only the fields a search reads are in it; a document an older version saved gets what it lacked). */
  static summaryOf(id: string, doc: Record<string, unknown>): JigsawSummary {
    const full = JigsawSettings.fromStored(id, doc as Partial<JigsawSpec>) as unknown as Record<string, unknown>;
    return Object.fromEntries(['id', ...SUMMARY_FIELDS].filter((k) => full[k] !== undefined).map((k) => [k, full[k]])) as unknown as JigsawSummary;
  }
}

export type SearchSort = 'new' | 'old' | 'name' | 'pieces' | 'most';

/** The page of the jigsaws of one user (see `JigsawSearch.mine`): the page, and how many jigsaws there are for each choice of who sees them (with the words kept). */
export interface MineAnswer {
  items: JigsawSummary[];
  total: number;
  hasMore: boolean;
  counts: { all: number; everyone: number; owner: number; hidden: number };
}

/** How many jigsaws there are for each choice a filter has, the way the person would see it with the other choices made: what to tick, and how many each tick would give. */
export interface JigsawFacets {
  /** how many jigsaws match everything that is chosen */
  total: number;
  /** by key: the categories and the sub-categories (a category counts the jigsaws in its sub-categories too) */
  categories: Record<string, number>;
  sizes: Record<string, number>;
  difficulties: Record<string, number>;
  /** by kind: a ready jigsaw or a picture (only the kinds that there are entries of are there) */
  kinds: Record<string, number>;
  /** by level of the motive difficulty (only the levels that jigsaws have are there) */
  motives: Record<string, number>;
  /** by language code (only the languages that jigsaws have are there) */
  languages: Record<string, number>;
  /** the users who made the jigsaws, by name, each with how many; the jigsaws from before owners are one more, with `NO_OWNER` as the id and no name, last */
  owners: { id: string; name: string; count: number }[];
}

/**
 * What is asked for. Each list means "any of these"; the lists together mean "and": a jigsaw has to match every list that is there. A list that is not there (or is empty) does
 * not narrow the search.
 */
export interface JigsawQuery {
  /** categories and sub-categories (`nature`, `nature/forest`): a category is every jigsaw in it, a sub-category only those in that sub-category (at most `SEARCH_MAX_CATEGORIES`) */
  categories?: string[];
  sizes?: SizeClass[];
  difficulties?: Difficulty[];
  /** the kinds: ready jigsaws, pictures, or both (a picture is cut in each round, a ready jigsaw is cut already) */
  kinds?: JigsawKind[];
  /** levels of the motive difficulty (a jigsaw that has none is never found by it) */
  motives?: MotiveLevel[];
  /** language codes (a jigsaw without a language is English) */
  languages?: string[];
  /** the users (UIDs) whose jigsaws are looked for (at most `SEARCH_MAX_OWNERS`) */
  owners?: string[];
  /** words that are in the name, the author or the description of the jigsaw, in any order and in any case (a part of a word is enough); every word has to be there */
  text?: string;
  /** only the jigsaws the user who asks has ticked as favorites (the route knows them; a jigsaw is a favorite of a user, not a property of itself) */
  favorites?: true;
  /** only the jigsaws the user who asks has solved (a round of theirs is solved; the route finds them) */
  solved?: true;
  sort: SearchSort;
  limit: number;
  /** from 1 */
  page: number;
}

/** The search for jigsaws: what the address says, what matches, the counts, and how the result is put in order. One class, so the page and the API cannot disagree. */
export class JigsawSearch {
  /** The checked query of the parameters of an address (all text; a list is written with commas), or why it is not allowed. */
  static parse(raw: Record<string, unknown>): { query: JigsawQuery } | { error: string } {
    const text = (name: string): string | undefined | { error: string } => {
      const v = raw[name];
      if (v === undefined || v === '') return undefined;
      return typeof v === 'string' ? v : { error: `${name} must be text.` };
    };
    const names = ['kinds', 'categories', 'sizes', 'difficulties', 'motives', 'languages', 'owners', 'text', 'favorites', 'solved', 'sort', 'limit', 'page'] as const;
    const fields = Object.fromEntries(names.map((n) => [n, text(n)])) as Record<string, string | undefined | { error: string }>;
    for (const v of Object.values(fields)) if (v && typeof v === 'object') return v;
    const f = fields as Partial<Record<(typeof names)[number], string>>;

    /** the values of a list, once each; the reason when one is not allowed */
    const list = (v: string | undefined, name: string, allowed: (x: string) => boolean, most: number): string[] | { error: string } => {
      const values = v === undefined ? [] : [...new Set(v.split(','))];
      const wrong = values.find((x) => !allowed(x));
      if (wrong !== undefined) return { error: `"${wrong}" is not allowed in ${name}.` };
      return values.length > most ? { error: `At most ${most} can be asked for in ${name}.` } : values;
    };
    const kinds = list(f.kinds, 'kinds', (x) => JigsawKinds.is(x), JIGSAW_KINDS.length);
    if (!Array.isArray(kinds)) return kinds;
    const categories = list(f.categories, 'categories', (x) => JigsawCategories.of(x) !== undefined, SEARCH_MAX_CATEGORIES);
    if (!Array.isArray(categories)) return categories;
    const sizes = list(f.sizes, 'sizes', (x) => SIZE_CLASSES.some((c) => c.key === x), SIZE_CLASSES.length);
    if (!Array.isArray(sizes)) return sizes;
    const difficulties = list(f.difficulties, 'difficulties', (x) => DIFFICULTIES.some((d) => d.key === x), DIFFICULTIES.length);
    if (!Array.isArray(difficulties)) return difficulties;
    const motives = list(f.motives, 'motives', (x) => JigsawMotives.is(x), JigsawMotives.keys().length);
    if (!Array.isArray(motives)) return motives;
    const languages = list(f.languages, 'languages', (x) => JigsawLanguages.is(x), JIGSAW_LANGUAGES.length);
    if (!Array.isArray(languages)) return languages;
    const owners = list(f.owners, 'owners', (x) => x === NO_OWNER || (x.length > 0 && x.length <= 60 && !/[/\s~]/.test(x)), SEARCH_MAX_OWNERS);
    if (!Array.isArray(owners)) return owners;
    const words = (f.text ?? '').trim().replace(/\s+/g, ' ');
    if (words.length > SEARCH_MAX_TEXT) return { error: `The text can be at most ${SEARCH_MAX_TEXT} characters.` };
    if (f.favorites !== undefined && f.favorites !== 'true' && f.favorites !== '1') return { error: 'The favorites must be true.' };
    if (f.solved !== undefined && f.solved !== 'true' && f.solved !== '1') return { error: 'The solved must be true.' };
    if (f.sort !== undefined && !['new', 'old', 'name', 'pieces', 'most'].includes(f.sort)) return { error: 'The sort must be new, old, name, pieces or most.' };
    const whole = (v: string | undefined, name: string, min: number, max: number): number | { error: string } => {
      if (v === undefined) return -1;
      const n = Number(v);
      return Number.isInteger(n) && n >= min && n <= max ? n : { error: `${name} must be a whole number from ${min} to ${max}.` };
    };
    const limit = whole(f.limit, 'limit', 1, SEARCH_PAGE_MAX);
    if (typeof limit === 'object') return limit;
    const page = whole(f.page, 'page', 1, 1000);
    if (typeof page === 'object') return page;
    return {
      query: {
        ...(kinds.length ? { kinds: kinds as JigsawKind[] } : {}),
        ...(categories.length ? { categories } : {}),
        ...(sizes.length ? { sizes: sizes as SizeClass[] } : {}),
        ...(difficulties.length ? { difficulties: difficulties as Difficulty[] } : {}),
        ...(motives.length ? { motives: motives as MotiveLevel[] } : {}),
        ...(languages.length ? { languages } : {}),
        ...(owners.length ? { owners } : {}),
        ...(words ? { text: words } : {}),
        ...(f.favorites !== undefined ? { favorites: true as const } : {}),
        ...(f.solved !== undefined ? { solved: true as const } : {}),
        sort: (f.sort as SearchSort | undefined) ?? 'new',
        limit: limit === -1 ? SEARCH_PAGE : limit,
        page: page === -1 ? 1 : page,
      },
    };
  }

  /** Whether a jigsaw is what the query asks for: any of each list, every list, and the text. */
  static matches(jigsaw: JigsawSummary, query: JigsawQuery): boolean {
    const index = JigsawIndex.of(jigsaw);
    return (
      (!query.kinds?.length || query.kinds.includes(JigsawKinds.of(jigsaw))) &&
      (!query.categories?.length || query.categories.some((key) => (index.tags ?? []).includes(key))) &&
      (!query.sizes?.length || JigsawIndex.sizeClassesOf(jigsaw).some((s) => query.sizes!.includes(s))) &&
      (!query.difficulties?.length || JigsawIndex.levelsOf(jigsaw).some((d) => query.difficulties!.includes(d))) &&
      (!query.motives?.length || (!!index.motive && query.motives.includes(index.motive))) &&
      (!query.languages?.length || query.languages.includes(index.language)) &&
      (!query.owners?.length || query.owners.includes(jigsaw.ownerUid ?? NO_OWNER)) &&
      JigsawSearch.hasWords(jigsaw, query.text)
    );
  }

  /** Whether every word of the text is in the name, the author or the description of the jigsaw (a part of a word is enough, case does not matter); no text matches all. */
  static hasWords(jigsaw: Pick<JigsawSummary, 'name' | 'author' | 'description'>, text: string | undefined): boolean {
    const words = (text ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    const hay = `${jigsaw.name} ${jigsaw.author ?? ''} ${jigsaw.description ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  }

  /**
   * The counts for a filter, over these jigsaws: for each list, how many jigsaws there are for each of its choices when everything else that is chosen is kept and that list is not
   * (so ticking one more in the list is what the number says), and in all how many match everything. A choice that no jigsaw has is not there; the owners are by name.
   */
  static facets(items: readonly JigsawSummary[], query: JigsawQuery): JigsawFacets {
    const without = (list: 'kinds' | 'categories' | 'sizes' | 'difficulties' | 'motives' | 'languages' | 'owners') => items.filter((j) => JigsawSearch.matches(j, { ...query, [list]: undefined }));
    const count = (found: readonly JigsawSummary[], keysOf: (j: JigsawSummary) => string[]): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const j of found) for (const key of keysOf(j)) counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    };
    const owners = new Map<string, { id: string; name: string; count: number }>();
    for (const j of without('owners')) {
      const id = j.ownerUid ?? NO_OWNER; // a jigsaw with no owner is counted too, so that the owners add up to all the jigsaws
      const seen = owners.get(id) ?? { id, name: j.ownerUid ? j.author?.trim() || j.ownerUid : '', count: 0 };
      seen.count++;
      owners.set(id, seen);
    }
    return {
      total: items.filter((j) => JigsawSearch.matches(j, query)).length,
      kinds: count(without('kinds'), (j) => [JigsawKinds.of(j)]),
      categories: count(without('categories'), (j) => JigsawIndex.tagsOf(j.categories)),
      sizes: count(without('sizes'), (j) => JigsawIndex.sizeClassesOf(j)),
      difficulties: count(without('difficulties'), (j) => JigsawIndex.levelsOf(j)),
      motives: count(without('motives'), (j) => (j.motive ? [j.motive] : [])),
      languages: count(without('languages'), (j) => [JigsawLanguages.of(j)]),
      owners: [...owners.values()].sort((a, b) => (a.id === NO_OWNER ? 1 : 0) - (b.id === NO_OWNER ? 1 : 0) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), // no owner last
    };
  }

  /**
   * The jigsaws of one user, for the page where the user looks after them (these are all of that user's, also the private and the hidden ones): those with the words of the query in
   * the name, the author or the description, and, when `visibility` is said, only those that this one sees; in the order asked for, and a page of them. The counts say how many there
   * are for each choice of who sees them, with the words kept (so they add up to what the list would show with no choice made).
   */
  static mine(items: readonly JigsawSummary[], query: Pick<JigsawQuery, 'text' | 'sort' | 'limit' | 'page'>, visibility?: 'everyone' | 'owner' | 'hidden'): MineAnswer {
    const withWords = items.filter((j) => JigsawSearch.hasWords(j, query.text));
    const counts = { all: withWords.length, everyone: 0, owner: 0, hidden: 0 };
    for (const j of withWords) counts[j.visibility ?? 'everyone']++;
    const shown = visibility ? withWords.filter((j) => (j.visibility ?? 'everyone') === visibility) : withWords;
    const page = JigsawSearch.page(shown, query as JigsawQuery);
    return { ...page, counts };
  }

  /** The order by number of pieces (`direction` 1: the fewest first, -1: the most first); a picture has no number of pieces of its own, so it comes after the jigsaws that have one. */
  private static byPieces(a: JigsawSummary, b: JigsawSummary, direction: 1 | -1): number {
    const pa = JigsawKinds.isPicture(a);
    const pb = JigsawKinds.isPicture(b);
    if (pa || pb) return Number(pa) - Number(pb);
    return direction * (JigsawIndex.piecesOf(a) - JigsawIndex.piecesOf(b));
  }

  /** The jigsaws in the order asked for (the newest first, the oldest first, by name, or the fewest or the most pieces first; the newer first when they are the same), and the page of them. */
  static page(items: readonly JigsawSummary[], query: JigsawQuery): { items: JigsawSummary[]; total: number; hasMore: boolean } {
    const order: Record<SearchSort, (a: JigsawSummary, b: JigsawSummary) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      old: (a, b) => a.createdAt - b.createdAt,
      name: (a, b) => a.name.localeCompare(b.name),
      pieces: (a, b) => JigsawSearch.byPieces(a, b, 1),
      most: (a, b) => JigsawSearch.byPieces(a, b, -1),
    };
    const sorted = [...items].sort((a, b) => order[query.sort](a, b) || b.createdAt - a.createdAt);
    const from = (query.page - 1) * query.limit;
    return { items: sorted.slice(from, from + query.limit), total: sorted.length, hasMore: from + query.limit < sorted.length };
  }
}

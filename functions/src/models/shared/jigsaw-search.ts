import { JigsawCategories } from './category';
import { JigsawLanguages, JIGSAW_LANGUAGES } from './language';
import { pieceGrid } from './jigsaw';
import { JigsawSettings, JigsawSpec } from './jigsaw-settings';

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
  level: Difficulty;
  sizeClass: SizeClass;
  /** the language of the jigsaw (English when it says nothing) */
  language: string;
}

/** The part of a jigsaw a list needs: everything but the pieces and the picture's details. It is all a search reads (`SUMMARY_FIELDS`). */
export type JigsawSummary = Pick<JigsawSpec, 'id' | 'name' | 'author' | 'description' | 'language' | 'ownerUid' | 'visibility' | 'timed' | 'categories' | 'width' | 'height' | 'gridSize' | 'snapPercent' | 'createdAt'>;

/** The fields of a document a search reads (not `placed`, the biggest). */
export const SUMMARY_FIELDS = ['name', 'author', 'description', 'language', 'ownerUid', 'visibility', 'timed', 'categories', 'width', 'height', 'gridSize', 'snapPercent', 'createdAt'] as const;

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

  /** What a jigsaw is matched by. */
  static of(jigsaw: Pick<JigsawSpec, 'width' | 'height' | 'gridSize' | 'snapPercent' | 'categories' | 'language'>): JigsawIndexFields {
    const tags = JigsawIndex.tagsOf(jigsaw.categories);
    return { ...(tags.length ? { tags } : {}), level: JigsawIndex.levelOf(jigsaw.snapPercent), sizeClass: JigsawIndex.sizeClassOf(JigsawIndex.piecesOf(jigsaw)), language: JigsawLanguages.of(jigsaw) };
  }

  /** A summary of a stored document (only the fields a search reads are in it; a document an older version saved gets what it lacked). */
  static summaryOf(id: string, doc: Record<string, unknown>): JigsawSummary {
    const full = JigsawSettings.fromStored(id, doc as Partial<JigsawSpec>) as unknown as Record<string, unknown>;
    return Object.fromEntries(['id', ...SUMMARY_FIELDS].filter((k) => full[k] !== undefined).map((k) => [k, full[k]])) as unknown as JigsawSummary;
  }
}

export type SearchSort = 'new' | 'name' | 'pieces';

/** How many jigsaws there are for each choice a filter has, the way the person would see it with the other choices made: what to tick, and how many each tick would give. */
export interface JigsawFacets {
  /** how many jigsaws match everything that is chosen */
  total: number;
  /** by key: the categories and the sub-categories (a category counts the jigsaws in its sub-categories too) */
  categories: Record<string, number>;
  sizes: Record<string, number>;
  difficulties: Record<string, number>;
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
  /** language codes (a jigsaw without a language is English) */
  languages?: string[];
  /** the users (UIDs) whose jigsaws are looked for (at most `SEARCH_MAX_OWNERS`) */
  owners?: string[];
  /** words that are in the name, the author or the description of the jigsaw, in any order and in any case (a part of a word is enough); every word has to be there */
  text?: string;
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
    const names = ['categories', 'sizes', 'difficulties', 'languages', 'owners', 'text', 'sort', 'limit', 'page'] as const;
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
    const categories = list(f.categories, 'categories', (x) => JigsawCategories.of(x) !== undefined, SEARCH_MAX_CATEGORIES);
    if (!Array.isArray(categories)) return categories;
    const sizes = list(f.sizes, 'sizes', (x) => SIZE_CLASSES.some((c) => c.key === x), SIZE_CLASSES.length);
    if (!Array.isArray(sizes)) return sizes;
    const difficulties = list(f.difficulties, 'difficulties', (x) => DIFFICULTIES.some((d) => d.key === x), DIFFICULTIES.length);
    if (!Array.isArray(difficulties)) return difficulties;
    const languages = list(f.languages, 'languages', (x) => JigsawLanguages.is(x), JIGSAW_LANGUAGES.length);
    if (!Array.isArray(languages)) return languages;
    const owners = list(f.owners, 'owners', (x) => x === NO_OWNER || (x.length > 0 && x.length <= 60 && !/[/\s~]/.test(x)), SEARCH_MAX_OWNERS);
    if (!Array.isArray(owners)) return owners;
    const words = (f.text ?? '').trim().replace(/\s+/g, ' ');
    if (words.length > SEARCH_MAX_TEXT) return { error: `The text can be at most ${SEARCH_MAX_TEXT} characters.` };
    if (f.sort !== undefined && !['new', 'name', 'pieces'].includes(f.sort)) return { error: 'The sort must be new, name or pieces.' };
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
        ...(categories.length ? { categories } : {}),
        ...(sizes.length ? { sizes: sizes as SizeClass[] } : {}),
        ...(difficulties.length ? { difficulties: difficulties as Difficulty[] } : {}),
        ...(languages.length ? { languages } : {}),
        ...(owners.length ? { owners } : {}),
        ...(words ? { text: words } : {}),
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
      (!query.categories?.length || query.categories.some((key) => (index.tags ?? []).includes(key))) &&
      (!query.sizes?.length || query.sizes.includes(index.sizeClass)) &&
      (!query.difficulties?.length || query.difficulties.includes(index.level)) &&
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
    const without = (list: 'categories' | 'sizes' | 'difficulties' | 'languages' | 'owners') => items.filter((j) => JigsawSearch.matches(j, { ...query, [list]: undefined }));
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
      categories: count(without('categories'), (j) => JigsawIndex.tagsOf(j.categories)),
      sizes: count(without('sizes'), (j) => [JigsawIndex.of(j).sizeClass]),
      difficulties: count(without('difficulties'), (j) => [JigsawIndex.of(j).level]),
      languages: count(without('languages'), (j) => [JigsawLanguages.of(j)]),
      owners: [...owners.values()].sort((a, b) => (a.id === NO_OWNER ? 1 : 0) - (b.id === NO_OWNER ? 1 : 0) || a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })), // no owner last
    };
  }

  /** The jigsaws in the order asked for (the newest first, by name, or the fewest pieces first; the newer first when they are the same), and the page of them. */
  static page(items: readonly JigsawSummary[], query: JigsawQuery): { items: JigsawSummary[]; total: number; hasMore: boolean } {
    const order: Record<SearchSort, (a: JigsawSummary, b: JigsawSummary) => number> = {
      new: (a, b) => b.createdAt - a.createdAt,
      name: (a, b) => a.name.localeCompare(b.name),
      pieces: (a, b) => JigsawIndex.piecesOf(a) - JigsawIndex.piecesOf(b),
    };
    const sorted = [...items].sort((a, b) => order[query.sort](a, b) || b.createdAt - a.createdAt);
    const from = (query.page - 1) * query.limit;
    return { items: sorted.slice(from, from + query.limit), total: sorted.length, hasMore: from + query.limit < sorted.length };
  }
}

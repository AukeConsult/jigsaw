import { JigsawCategories } from './category';
import { JIGSAW_KINDS, JigsawKind, JigsawKinds } from './jigsaw-kind';
import { JigsawLanguages, JIGSAW_LANGUAGES } from './language';
import { JigsawMotives, MotiveLevel } from './motive';
import { DIFFICULTIES, Difficulty, FILTER_VISIBILITIES, FilterVisibility, JigsawQuery, NO_OWNER, SEARCH_MAX_CATEGORIES, SEARCH_MAX_OWNERS, SEARCH_MAX_TEXT, SIZE_CLASSES, SizeClass } from './jigsaw-search';

/** What a person has chosen to look for on a page (a filter of jigsaws): a list that is empty is "all". Each list means "any of these", and the lists together "and". The choices a page remembers, and what the search is asked. */
export interface JigsawFilter {
  /** words in the name or the author */
  text: string;
  /** what the entry is: a ready jigsaw, a picture, or both */
  kinds: JigsawKind[];
  /** categories and sub-categories (`nature`, `nature/forest`) */
  categories: string[];
  sizes: SizeClass[];
  difficulties: Difficulty[];
  /** the levels of the motive difficulty */
  motives: MotiveLevel[];
  /** language codes: the languages the jigsaws are written in */
  languages: string[];
  /** the users (UIDs) who made the jigsaws */
  owners: string[];
  /** who sees them: public, private, or both (none chosen is all of them) */
  visibilities: FilterVisibility[];
  /** only the jigsaws the user has ticked as favorites (left out when it is not) */
  favorites?: true;
  /** only the jigsaws the user has solved (left out when it is not) */
  solved?: true;
}

/** How the jigsaws are shown, and what is looked for: what the Find page keeps on the device and, when Go is pressed, with the user. */
export interface JigsawSetup {
  view: 'list' | 'cards';
  filter: JigsawFilter;
}

/** The parts of a filter, in the order a page shows them. */
export type JigsawFilterField = keyof JigsawFilter;
export const JIGSAW_FILTER_FIELDS: readonly JigsawFilterField[] = ['text', 'kinds', 'categories', 'sizes', 'difficulties', 'motives', 'languages', 'owners', 'visibilities', 'favorites', 'solved'];

/** The lists of a filter that are chosen by ticking, with what can be ticked in each and the most that can be. */
type TickedField = Exclude<JigsawFilterField, 'text' | 'favorites' | 'solved'>;
const MOST: Record<TickedField, number> = { kinds: JIGSAW_KINDS.length, categories: SEARCH_MAX_CATEGORIES, sizes: SIZE_CLASSES.length, difficulties: DIFFICULTIES.length, motives: JigsawMotives.keys().length, languages: JIGSAW_LANGUAGES.length, owners: SEARCH_MAX_OWNERS, visibilities: FILTER_VISIBILITIES.length };

/** The rules of a filter of jigsaws: one place, so every page that has one (and its remembered choice) agrees. A filter is never changed: a choice gives a new one. */
export class JigsawFilters {
  /** The filter that asks for everything. */
  static empty(): JigsawFilter {
    return { text: '', kinds: [], categories: [], sizes: [], difficulties: [], motives: [], languages: [], owners: [], visibilities: [] };
  }

  /** Whether any choice is made. */
  static isOn(filter: JigsawFilter): boolean {
    return filter.text.trim() !== '' || filter.kinds.length > 0 || filter.categories.length > 0 || filter.sizes.length > 0 || filter.difficulties.length > 0 || filter.motives.length > 0 || filter.languages.length > 0 || filter.owners.length > 0 || filter.favorites === true || filter.solved === true || (filter.visibilities?.length ?? 0) > 0;
  }

  /** The filter with this text (the words are trimmed, and not longer than a search takes). */
  static withText(filter: JigsawFilter, text: string): JigsawFilter {
    return { ...filter, text: text.replace(/\s+/g, ' ').trimStart().slice(0, SEARCH_MAX_TEXT) };
  }

  /** Whether this is chosen in the filter: a category counts as chosen when one of its sub-categories is. */
  static isChosen(filter: JigsawFilter, field: TickedField, value: string): boolean {
    return field === 'categories' ? JigsawCategories.isChosen(filter.categories, value) : (filter[field] as string[]).includes(value);
  }

  /** Whether this can be ticked now: it is ticked already (so it can be taken away), or there is room. */
  static canChoose(filter: JigsawFilter, field: TickedField, value: string): boolean {
    return field === 'categories' ? JigsawCategories.canChoose(filter.categories, value, MOST.categories) : JigsawFilters.isChosen(filter, field, value) || filter[field].length < MOST[field];
  }

  /**
   * The filter after this is ticked, or taken away when it is ticked already. A category is ticked on its own (its sub-categories are left blank: every jigsaw in it is meant), and
   * a sub-category takes the place of its category (see `JigsawCategories.toggled`). Nothing changes when there is no room, or the value is not one that can be ticked.
   */
  static toggled(filter: JigsawFilter, field: TickedField, value: string): JigsawFilter {
    if (field === 'categories') return { ...filter, categories: JigsawCategories.toggled(filter.categories, value, MOST.categories) };
    const allowed = field === 'kinds' ? JigsawKinds.is(value) : field === 'sizes' ? SIZE_CLASSES.some((s) => s.key === value) : field === 'difficulties' ? DIFFICULTIES.some((d) => d.key === value) : field === 'motives' ? JigsawMotives.is(value) : field === 'languages' ? JigsawLanguages.is(value) : field === 'visibilities' ? FILTER_VISIBILITIES.some((v) => v === value) : value.length > 0;
    if (!allowed) return filter;
    const now = filter[field] as string[];
    if (now.includes(value)) return { ...filter, [field]: now.filter((v) => v !== value) };
    return now.length >= MOST[field] ? filter : { ...filter, [field]: [...now, value] };
  }

  /** Whether this is a filter as the model has it (a value that was kept on a device and read again is checked with this). */
  static is(value: unknown): value is JigsawFilter {
    const f = value as Partial<Record<JigsawFilterField, unknown>> | null;
    if (!f || typeof f !== 'object') return false;
    const list = (x: unknown, most: number, ok: (v: unknown) => boolean): boolean => Array.isArray(x) && x.length <= most && x.every(ok) && new Set(x).size === x.length;
    const id = (x: unknown) => x === NO_OWNER || (typeof x === 'string' && x.length > 0 && x.length <= 60 && !/[/\s~]/.test(x));
    return (
      typeof f.text === 'string' && f.text.length <= SEARCH_MAX_TEXT &&
      list(f.kinds ?? [], MOST.kinds, (k) => JigsawKinds.is(k)) && // a filter kept before the kinds has none
      list(f.categories, MOST.categories, (k) => JigsawCategories.of(k) !== undefined) &&
      list(f.sizes, MOST.sizes, (k) => SIZE_CLASSES.some((s) => s.key === k)) &&
      list(f.difficulties, MOST.difficulties, (k) => DIFFICULTIES.some((d) => d.key === k)) &&
      list(f.motives ?? [], MOST.motives, (k) => JigsawMotives.is(k)) && // a filter kept before the motive difficulty has none
      list(f.languages, MOST.languages, (k) => JigsawLanguages.is(k)) &&
      list(f.owners, MOST.owners, id) &&
      (f.favorites === undefined || f.favorites === true) &&
      (f.solved === undefined || f.solved === true) &&
      list(f.visibilities ?? [], MOST.visibilities, (v) => FILTER_VISIBILITIES.some((x) => x === v)) // a filter kept before it has none
    );
  }

  /** The filter as it is kept: only the known fields (a filter that was kept before the kinds or the motives had none gets them), and the two switches only when they are on. */
  static stored(filter: JigsawFilter): JigsawFilter {
    return { text: filter.text, kinds: filter.kinds ?? [], categories: filter.categories, sizes: filter.sizes, difficulties: filter.difficulties, motives: filter.motives ?? [], languages: filter.languages, owners: filter.owners, visibilities: filter.visibilities ?? [], ...(filter.favorites ? { favorites: true } : {}), ...(filter.solved ? { solved: true } : {}) };
  }

  /**
   * The filter with these categories added, so what was just made is not left out of it. A filter with no category chosen looks at every category, so it is left as it is (adding one would narrow it); a category (or a
   * sub-category) that is chosen already, or whose category is chosen on its own (all of it is meant), is not added again; one that there is no room for is left out.
   */
  static withCategories(filter: JigsawFilter, categories: readonly string[]): JigsawFilter {
    if (!filter.categories.length) return filter;
    return categories.reduce((now, key) => (JigsawFilters.isChosen(now, 'categories', key) || now.categories.some((k) => key.startsWith(`${k}/`)) || !JigsawFilters.canChoose(now, 'categories', key) ? now : JigsawFilters.toggled(now, 'categories', key)), filter);
  }

  /**
   * The filter with this visibility added, so a picture that was just made (private to begin with) is not left out of it. Nothing is chosen: every picture is shown already, so it is left as it is (adding one would narrow it);
   * it is chosen already: as it is.
   */
  static withVisibility(filter: JigsawFilter, visibility: FilterVisibility): JigsawFilter {
    const now = filter.visibilities ?? [];
    return !now.length || now.includes(visibility) ? filter : { ...filter, visibilities: [...now, visibility] };
  }

  /** Whether this is a setup as the model has it (checked when it is kept with a user, and when it is read from a device). */
  static isSetup(value: unknown): value is JigsawSetup {
    const s = value as Partial<JigsawSetup> | null;
    return !!s && typeof s === 'object' && (s.view === 'list' || s.view === 'cards') && JigsawFilters.is(s.filter);
  }

  /** What the search is asked for this filter: a list that is empty, and a text with no words, are left out. */
  static query(filter: JigsawFilter, page = 1, limit?: number): Partial<JigsawQuery> {
    const text = filter.text.trim();
    return {
      ...(filter.kinds.length ? { kinds: filter.kinds } : {}),
      ...(filter.categories.length ? { categories: filter.categories } : {}),
      ...(filter.sizes.length ? { sizes: filter.sizes } : {}),
      ...(filter.difficulties.length ? { difficulties: filter.difficulties } : {}),
      ...(filter.motives.length ? { motives: filter.motives } : {}),
      ...(filter.languages.length ? { languages: filter.languages } : {}),
      ...(filter.owners.length ? { owners: filter.owners } : {}),
      ...(filter.visibilities?.length ? { visibilities: filter.visibilities } : {}),
      ...(text ? { text } : {}),
      ...(filter.favorites ? { favorites: true as const } : {}),
      ...(filter.solved ? { solved: true as const } : {}),
      page,
      ...(limit !== undefined ? { limit } : {}),
    };
  }
}

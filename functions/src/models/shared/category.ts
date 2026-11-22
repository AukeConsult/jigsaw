/**
 * One category a jigsaw can be put in: a key that never changes (it is what a jigsaw keeps), the English name, and a Bootstrap icon for it. A category has sub-categories
 * (`subs`), and a sub-category is also a category: its key is the key of its category, a slash and its own key (`nature/mountains`), it has the icon of its category, it
 * says which one (`parent`) and has no sub-categories of its own (two levels, no more).
 */
export interface JigsawCategory {
  readonly key: string;
  readonly name: string;
  readonly icon: string;
  readonly parent?: string;
  readonly subs: readonly JigsawCategory[];
}

/** The most categories one jigsaw can be in (a category or a sub-category is one). */
export const CATEGORIES_MAX_PER_JIGSAW = 3;

/** A category with its sub-categories, given as [key, English name]: the sub-categories get their full keys and the icon of the category. */
const category = (key: string, name: string, icon: string, subs: readonly (readonly [string, string])[]): JigsawCategory => ({
  key,
  name,
  icon,
  subs: subs.map(([sub, subName]) => ({ key: `${key}/${sub}`, name: subName, icon, parent: key, subs: [] })),
});

/**
 * The categories, in the order they are shown. The keys are kept with the jigsaws, so a key is never changed or reused: a name is only what is shown (and translated).
 */
const CATEGORIES: readonly JigsawCategory[] = [
  category('recommended', 'Recommended', 'bi-star', []),
  category('family', 'Family', 'bi-people', [['grandparents', 'Parents & grandparents'], ['children', 'Children'], ['weddings', 'Weddings'], ['parties', 'Parties & birthdays'], ['friends', 'Friends'], ['reunions', 'Reunions']]),
  category('travel', 'Travel', 'bi-airplane', [['cities', 'Cities'], ['landmarks', 'Landmarks'], ['beaches', 'Beaches & islands'], ['roadtrips', 'Road trips'], ['cruises', 'Cruises']]),
  category('nature', 'Nature', 'bi-tree', [['mountains', 'Mountains'], ['coast', 'Sea & coast'], ['water', 'Lakes, rivers & waterfalls'], ['forest', 'Forest'], ['sky', 'Sky & sunsets']]),
  category('animals', 'Animals', 'bi-bug', [['dogs', 'Dogs'], ['cats', 'Cats'], ['birds', 'Birds'], ['farm', 'Horses & farm animals'], ['wildlife', 'Wildlife'], ['sea', 'Sea life']]),
  category('flowers', 'Flowers & garden', 'bi-flower1', [['flowers', 'Flowers'], ['gardens', 'Gardens'], ['trees', 'Trees & leaves'], ['herbs', 'Vegetables & herbs']]),
  category('food', 'Food', 'bi-cup-hot', [['meals', 'Meals'], ['baking', 'Baking & sweets'], ['fruit', 'Fruit & vegetables'], ['drinks', 'Drinks & coffee']]),
  category('art', 'Art', 'bi-palette', [['paintings', 'Paintings'], ['drawings', 'Drawings'], ['photography', 'Photography'], ['crafts', 'Crafts & textiles'], ['sculpture', 'Sculpture']]),
  category('buildings', 'Buildings', 'bi-building', [['houses', 'Houses & cottages'], ['churches', 'Churches'], ['castles', 'Castles'], ['bridges', 'Bridges'], ['interiors', 'Interiors']]),
  category('seasons', 'Seasons & holidays', 'bi-snow', [['christmas', 'Christmas'], ['easter', 'Easter'], ['winter', 'Winter'], ['spring', 'Spring'], ['summer', 'Summer'], ['autumn', 'Autumn']]),
  category('transport', 'Transport', 'bi-train-front', [['boats', 'Boats & ships'], ['trains', 'Trains'], ['cars', 'Cars'], ['planes', 'Planes'], ['bicycles', 'Bicycles']]),
  category('kids', 'Kids', 'bi-emoji-smile', [['characters', 'Cartoons & characters'], ['toys', 'Toys'], ['alphabet', 'Alphabet & numbers'], ['fairytales', 'Fairy tales']]),
  category('other', 'Other', 'bi-three-dots', []),
];

/** Every category and sub-category, each category followed by its sub-categories: the order a key is kept in. */
const EVERY: readonly JigsawCategory[] = CATEGORIES.flatMap((c) => [c, ...c.subs]);

/** What the categories are, and what is allowed of them in a jigsaw. One place, so the forms, the pages and the API cannot disagree. */
export class JigsawCategories {
  /** The categories, in the order they are shown, each with its sub-categories. */
  static all(): readonly JigsawCategory[] {
    return CATEGORIES;
  }

  /** The category or sub-category with this key, or undefined when there is none. */
  static of(key: unknown): JigsawCategory | undefined {
    return EVERY.find((c) => c.key === key);
  }

  /** The reason this list of keys is not allowed as the categories of a jigsaw, or '' when it is fine (none is fine). */
  static error(keys: unknown): string {
    if (!Array.isArray(keys)) return 'The categories must be a list.';
    if (keys.length > CATEGORIES_MAX_PER_JIGSAW) return `A jigsaw can be in at most ${CATEGORIES_MAX_PER_JIGSAW} categories.`;
    if (new Set(keys).size !== keys.length) return 'A category is only chosen once.';
    const unknown = keys.find((k) => !JigsawCategories.of(k));
    return unknown === undefined ? '' : `"${String(unknown)}" is not a category.`;
  }

  /** Whether this category or sub-category is chosen in these keys (a category counts as chosen when one of its sub-categories is). */
  static isChosen(keys: readonly string[], key: string): boolean {
    const category = JigsawCategories.of(key);
    if (!category) return false;
    return category.parent ? keys.includes(key) : keys.some((k) => k === key || k.startsWith(`${key}/`));
  }

  /** Whether the category or sub-category can be chosen now: it is chosen already (so it can be taken away), or there is room, or it can take the place of its own category. */
  static canChoose(keys: readonly string[], key: string, max = CATEGORIES_MAX_PER_JIGSAW): boolean {
    const category = JigsawCategories.of(key);
    if (!category) return false;
    return JigsawCategories.isChosen(keys, key) || keys.length < max || (!!category.parent && keys.includes(category.parent));
  }

  /**
   * The keys after the person presses a category or a sub-category. A category is chosen on its own (a sub-category is left blank); pressing it again takes it away with
   * its sub-categories. A sub-category takes the place of its category (so it is still one choice), more sub-categories of the same category are added, and taking the last one
   * away leaves the category chosen on its own. Nothing changes when there is no room, or for a key that is not a category.
   */
  static toggled(keys: readonly string[], key: string, max = CATEGORIES_MAX_PER_JIGSAW): string[] {
    const category = JigsawCategories.of(key);
    const now = JigsawCategories.stored(keys, max);
    if (!category || !JigsawCategories.canChoose(now, key, max)) return now;
    if (!category.parent) {
      return JigsawCategories.isChosen(now, key) ? now.filter((k) => k !== key && !k.startsWith(`${key}/`)) : JigsawCategories.stored([...now, key], max);
    }
    if (now.includes(key)) {
      const left = now.filter((k) => k !== key);
      return JigsawCategories.stored(left.some((k) => k.startsWith(`${category.parent}/`)) ? left : [...left, category.parent], max);
    }
    return JigsawCategories.stored([...now.filter((k) => k !== category.parent), key], max);
  }

  /** The keys as they are stored: only known categories and sub-categories, once each, in the order they are shown, at most `max` (the most a jigsaw can be in, when not said). */
  static stored(keys: unknown, max = CATEGORIES_MAX_PER_JIGSAW): string[] {
    const wanted = new Set(Array.isArray(keys) ? keys : []);
    return EVERY.filter((c) => wanted.has(c.key)).slice(0, max).map((c) => c.key);
  }
}

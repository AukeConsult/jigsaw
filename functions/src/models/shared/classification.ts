import { JigsawCategories } from './category';
import { JIGSAW_MAX_NAME } from './jigsaw-settings';
import { JigsawLanguages } from './language';
import { JigsawMotives, MotiveLevel } from './motive';

// The classification of a jigsaw by what its picture shows: the categories it is in, how hard the motive is (the motive difficulty: a property of the jigsaw, not a category), and a name (never a description: a person writes that). The AI gives it as JSON; this is what is asked of it, and how what it
// says is checked before anything is used (the AI can say what is not allowed: a category that is not there, a name that is too long).

/** What the AI says about a picture. An empty name means it said none. */
export interface Classification {
  /** the keys of the categories and sub-categories (at most `CATEGORIES_MAX_PER_JIGSAW`) */
  categories: string[];
  /** the motive difficulty (a level of `JigsawMotives`), worked out from the AI's ratings of detail, contrast and colour, and landmark (`JigsawMotives.fromRatings`) */
  motive?: MotiveLevel;
  name: string;
}

export class Classifications {
  /** Something of what the AI can say is empty on a picture that has `has`: the name, the categories or the motive difficulty. */
  static lacks(has: Partial<Classification>): boolean {
    return !has.name?.trim() || !has.categories?.length || !has.motive;
  }

  /** What of a classification may be put on a picture that has `has`: **only what is empty there**, so nothing the person has typed or chosen is replaced. */
  static fill(has: Partial<Classification>, found: Classification): Partial<Classification> {
    return {
      ...(!has.name?.trim() && found.name ? { name: found.name } : {}),
      ...(!has.categories?.length && found.categories.length ? { categories: found.categories } : {}),
      ...(!has.motive && found.motive ? { motive: found.motive } : {}),
    };
  }

  /** Every key the AI may answer with as a category: the categories and the sub-categories. */
  static keys(): string[] {
    return JigsawCategories.all().flatMap((c) => [c.key, ...c.subs.map((s) => s.key)]);
  }

  /** The JSON schema the AI answers in: the keys are the only values a category can have. */
  static schema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        categories: { type: 'array', items: { type: 'string', enum: Classifications.keys() } },
        detail: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        colour: { type: 'integer', enum: [1, 2, 3, 4, 5] },
        landmark: { type: 'boolean' },
        name: { type: 'string' },
      },
      required: ['categories', 'detail', 'colour', 'landmark', 'name'],
      additionalProperties: false,
    };
  }

  /** What the AI is told: what to do, the categories with what they mean, how long the name is, and the language to write it in. */
  static prompt(language: string): string {
    const names = JigsawCategories.all().map((c) => `${c.key} (${c.name}${c.subs.length ? `: ${c.subs.map((s) => `${s.key} = ${s.name}`).join(', ')}` : ''})`);
    const writeIn = JigsawLanguages.nameOf(JigsawLanguages.is(language) ? language : 'en');
    return [
      'You classify the picture of a jigsaw puzzle.',
      'Answer with the categories the picture belongs to (at most 3, the best fit first; give a sub-category instead of its category when it clearly fits, not both; use "other" only when nothing else fits), and a short name.',
      `The categories, by key: ${names.join('; ')}.`,
      'Also rate how hard the motive itself is to put together, from how easy it is to tell the parts of the picture apart (not from how many pieces it will be cut into). You do not choose a level: you give three ratings, and the level is worked out from them. ' +
        'detail, from 1 to 5: how many different shapes, objects, edges and textures there are (1 = almost none: a plain surface, a sky, calm water; 3 = a normal photo with a mix of detailed and plain areas; 5 = very many, all over the picture). ' +
        'colour, from 1 to 5: contrast and colour, how strongly the parts differ in brightness and in colour (1 = one colour or only soft tones, everything about equally bright, fog, an overcast sky; 3 = some clear differences; 5 = many strong colours and clear light and dark differences everywhere). ' +
        'landmark: true when at least one thing clearly stands out from a plain picture (a mark, a line, an object), so a piece with it shows where it belongs; false when nothing does. ' +
        'Rate what you see in the whole picture: a plain area that takes up much of it counts for a lot, and when in doubt between two numbers, give the lower one.',
      `The name has at most ${JIGSAW_MAX_NAME} characters.`,
      `Write the name in ${writeIn}.`,
      'Do not name real people, and do not guess private details such as addresses; say what can be seen.',
    ].join('\n');
  }

  /**
   * The categories the AI gave, as one would choose them: only those that exist (once each, at most three), a sub-category instead of its category (not both), and "other" only when it is
   * all there is. Never Recommended: that is a person's choice, and there is room for only a few.
   */
  static tidyCategories(raw: unknown): string[] {
    const keys = JigsawCategories.stored(Array.isArray(raw) ? raw.filter((k) => k !== 'recommended' && JigsawCategories.of(k)) : []);
    const withoutParents = keys.filter((key) => !keys.some((other) => other.startsWith(`${key}/`)));
    return withoutParents.length > 1 ? withoutParents.filter((key) => key !== 'other') : withoutParents;
  }

  /** What the AI said, checked: only the categories that exist (once each, at most three) and the motive difficulty when it is a level, and the name tidied and cut to its limit. Or why it cannot be used. */
  static read(raw: unknown): Classification | { error: string } {
    if (!raw || typeof raw !== 'object') return { error: 'The answer is not an object.' };
    const r = raw as { categories?: unknown; detail?: unknown; colour?: unknown; landmark?: unknown; motive?: unknown; name?: unknown };
    const tidy = (value: unknown, most: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, most).trim() : '');
    const motive = JigsawMotives.fromRatings(r.detail, r.colour, r.landmark) ?? (JigsawMotives.is(r.motive) ? r.motive : undefined); // the level follows from the ratings; a level said outright is only used when there are no ratings
    return { categories: Classifications.tidyCategories(r.categories), ...(motive ? { motive } : {}), name: tidy(r.name, JIGSAW_MAX_NAME) };
  }
}

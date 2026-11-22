import { JigsawCategories } from './category';
import { JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME } from './jigsaw-settings';
import { JigsawLanguages } from './language';

// The classification of a jigsaw by what its picture shows: the categories it is in, a name and a description. The AI gives it as JSON; this is what is asked of it, and how what it
// says is checked before anything is used (the AI can say what is not allowed: a category that is not there, a name that is too long).

/** What the AI says about a picture. An empty name or description means it said none. */
export interface Classification {
  /** the keys of the categories and sub-categories (at most `CATEGORIES_MAX_PER_JIGSAW`) */
  categories: string[];
  name: string;
  description: string;
}

export class Classifications {
  /** Every key the AI may answer with: the categories and the sub-categories. */
  static keys(): string[] {
    return JigsawCategories.all().flatMap((c) => [c.key, ...c.subs.map((s) => s.key)]);
  }

  /** The JSON schema the AI answers in: the keys are the only values a category can have. */
  static schema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        categories: { type: 'array', items: { type: 'string', enum: Classifications.keys() } },
        name: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['categories', 'name', 'description'],
      additionalProperties: false,
    };
  }

  /** What the AI is told: what to do, the categories with what they mean, how long the texts are, and the language to write them in. */
  static prompt(language: string): string {
    const names = JigsawCategories.all().map((c) => `${c.key} (${c.name}${c.subs.length ? `: ${c.subs.map((s) => `${s.key} = ${s.name}`).join(', ')}` : ''})`);
    const writeIn = JigsawLanguages.nameOf(JigsawLanguages.is(language) ? language : 'en');
    return [
      'You classify the picture of a jigsaw puzzle.',
      'Answer with the categories the picture belongs to (at most 3, the best fit first; give a sub-category instead of its category when it clearly fits, not both; use "other" only when nothing else fits), a short name and a description.',
      `The categories, by key: ${names.join('; ')}.`,
      `The name has at most ${JIGSAW_MAX_NAME} characters and the description at most ${JIGSAW_MAX_DESCRIPTION}: one or two plain sentences about what the picture shows.`,
      `Write the name and the description in ${writeIn}.`,
      'Do not name real people, and do not guess private details such as addresses; say what can be seen.',
    ].join('\n');
  }

  /**
   * The categories the AI gave, as one would choose them: only those that exist (once each, at most three), a sub-category instead of its category (not both), and "other" only when it is
   * all there is.
   */
  static tidyCategories(raw: unknown): string[] {
    const keys = JigsawCategories.stored(Array.isArray(raw) ? raw.filter((k) => JigsawCategories.of(k)) : []);
    const withoutParents = keys.filter((key) => !keys.some((other) => other.startsWith(`${key}/`)));
    return withoutParents.length > 1 ? withoutParents.filter((key) => key !== 'other') : withoutParents;
  }

  /** What the AI said, checked: only the categories that exist (once each, at most three), and the texts tidied and cut to their limits. Or why it cannot be used. */
  static read(raw: unknown): Classification | { error: string } {
    if (!raw || typeof raw !== 'object') return { error: 'The answer is not an object.' };
    const r = raw as { categories?: unknown; name?: unknown; description?: unknown };
    const tidy = (value: unknown, most: number) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, most).trim() : '');
    return { categories: Classifications.tidyCategories(r.categories), name: tidy(r.name, JIGSAW_MAX_NAME), description: tidy(r.description, JIGSAW_MAX_DESCRIPTION) };
  }
}

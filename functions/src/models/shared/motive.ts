/**
 * The motive difficulty of a jigsaw: how hard the picture itself is to put together, from how easy it is to tell its parts apart: a picture with few distinct details (a sky, a calm sea, one colour, a repeating pattern) is harder
 * than one with many different details, because the pieces look alike (not from how many pieces it is cut into, and not the difficulty of the game, which is the snap range). It is a property of the jigsaw, like its difficulty, and not a category: one level, or none when nobody has said it. The AI says it from the picture,
 * and the owner can set it by hand.
 */

/** The levels, the easiest first, with their English names (the pages translate them). */
export const MOTIVES = [
  { key: 'easy', name: 'Easy' },
  { key: 'mediumeasy', name: 'Medium easy' },
  { key: 'normal', name: 'Normal' },
  { key: 'hard', name: 'Hard' },
  { key: 'expert', name: 'Expert' },
] as const;
export type MotiveLevel = (typeof MOTIVES)[number]['key'];

/** The Bootstrap icon of the motive difficulty. */
export const MOTIVE_ICON = 'bi-bullseye';

/** The rules of the motive difficulty. One place, so the forms, the pages, the search and the API cannot disagree. */
export class JigsawMotives {
  /** The keys of the levels, the easiest first. */
  static keys(): MotiveLevel[] {
    return MOTIVES.map((m) => m.key);
  }

  /** Whether this is a level. */
  static is(value: unknown): value is MotiveLevel {
    return MOTIVES.some((m) => m.key === value);
  }

  /** The English name of a level (the key itself for what is not one). */
  static nameOf(value: unknown): string {
    return MOTIVES.find((m) => m.key === value)?.name ?? String(value);
  }

  /** The level a jigsaw has: the one it says, or else the one an older version kept among its categories (`motive/hard`), or undefined when there is none. */
  static of(doc: { motive?: unknown; categories?: unknown }): MotiveLevel | undefined {
    if (JigsawMotives.is(doc.motive)) return doc.motive;
    const old = Array.isArray(doc.categories) ? doc.categories.find((k) => typeof k === 'string' && k.startsWith('motive/') && JigsawMotives.is(k.slice('motive/'.length))) : undefined;
    return old ? ((old as string).slice('motive/'.length) as MotiveLevel) : undefined;
  }

  /**
   * The level worked out from what the AI saw (it rates, it does not choose the level): how much detail the picture has and how much contrast and colour, each from 1 (hardly any) to 5 (very much),
   * and whether something clearly stands out (a mark, a line, an object). The two ratings count together: 9-10 easy, 7-8 medium easy, 5-6 normal, 4 hard, and 2-3 (almost no detail and almost
   * no contrast or colour) is expert, except when something clearly stands out: then it is hard. Undefined when a rating is not a whole number from 1 to 5.
   */
  static fromRatings(detail: unknown, colour: unknown, landmark: unknown): MotiveLevel | undefined {
    const rating = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5;
    if (!rating(detail) || !rating(colour)) return undefined;
    const sum = detail + colour;
    if (sum >= 9) return 'easy';
    if (sum >= 7) return 'mediumeasy';
    if (sum >= 5) return 'normal';
    if (sum >= 4) return 'hard';
    return landmark === true ? 'hard' : 'expert';
  }

  /** The reason this is not allowed as the motive difficulty of a jigsaw, or '' (none is fine). */
  static error(value: unknown): string {
    return value === undefined || JigsawMotives.is(value) ? '' : `The motive difficulty must be one of ${JigsawMotives.keys().join(', ')}.`;
  }
}

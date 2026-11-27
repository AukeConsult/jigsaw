// How big a person likes the picture tiles (the cards of the lists: the bigger, the fewer in a row): a preference of the account (`tileSize` on it), kept on the device too. (The small labels have one size.)

export const PART_SIZES = ['small', 'medium', 'large'] as const;
export type PartSize = (typeof PART_SIZES)[number];

/** what a person has who has chosen nothing */
export const DEFAULT_PART_SIZE: PartSize = 'medium';

export class PartSizes {
  static is(value: unknown): value is PartSize {
    return (PART_SIZES as readonly unknown[]).includes(value);
  }
}

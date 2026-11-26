// How big a person likes two parts of the app: the picture tiles (the cards of the lists: the bigger, the fewer in a row) and the small labels on them (free, price, offer, package). Each is a preference of the account
// (`tileSize`, `labelSize` on it), kept on the device too.

export const PART_SIZES = ['small', 'medium', 'large'] as const;
export type PartSize = (typeof PART_SIZES)[number];

/** the parts that have a size of their own, by the name it has on the account */
export const SIZED_PARTS = ['tileSize', 'labelSize'] as const;
export type SizedPart = (typeof SIZED_PARTS)[number];

/** what a person has who has chosen nothing */
export const DEFAULT_PART_SIZE: PartSize = 'medium';

export class PartSizes {
  static is(value: unknown): value is PartSize {
    return (PART_SIZES as readonly unknown[]).includes(value);
  }
}

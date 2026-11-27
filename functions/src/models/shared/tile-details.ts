// How much the picture tiles (the cards of the lists) tell besides the picture, a preference of the account (`tileDetails` on it), kept on the device too:
// `none` only the picture (who it is from is stamped on it in every grade); `short` the name and, for a ready jigsaw, the number of pieces and the difficulty; `details` also the categories, when it was added and the marks
// after the name; `full` also the picture's description.

export const TILE_DETAILS = ['none', 'short', 'details', 'full'] as const;
export type TileDetail = (typeof TILE_DETAILS)[number];

/** what a person has who has chosen nothing */
export const DEFAULT_TILE_DETAIL: TileDetail = 'full';

export class TileDetailLevels {
  static is(value: unknown): value is TileDetail {
    return (TILE_DETAILS as readonly unknown[]).includes(value);
  }

  /** A choice as it is read (undefined: none). An earlier version kept a yes or no, "show the details": yes was what is now `full`, no is `short`. */
  static of(value: unknown): TileDetail | undefined {
    if (typeof value === 'boolean') return value ? 'full' : 'short';
    return TileDetailLevels.is(value) ? value : undefined;
  }
}

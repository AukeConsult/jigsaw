// How a person likes the play area of a puzzle: the table the pieces lie on, and whether a piece that clicks into place is heard. A preference of the account (`playLook` on it), kept on the device too. It is only looks and
// sound: no rule of where a piece goes.

/** The surfaces the pieces can lie on: plain white, the app's own look (jigsaw), something like a table, the colours of a season, or of a mood. */
export const TABLES = ['plain', 'jigsaw', 'felt', 'wood', 'linen', 'spring', 'summer', 'autumn', 'winter', 'calm', 'angry'] as const;
export type Table = (typeof TABLES)[number];

export interface PlayLookSetup {
  table: Table;
  sound: boolean;
}

/** what a person has who has chosen nothing */
export const DEFAULT_PLAY_LOOK: PlayLookSetup = { table: 'spring', sound: true };

export class PlayLooks {
  static isTable(value: unknown): value is Table {
    return (TABLES as readonly unknown[]).includes(value);
  }

  /** The value is a whole choice: a table that is known, and the sound on or off. */
  static is(value: unknown): value is PlayLookSetup {
    return !!value && typeof value === 'object' && PlayLooks.isTable((value as PlayLookSetup).table) && typeof (value as PlayLookSetup).sound === 'boolean';
  }

  /** What is saved of it: only the known fields. */
  static stored(value: PlayLookSetup): PlayLookSetup {
    return { table: value.table, sound: value.sound };
  }
}

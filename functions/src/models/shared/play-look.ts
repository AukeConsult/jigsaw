// How a person likes the play area of a puzzle: the table the pieces lie on, how the pieces look, the effects, and what is heard. A preference of the account (`playLook` on it), kept on the device too, and a round can have its own.
// It is only looks and sound: no rule of where a piece goes.

/** The surfaces the pieces can lie on: plain white, the app's own look (jigsaw), something like a table, the colours of a season, or of a mood. */
export const TABLES = ['plain', 'jigsaw', 'felt', 'wood', 'linen', 'spring', 'summer', 'autumn', 'winter', 'calm', 'angry'] as const;
export type Table = (typeof TABLES)[number];

/** How a piece is drawn (one at a time): classic is a soft shadow; cardboard has a thick, bevelled edge; flat has no depth at all. */
export const PIECE_STYLES = ['classic', 'cardboard', 'bevel', 'glossy', 'wood', 'grain', 'glass', 'flat'] as const;
export type PieceStyle = (typeof PIECE_STYLES)[number];

/** The effects, each on or off by itself, by when they are seen (or heard: `taps`). */
export const PIECE_EFFECT_GROUPS = {
  moving: ['glow', 'lean', 'bounce', 'magnet', 'trail'],
  clicking: ['ring', 'sparkle', 'flash', 'ripple'],
  milestones: ['border', 'halfway', 'cutfade', 'shine', 'confetti'],
  sounds: ['taps'],
} as const;
export type PieceEffectGroup = keyof typeof PIECE_EFFECT_GROUPS;
export type PieceEffect = (typeof PIECE_EFFECT_GROUPS)[PieceEffectGroup][number];
export const PIECE_EFFECTS: readonly PieceEffect[] = Object.values(PIECE_EFFECT_GROUPS).flat();

/** What a click into place sounds like: the app's own click-thock, wood, cardboard or a chime. */
export const SOUND_STYLES = ['click', 'wood', 'cardboard', 'chime'] as const;
export type SoundStyle = (typeof SOUND_STYLES)[number];

export interface PlayLookSetup {
  table: Table;
  sound: boolean;
  pieces: PieceStyle;
  effects: PieceEffect[];
  soundStyle: SoundStyle;
}

/** what a person has who has chosen nothing */
export const DEFAULT_PLAY_LOOK: PlayLookSetup = { table: 'spring', sound: true, pieces: 'classic', effects: ['ring'], soundStyle: 'click' };

export class PlayLooks {
  static isTable(value: unknown): value is Table {
    return (TABLES as readonly unknown[]).includes(value);
  }

  static isPieceStyle(value: unknown): value is PieceStyle {
    return (PIECE_STYLES as readonly unknown[]).includes(value);
  }

  static isSoundStyle(value: unknown): value is SoundStyle {
    return (SOUND_STYLES as readonly unknown[]).includes(value);
  }

  static isEffects(value: unknown): value is PieceEffect[] {
    return Array.isArray(value) && value.every((effect) => (PIECE_EFFECTS as readonly unknown[]).includes(effect));
  }

  /** The value is a choice that can be kept: a table that is known and the sound on or off; the rest may be left out (an older choice), but is known when it is there. */
  static is(value: unknown): value is Pick<PlayLookSetup, 'table' | 'sound'> & Partial<PlayLookSetup> {
    if (!value || typeof value !== 'object') return false;
    const { table, sound, pieces, effects, soundStyle } = value as Partial<PlayLookSetup>;
    return (
      PlayLooks.isTable(table) &&
      typeof sound === 'boolean' &&
      (pieces === undefined || PlayLooks.isPieceStyle(pieces)) &&
      (effects === undefined || PlayLooks.isEffects(effects)) &&
      (soundStyle === undefined || PlayLooks.isSoundStyle(soundStyle))
    );
  }

  /** What is saved of it: only the known fields, whole (what was left out is the usual), each effect once and in the order of the list. */
  static stored(value: Pick<PlayLookSetup, 'table' | 'sound'> & Partial<PlayLookSetup>): PlayLookSetup {
    const effects = value.effects ?? DEFAULT_PLAY_LOOK.effects;
    return {
      table: value.table,
      sound: value.sound,
      pieces: value.pieces ?? DEFAULT_PLAY_LOOK.pieces,
      effects: PIECE_EFFECTS.filter((effect) => effects.includes(effect)),
      soundStyle: value.soundStyle ?? DEFAULT_PLAY_LOOK.soundStyle,
    };
  }

  /** The effects with one switched on or off. */
  static withEffect(effects: readonly PieceEffect[], effect: PieceEffect, on: boolean): PieceEffect[] {
    return PIECE_EFFECTS.filter((e) => (e === effect ? on : effects.includes(e)));
  }
}

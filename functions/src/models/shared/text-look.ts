// How a person likes the text of the app: how big, and in which kind of letters. A preference of the account (`textLook` on it), kept on the device too. Every size of text comes from one basic size and every family
// from one basic family (`styles.scss`), so these two choices change all of it.

/** the basic size of the text, from the smallest */
export const TEXT_SIZES = ['small', 'normal', 'large', 'larger'] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

/** the basic kind of letters */
export const FONTS = ['standard', 'clear', 'serif', 'playful'] as const;
export type Font = (typeof FONTS)[number];

export interface TextLookSetup {
  size: TextSize;
  font: Font;
}

/** what a person has who has chosen nothing */
export const DEFAULT_TEXT_LOOK: TextLookSetup = { size: 'normal', font: 'playful' };

export class TextLooks {
  /** The value is a whole choice: a size and a font that are known. */
  static is(value: unknown): value is TextLookSetup {
    if (!value || typeof value !== 'object') return false;
    const { size, font } = value as TextLookSetup;
    return (TEXT_SIZES as readonly unknown[]).includes(size) && (FONTS as readonly unknown[]).includes(font);
  }

  /** What is saved of it: only the known fields. */
  static stored(value: TextLookSetup): TextLookSetup {
    return { size: value.size, font: value.font };
  }
}

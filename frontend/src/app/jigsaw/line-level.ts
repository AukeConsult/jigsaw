/**
 * How thick the line round the pieces and round the picture area is, in words: the choices of the line (stored in the jigsaw as the number of pixels). The line is
 * drawn that many pixels on the screen, so it looks the same on a big window and a small one (the board is scaled to the window).
 */
export const LINE_LEVELS = [
  { label: 'None', width: 0 },
  { label: 'Hairline', width: 1 },
  { label: 'Thin', width: 2 },
  { label: 'Medium', width: 3 },
  { label: 'Thick', width: 5 },
] as const;

/** The level a line width is closest to (a jigsaw made with another number is shown as the nearest level until another is chosen). */
export function lineLevelOf(width: number): number {
  return LINE_LEVELS.reduce((best, level) => (Math.abs(level.width - width) < Math.abs(best.width - width) ? level : best)).width;
}

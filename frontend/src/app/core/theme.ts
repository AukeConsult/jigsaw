/**
 * The tokens of the look (`styles.scss`, the CSS variables `--app-*`) for code that cannot use a class: what is drawn on a `<canvas>` (the grid, the graphic of a
 * piece) and what depends on the width of the screen. Everything else takes its look from a class in `styles.scss`.
 */

/** The value of a token (`--app-grid-dot`), or `fallback` when there is none (the stylesheet is not there). */
export function cssVar(name: string, fallback = ''): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch {
    return fallback;
  }
}

/** The value of a token that is a number (`--app-grid-number-size: 10`, or `768px`: the unit is left out). */
export function cssNumber(name: string, fallback: number): number {
  const value = parseFloat(cssVar(name));
  return Number.isFinite(value) ? value : fallback;
}

/** Whether the screen is as wide as the layout of a wide screen needs (the sidebar docked at the left): from the width `--app-bp-md` up. */
export function isWideScreen(): boolean {
  return window.matchMedia(`(min-width: ${cssNumber('--app-bp-md', 768)}px)`).matches;
}

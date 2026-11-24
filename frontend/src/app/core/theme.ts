import type { DestroyRef } from '@angular/core';
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

/** Where the menu begins when it is at the bottom of the screen (the footer), else the bottom of the screen: the working area of a round must end here and never go below it (rule 6 of the board). */
export function footerTop(): number {
  const bar = document.querySelector('.app-navbar')?.getBoundingClientRect();
  return bar && bar.top > window.innerHeight / 2 ? Math.floor(bar.top) : window.innerHeight;
}

/** The nearest parent of an element that scrolls up and down (the page on a phone or a small tablet), or null when it is the window. */
export function scrollParent(element: Element): Element | null {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    const overflow = getComputedStyle(parent).overflowY;
    if ((overflow === 'auto' || overflow === 'scroll') && parent.scrollHeight > 0) return parent;
  }
  return null;
}

/** Runs `measure` whenever anything scrolls, the window or the page that scrolls inside it (a scroll does not bubble, so it is listened for on the way down). Stopped when the owner is destroyed. */
export function onAnyScroll(destroyRef: DestroyRef, measure: () => void): void {
  window.addEventListener('scroll', measure, { capture: true, passive: true });
  destroyRef.onDestroy(() => window.removeEventListener('scroll', measure, true));
}

/** Whether the screen is as wide as the layout of a wide screen needs (the sidebar docked at the left): from the width `--app-sidebar-fold` up. */
export function isWideScreen(): boolean {
  return window.matchMedia(`(min-width: ${cssNumber('--app-sidebar-fold', 1200)}px)`).matches;
}

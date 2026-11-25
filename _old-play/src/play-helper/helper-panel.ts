import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { PlayCircumstances } from '../core/circumstances';
import { Helper, HelperPoint } from '../core/helper';
import { HELPERS } from './helpers';

/**
 * The one active helper, and what of it is open (the button of the helper opens and closes it). **There is always one active helper: the first of the list that fits the circumstances now.** The button (`play-helper`) and
 * the main area of the main page (`helper-main-views`) both read this, so the views are shown where the helper says (`Helper.show`): in a popup beside the button, or in a frame in the main area. A helper with points
 * (`Helper.points`) has the entries of its menu inside its button, and the views of the point that was chosen are the active ones; with one point only, the button opens that point. What is open is not kept: it
 * covers the page.
 */
@Injectable({ providedIn: 'root' })
export class HelperPanel {
  private readonly circumstances = inject(PlayCircumstances);

  /** the active helper: the one that fits the circumstances now */
  readonly helper = computed<Helper | undefined>(() => Helper.pick(HELPERS, this.circumstances.now()));
  /** the views are open */
  readonly open = signal(false);
  /** the point that was chosen (its place among the points that are there now) */
  readonly point = signal<number | null>(null);
  /** the points of the helper */
  readonly points = computed<readonly HelperPoint[]>(() => this.helper()?.points ?? []);
  /** the views that are shown now: the views of the point that was chosen, or the views of the helper when it has no points */
  readonly views = computed(() => {
    const helper = this.helper();
    if (!helper) return [];
    const points = this.points();
    if (!points.length) return helper.views;
    const chosen = this.point();
    return chosen === null || !points[chosen] ? [] : points[chosen].views;
  });
  /** the views are open, and in a popup */
  readonly inPopup = computed(() => this.open() && this.helper()?.show === 'popup');
  /** the views are open, and inside the main area of the main page */
  readonly inMain = computed(() => this.open() && this.helper()?.show === 'main');

  constructor() {
    // another helper is the active one now: what was open of the one before is closed, unless the views were open: then the new helper opens its own (its first point, or its views), so the person goes on from where
    // they were (a person who has signed in, an account that stops playing)
    effect(() => {
      this.helper();
      untracked(() => {
        if (!this.open()) return this.point.set(null);
        this.point.set(this.points().length ? 0 : null);
      });
    });
  }

  /** The button is pressed (a helper with at most one point: with more, its entries are inside it): it opens or closes the views, or the only point there is. */
  press(): void {
    if (this.open()) return this.close();
    if (this.points().length) this.choose(0);
    else if (this.helper()?.views.length) this.open.set(true); // a helper with nothing to open (the one that waits) opens nothing
  }

  /** An entry of the menu in the button is chosen: its views are the active ones (the entry that is open, pressed again, closes them). */
  choose(index: number): void {
    if (this.open() && this.point() === index) return this.close();
    this.point.set(index);
    this.open.set(true);
  }

  close(): void {
    this.open.set(false);
    this.point.set(null);
  }
}

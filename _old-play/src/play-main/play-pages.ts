import { Injectable, computed, effect, inject } from '@angular/core';
import { PlayCircumstances } from '../core/circumstances';
import { PlayPageEntry } from '../core/play-page';
import { PlayFront } from '../play-front/play-front';

/**
 * Every page the app has, in the order they are tried: the first that fits the circumstances is the page that is shown (as with the helpers, `helpers.ts`). To add a page, make a component that extends `PlayPage`
 * and put it in this list with the circumstances it is for.
 */
export const PLAY_PAGES: readonly PlayPageEntry[] = [{ component: PlayFront, title: 'Play', fits: () => true }];

/** The page that is shown now, controlled by the circumstances: the main page (`PlayMain`) shows it, and the title of the browser tab is its title (there is no router to set it). */
@Injectable({ providedIn: 'root' })
export class PlayPages {
  private readonly circumstances = inject(PlayCircumstances);

  /** the page that fits the circumstances now */
  readonly current = computed(() => PLAY_PAGES.find((page) => page.fits(this.circumstances.now())) ?? null);

  constructor() {
    effect(() => {
      const title = this.current()?.title;
      if (title) document.title = title;
    });
  }
}

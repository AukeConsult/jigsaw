import { Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { isInWrapper } from '../app/core/platform';
import { isBoolean, preferenceSignal } from '../app/core/preferences';

/** the address of a puzzle begins with this */
const PUZZLE = '/play/jigsaw/';

/**
 * **The puzzle on the whole screen**: a switch of the puzzle menu, and the choice is kept on the device (rule 12 of `CLAUDE.md`). A browser fills the screen only on a press, so with the choice on, the screen is
 * filled on the press that leads to a puzzle (Start the round, Continue, a round in a list), and given back when the person leaves the puzzle. Leaving it with the Esc key or the back gesture of the device
 * switches the choice off. A browser that cannot (an iPhone) and the native apps have no switch.
 */
@Injectable({ providedIn: 'root' })
export class FullScreen {
  private readonly router = inject(Router);
  /** whether there is a switch at all */
  readonly available = !!document.fullscreenEnabled && !isInWrapper();
  private readonly wanted = preferenceSignal('play.fullScreen', false, isBoolean);
  /** the screen is full now: what the switch shows */
  readonly on = signal(!!document.fullscreenElement);
  /** the screen was filled from here, and not yet given back */
  private ours = false;

  constructor() {
    if (!this.available) return;
    document.addEventListener('fullscreenchange', () => {
      const full = !!document.fullscreenElement;
      this.on.set(full);
      if (!full && this.ours) {
        // the person left it with the device's own way, not with the switch
        this.ours = false;
        this.wanted.set(false);
      }
    });
    this.router.events.subscribe((event) => {
      // (the press that leads there still counts while the navigation starts; a page that is loaded again has none, and the browser says no)
      if (event instanceof NavigationStart && event.url.startsWith(PUZZLE) && this.wanted()) void this.enter();
      if (event instanceof NavigationEnd && this.ours && !event.urlAfterRedirects.startsWith(PUZZLE)) void this.leave();
    });
  }

  /** The switch was pressed: the screen is filled or given back, and that is what the person wants from now on. */
  flip(): void {
    const on = !this.on();
    this.wanted.set(on);
    void (on ? this.enter() : this.leave());
  }

  private async enter(): Promise<void> {
    if (document.fullscreenElement) return;
    try {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      this.ours = true;
    } catch {
      /* the browser says no (no press just before): the page stays as it is */
    }
  }

  private async leave(): Promise<void> {
    this.ours = false; // so that leaving is not taken for the person's own way out
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
  }
}

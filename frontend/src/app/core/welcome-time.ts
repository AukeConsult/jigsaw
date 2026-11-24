import { DestroyRef, Injectable, inject, signal } from '@angular/core';

/** How long the welcome of the front page is shown after the app is opened, or after it is brought back from the menu (milliseconds): one minute. */
export const WELCOME_SHOWN_MS = 60 * 1000;

/**
 * Whether the welcome of the front page is shown now: for a minute after the app is opened, and again for a minute each time the person presses Welcome in the menu. Nothing is kept
 * on the device: Hide takes it away until the app is opened again, and there is no rule about hours or days. `visible` turns false by itself when the minute is over, wherever the
 * person is in the app. `forced` says it was brought back from the menu: it is then shown also when a round is going (the front page otherwise shows the welcome only when there is none).
 */
@Injectable({ providedIn: 'root' })
export class WelcomeTime {
  /** the welcome is shown */
  readonly visible = signal(true);
  /** the person pressed Welcome in the menu: the welcome is shown even when a round is going */
  readonly forced = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    this.start();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** The minute begins (again). */
  private start(): void {
    clearTimeout(this.timer);
    this.visible.set(true);
    this.timer = setTimeout(() => this.hide(), WELCOME_SHOWN_MS);
  }

  /** Show (Welcome in the menu): the welcome comes back at once, with a full minute, also when a round is going. */
  show(): void {
    this.forced.set(true);
    this.start();
  }

  /** Hide: the welcome goes away at once (until the app is opened again, or Welcome in the menu is pressed). */
  hide(): void {
    clearTimeout(this.timer);
    this.forced.set(false);
    this.visible.set(false);
  }
}

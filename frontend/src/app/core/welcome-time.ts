import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { WelcomeWindows } from '../models/shared/welcome-window';
import { readPreference, writePreference } from './preferences';

/** When the last time of the welcome began, and when the person last pressed Hide, kept on the device (`localStorage`). */
const STARTED_KEY = 'jigsaw.welcomeStarted';
const HIDDEN_KEY = 'jigsaw.welcomeHidden';
const isTime = (v: unknown): v is number | null => v === null || (typeof v === 'number' && Number.isFinite(v));

/**
 * Whether the welcome of the front page is shown now: for ten minutes after the app is opened, unless the person has pressed Hide (the rule is `WelcomeWindows`). Worked out once when
 * the app is opened; `visible` turns false by itself when the time is over, wherever the person is in the app, and at once on `hide()`.
 */
@Injectable({ providedIn: 'root' })
export class WelcomeTime {
  /** the welcome is shown */
  readonly visible = signal(false);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    const now = Date.now();
    const window = WelcomeWindows.at(readPreference<number | null>(STARTED_KEY, null, isTime), readPreference<number | null>(HIDDEN_KEY, null, isTime), now);
    writePreference(STARTED_KEY, window.startedAt);
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    if (window.visibleMs <= 0) return;
    this.visible.set(true);
    this.timer = setTimeout(() => this.visible.set(false), window.visibleMs);
  }

  /** Hide: the welcome goes away at once, and is marked as hidden (it stays away for 24 hours). */
  hide(): void {
    clearTimeout(this.timer);
    writePreference(HIDDEN_KEY, Date.now());
    this.visible.set(false);
  }
}

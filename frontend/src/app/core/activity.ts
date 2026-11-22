import { Injectable } from '@angular/core';
import { readPreference, writePreference } from './preferences';

/** How long the person has to be away before the app welcomes them back (milliseconds). */
export const AWAY_MS = 60 * 60 * 1000;
/** The time of the last thing the person did, kept on the device (`localStorage`). */
const ACTIVITY_KEY = 'jigsaw.lastActivity';
/** The time is written at most this often while the person is busy, so a drag does not write all the time. */
const WRITE_EVERY_MS = 10_000;

const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Knows when the person last did something in the app (a touch, a click or a key, on any page, also in another tab and before the page was opened). `awayLong` is worked out
 * once, when the app opens: it is true when it is the first time on this device or the last activity was more than an hour ago. It does not change while the app is open, so a
 * page that shows a welcome for the person who comes back does not lose it by the person's own first click.
 */
@Injectable({ providedIn: 'root' })
export class Activity {
  /** the last activity was more than an hour ago (or there is none on this device) when the app was opened */
  readonly awayLong: boolean;
  private lastWrite = 0;

  constructor() {
    const last = readPreference<number | null>(ACTIVITY_KEY, null, (v): v is number | null => v === null || isTime(v));
    this.awayLong = last === null || Date.now() - last > AWAY_MS;
    this.touch();
    for (const event of ['pointerdown', 'keydown', 'wheel', 'touchstart']) document.addEventListener(event, () => this.touch(), { passive: true });
    document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && this.touch(true));
  }

  /** Keeps the time of now (not more often than `WRITE_EVERY_MS`, unless it must be). */
  private touch(force = false): void {
    const now = Date.now();
    if (!force && now - this.lastWrite < WRITE_EVERY_MS) return;
    this.lastWrite = now;
    writePreference(ACTIVITY_KEY, now);
  }
}

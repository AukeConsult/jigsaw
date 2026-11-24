import { Injectable, inject } from '@angular/core';
import { NavigationStart, Router } from '@angular/router';
import { version } from '../../environments/version';
import { readSession, writeSession } from './session-storage';

/** How often an app that stays open asks which version is live (milliseconds). */
export const CHECK_EVERY_MS = 10 * 60 * 1000;
/** A check caused by coming back to the app is not made more often than this (milliseconds). */
const MIN_GAP_MS = 30 * 1000;
/** The version this tab has already reloaded for, so a live file that is ahead of the page (a deploy that is not through yet) never makes it reload in a loop. */
const RELOADED_FOR_KEY = 'jigsaw.reloadedFor';

/** A version as it is kept in `build-number.json` and written to `version.json` by `scripts/sync-version.mjs`. */
export interface AppVersion {
  readonly major: number;
  readonly minor: number;
  readonly number: number;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export const isAppVersion = (value: unknown): value is AppVersion => {
  const v = value as Partial<AppVersion> | null;
  return typeof v === 'object' && v !== null && isNumber(v.major) && isNumber(v.minor) && isNumber(v.number);
};
const isText = (value: unknown): value is string => typeof value === 'string';

/** Whether `live` is a later version than `mine`: the major, then the minor, then the build number decide. */
export function isNewer(live: AppVersion, mine: AppVersion): boolean {
  if (live.major !== mine.major) return live.major > mine.major;
  if (live.minor !== mine.minor) return live.minor > mine.minor;
  return live.number > mine.number;
}

/**
 * Keeps an app that stays open on the newest web app. The apps for Android and Windows show the live site, and a page that is open keeps the version it loaded, so
 * this asks for the small file `version.json` (made at every build, never cached) when the app opens, when the person comes back to it, and every ten minutes. When the
 * live version is newer the web app is loaded again. At the start and on coming back nothing is in the middle of being done, so it is loaded at once; found while the
 * person is working, it waits until they open another page (everything is saved by then). A development server never asks.
 */
@Injectable({ providedIn: 'root' })
export class AppUpdate {
  private readonly router = inject(Router);
  /** the newer version that is live, when the page is to be loaded again as the person goes to another page (null: none) */
  private waiting: string | null = null;
  private lastCheck = 0;

  constructor() {
    if (version.dev) return;
    void this.check(true);
    setInterval(() => document.visibilityState === 'visible' && void this.check(false), CHECK_EVERY_MS);
    const back = () => document.visibilityState === 'visible' && Date.now() - this.lastCheck > MIN_GAP_MS && void this.check(true);
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back); // a web view does not always say that the app is back in front
    this.router.events.subscribe((event) => {
      if (this.waiting !== null && event instanceof NavigationStart) this.reload(this.waiting, event.url);
    });
  }

  /** Asks which version is live; `now`: load again at once when it is newer, else when the person goes to another page. */
  private async check(now: boolean): Promise<void> {
    this.lastCheck = Date.now();
    try {
      const answer = await fetch(new URL('version.json', document.baseURI).href, { cache: 'no-store' });
      if (!answer.ok) return;
      const live: unknown = await answer.json();
      if (!isAppVersion(live) || !isNewer(live, version)) return;
      const name = `${live.major}.${live.minor}.${live.number}`;
      if (readSession(RELOADED_FOR_KEY, '', isText) === name) return; // already tried for this one: the page asked for is not the new one yet
      if (now) this.reload(name);
      else this.waiting = name;
    } catch {
      /* no answer (offline, a host that has no such file): the app stays as it is */
    }
  }

  /** Loads the web app again (it is noted that this was done for version `name`), on the page the person is on, or on `url` (the page they are going to). */
  private reload(name: string, url?: string): void {
    writeSession(RELOADED_FOR_KEY, name);
    if (url) window.location.assign(new URL(url, document.baseURI).href);
    else window.location.reload();
  }
}

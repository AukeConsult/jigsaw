/** How long the welcome of the front page is shown after the app is opened (milliseconds): ten minutes. */
export const WELCOME_SHOWN_MS = 10 * 60 * 1000;
/** How long the welcome stays away once it was hidden (milliseconds, counted from when the person pressed Hide), and, when it is not shown every time, from when it began to show: 24 hours. */
export const WELCOME_AWAY_MS = 24 * 60 * 60 * 1000;
/**
 * FOR NOW (to be able to show it in testing): the welcome is shown every time the app is opened, if it is not marked as hidden. Set to false to have it show only once in 24 hours
 * (`WELCOME_AWAY_MS`) as the rule is meant to be.
 */
export const WELCOME_EVERY_TIME = true;

/** What the welcome of the front page does at this moment: when its time began, and how much of it is left. */
export interface WelcomeWindow {
  /** when the time began (kept on the device, so the next opening knows) */
  startedAt: number;
  /** how long the welcome is still shown, from now (0: not shown) */
  visibleMs: number;
}

const valid = (t: number | null): t is number => t !== null && Number.isFinite(t);

/**
 * The rule of the welcome: it is shown for ten minutes after the app is opened, and the person can hide it at once (Hide); a welcome that was hidden stays away for 24 hours from
 * then. Normally it also stays away for 24 hours after it was shown; while `WELCOME_EVERY_TIME` is on, it is shown at every opening that is not hidden. A reload inside the ten
 * minutes shows what is left of them (when it is not every time).
 */
export class WelcomeWindows {
  /**
   * `startedAt` is when the last time began (null: never shown on this device), `hiddenAt` when the person last pressed Hide (null: never), `now` the time now.
   * `everyTime` says that every opening that is not hidden starts a new time (`WELCOME_EVERY_TIME`).
   */
  static at(startedAt: number | null, hiddenAt: number | null, now: number, everyTime: boolean = WELCOME_EVERY_TIME): WelcomeWindow {
    const hidden = valid(hiddenAt) && hiddenAt <= now && now - hiddenAt < WELCOME_AWAY_MS; // a time in the future (a clock set back) counts as no time
    const fresh = everyTime || !valid(startedAt) || startedAt > now || now - startedAt >= WELCOME_AWAY_MS;
    const began = fresh ? now : (startedAt as number);
    return { startedAt: began, visibleMs: hidden ? 0 : Math.max(0, WELCOME_SHOWN_MS - (now - began)) };
  }
}

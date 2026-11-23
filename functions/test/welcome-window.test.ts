import { describe, expect, it } from "vitest";
import { WELCOME_AWAY_MS, WELCOME_EVERY_TIME, WELCOME_SHOWN_MS, WelcomeWindows } from "../src/models";

describe("the welcome of the front page", () => {
  const now = 1_000_000_000_000;

  it("is shown for ten minutes", () => {
    expect(WELCOME_SHOWN_MS).toBe(10 * 60 * 1000);
    expect(WelcomeWindows.at(null, null, now)).toEqual({ startedAt: now, visibleMs: WELCOME_SHOWN_MS });
  });

  it("is shown at every opening for now, when it is not hidden", () => {
    expect(WELCOME_EVERY_TIME).toBe(true);
    expect(WelcomeWindows.at(now - 3600_000, null, now)).toEqual({ startedAt: now, visibleMs: WELCOME_SHOWN_MS });
    expect(WelcomeWindows.at(now - 60_000, null, now).visibleMs).toBe(WELCOME_SHOWN_MS);
  });

  it("is away at once when it was hidden, for 24 hours from then", () => {
    expect(WelcomeWindows.at(now, now - 1000, now).visibleMs).toBe(0);
    expect(WelcomeWindows.at(now, now - (WELCOME_AWAY_MS - 1), now).visibleMs).toBe(0);
    expect(WelcomeWindows.at(now, now - WELCOME_AWAY_MS, now).visibleMs).toBe(WELCOME_SHOWN_MS); // 24 hours have passed: it is shown again
  });

  it("when it is not every time: shows what is left of the ten minutes on a reload, and then stays away for 24 hours from when it began", () => {
    expect(WelcomeWindows.at(null, null, now, false)).toEqual({ startedAt: now, visibleMs: WELCOME_SHOWN_MS });
    expect(WelcomeWindows.at(now - 120_000, null, now, false)).toEqual({ startedAt: now - 120_000, visibleMs: WELCOME_SHOWN_MS - 120_000 });
    expect(WelcomeWindows.at(now - WELCOME_SHOWN_MS, null, now, false).visibleMs).toBe(0);
    expect(WelcomeWindows.at(now - (WELCOME_AWAY_MS - 1), null, now, false).visibleMs).toBe(0);
    expect(WelcomeWindows.at(now - WELCOME_AWAY_MS, null, now, false)).toEqual({ startedAt: now, visibleMs: WELCOME_SHOWN_MS });
  });

  it("does not trust a time in the future or one that is not a number", () => {
    expect(WelcomeWindows.at(now + 5000, null, now, false)).toEqual({ startedAt: now, visibleMs: WELCOME_SHOWN_MS });
    expect(WelcomeWindows.at(Number.NaN, Number.NaN, now, false).startedAt).toBe(now);
    expect(WelcomeWindows.at(null, now + 5000, now).visibleMs).toBe(WELCOME_SHOWN_MS); // a hide in the future is no hide
  });
});

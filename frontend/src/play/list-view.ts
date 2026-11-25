import { Injectable, WritableSignal, effect, inject, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../app/core/preferences';
import { PlaysService } from '../app/jigsaw/plays.service';

/** The switches of the home page, which the menu of the helper has: the rounds that are going, on the top, and only the user's favorites. */
export const LIST_TOGGLES = ['ongoing', 'favorites'] as const;
export type ListToggle = (typeof LIST_TOGGLES)[number];

/**
 * **What the home page shows**, as the player has switched it in the menu of the helper (`listMenu`): the band of the rounds that are going on the top of the list (`app-my-rounds` of the jigsaw app, the same band) and whether the list shows only the pictures the user has ticked as favorites (the filter `favorites`, the same as the jigsaw app's). The
 * page and the menu share them through this. What was chosen is kept on the device (rule 12 of `CLAUDE.md`), on to begin with.
 */
@Injectable({ providedIn: 'root' })
export class ListView {
  readonly ongoing = signal(readPreference('play.listOngoing', true, isBoolean));
  /** only the favorites of the user are listed (off to begin with) */
  readonly favorites = signal(readPreference('play.listFavorites', false, isBoolean));

  private readonly plays = inject(PlaysService);
  /** the user has rounds that are going: only then the menu offers the switch Ongoing rounds (there is nothing to show or hide otherwise) */
  readonly hasOngoing = signal(false);

  /** Reads whether the user (null: nobody plays) has a round that is not solved; the home page asks when it is opened and when another account plays. */
  async refresh(userId: string | null): Promise<void> {
    if (!userId) return this.hasOngoing.set(false);
    try {
      this.hasOngoing.set((await this.plays.ofUser(userId)).some((g) => g.play.status !== 'solved'));
    } catch {
      this.hasOngoing.set(false);
    }
  }

  constructor() {
    effect(() => writePreference('play.listOngoing', this.ongoing()));
    effect(() => writePreference('play.listFavorites', this.favorites()));
  }

  /** The switch, as a signal: on or off. */
  state(toggle: ListToggle): WritableSignal<boolean> {
    return toggle === 'favorites' ? this.favorites : this.ongoing;
  }
}

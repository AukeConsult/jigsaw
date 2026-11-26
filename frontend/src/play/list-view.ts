import { Injectable, effect, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../app/core/preferences';

/** The switch of the home page that the menu of the helper has: only the user's favorites. */
export type ListToggle = 'favorites';

/**
 * **What the home page shows**: the band of the rounds that are going on the top of the list (`app-my-rounds` of the jigsaw app, the same band; a switch of the preferences) and whether the list shows only the pictures the user has
 * ticked as favorites (a switch of the menu of the helper; the filter `favorites`, the same as the jigsaw app's). Kept on the device (rule 12 of `CLAUDE.md`).
 */
@Injectable({ providedIn: 'root' })
export class ListView {
  /** the rounds that are going are on the top of the list (on to begin with) */
  readonly ongoing = signal(readPreference('play.listOngoing', true, isBoolean));
  /** only the favorites of the user are listed (off to begin with) */
  readonly favorites = signal(readPreference('play.listFavorites', false, isBoolean));

  constructor() {
    effect(() => writePreference('play.listOngoing', this.ongoing()));
    effect(() => writePreference('play.listFavorites', this.favorites()));
  }
}

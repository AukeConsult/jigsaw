import { Injectable, WritableSignal, effect, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../app/core/preferences';

/** The switches of the page of a picture, which the menu of the helper has: the picture (its form) and the rounds of the picture. */
export const PICTURE_TOGGLES = ['picture', 'rounds'] as const;
export type PictureToggle = (typeof PICTURE_TOGGLES)[number];

/**
 * **What the page of a picture shows**, as the player has switched it in the menu of the helper (`pictureMenu`): the picture (the form to change it) and the rounds that have been played of it. The page and the menu share them
 * through this. What was chosen is kept on the device (rule 12 of `CLAUDE.md`), both on to begin with.
 */
@Injectable({ providedIn: 'root' })
export class PictureView {
  readonly picture = signal(readPreference('play.pictureShowsPicture', true, isBoolean));
  readonly rounds = signal(readPreference('play.pictureShowsRounds', true, isBoolean));

  constructor() {
    effect(() => writePreference('play.pictureShowsPicture', this.picture()));
    effect(() => writePreference('play.pictureShowsRounds', this.rounds()));
  }

  /** The switch, as a signal: on or off. */
  state(toggle: PictureToggle): WritableSignal<boolean> {
    return toggle === 'picture' ? this.picture : this.rounds;
  }
}

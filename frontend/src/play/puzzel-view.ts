import { Injectable, WritableSignal, effect, inject, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../app/core/preferences';
import { isWideScreen } from '../app/core/theme';
import { JigsawHelper } from '../app/jigsaw/jigsaw-helper';

/** The switches of the puzzle page, which the menu of the helper has: the help picture, the details, and the border pieces. */
export const PUZZEL_TOGGLES = ['help', 'details', 'edges'] as const;
export type PuzzelToggle = (typeof PUZZEL_TOGGLES)[number];

/**
 * **What the puzzle page shows**, as the player has switched it in the menu of the helper (`puzzelMenu`): the help picture (the one the board shows beside the pieces: the switch is the jigsaw's own, `JigsawHelper.helper`), the details of the
 * round (`app-puzzel-details`: beside the board on a wide screen, over it on a small one) and the border pieces (only the corner and edge pieces are shown in the store: the switch is the jigsaw's own, `JigsawHelper.edgesOnly`). The page and the menu share them through this. What was chosen for the details is kept on the device (rule 12 of `CLAUDE.md`), on to begin with.
 */
@Injectable({ providedIn: 'root' })
export class PuzzelView {
  private readonly helper = inject(JigsawHelper);
  readonly details = signal(readPreference('play.puzzelDetails', isWideScreen(), isBoolean)); // beside the board to begin with on a wide screen; on a small one they open over the board, so they begin closed

  constructor() {
    effect(() => writePreference('play.puzzelDetails', this.details()));
  }

  /** the puzzle that is open is finished (told by the page): the menu has no help picture and no border pieces then */
  readonly solved = signal(false);

  /** The switch, as a signal: on or off. */
  state(toggle: PuzzelToggle): WritableSignal<boolean> {
    return toggle === 'help' ? this.helper.helper : toggle === 'details' ? this.details : this.helper.edgesOnly;
  }
}

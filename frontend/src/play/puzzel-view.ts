import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { JigsawHelper } from '../app/jigsaw/jigsaw-helper';

/** The switches of the puzzle page, which the menu of the helper has: the help picture, the details, and the border pieces. */
export const PUZZEL_TOGGLES = ['help', 'details', 'edges', 'look'] as const;
export type PuzzelToggle = (typeof PUZZEL_TOGGLES)[number];

/**
 * **What the puzzle page shows**, as the player has switched it in the menu of the helper (`jigsawMenu`): the help picture (the one the board shows beside the pieces: the switch is the jigsaw's own, `JigsawHelper.helper`), the border
 * pieces (only the corner and edge pieces are shown in the store: `JigsawHelper.edgesOnly`), and two panels that lie over the puzzle: the details of the round (`app-puzzel-details`) and its table and sound (`app-round-look`). The page and
 * the menu share them through this. A panel covers the puzzle, so whether it is open is not kept (rule 12 of `CLAUDE.md`): both begin closed.
 */
@Injectable({ providedIn: 'root' })
export class PuzzelView {
  private readonly helper = inject(JigsawHelper);
  /** the panel with the details of the round */
  readonly details = signal(false);
  /** the panel with the table and the sound of this round */
  readonly look = signal(false);

  /** the puzzle that is open is finished (told by the page): the menu has no help picture and no border pieces then, and the board shows neither */
  readonly solved = this.helper.solved;

  /** The switch, as a signal: on or off. */
  state(toggle: PuzzelToggle): WritableSignal<boolean> {
    return toggle === 'help' ? this.helper.helper : toggle === 'details' ? this.details : toggle === 'look' ? this.look : this.helper.edgesOnly;
  }
}

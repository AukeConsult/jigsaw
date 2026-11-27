import { Injectable, signal } from '@angular/core';
import { isBoolean, preferenceSignal } from '../core/preferences';

/** The switches of the puzzle: the menu of the app has them (`PuzzelView`) and the board follows them, so what they share is here. The two choices of the player are kept on the device. */
@Injectable({ providedIn: 'root' })
export class JigsawHelper {
  /** whether the helper picture is shown (on to begin with) */
  readonly helper = preferenceSignal('jigsaw.helper', true, isBoolean);
  /** whether only the corner and edge pieces are shown (off to begin with) */
  readonly edgesOnly = preferenceSignal('jigsaw.edgesOnly', false, isBoolean);
  /** the round that is open is completed (told by the page): there is no helper picture then, and every piece is shown */
  readonly solved = signal(false);
}

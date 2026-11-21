import { Injectable, effect, signal } from '@angular/core';
import { isBoolean, readSession, writeSession } from '../core/session-storage';

/**
 * The helper of the jigsaw: the switches in the top menu (the helper picture, only corner and edge pieces) and the Collect pieces button. The menu is in the
 * jigsaw shell and the pieces are on the board, so what they share is here: the switches (kept for the session, so they are as the person left them when the
 * page is reloaded or left and come back to), what the board tells the menu (whether the helper is on this page, whether there is a picture and pieces, how many
 * pieces are shown), and a request to collect the pieces that the board answers.
 */
@Injectable({ providedIn: 'root' })
export class JigsawHelper {
  /** whether the helper picture is shown (on to begin with) */
  readonly helper = signal(readSession('jigsaw.helper', true, isBoolean));
  /** whether only the corner and edge pieces are shown (off to begin with) */
  readonly edgesOnly = signal(readSession('jigsaw.edgesOnly', false, isBoolean));

  /** told by the board: the page has the helper (the menu shows it only then), a picture to show, and pieces */
  readonly active = signal(false);
  readonly hasPicture = signal(false);
  readonly hasPieces = signal(false);
  /** how many pieces there are and how many of them are shown */
  readonly counts = signal({ shown: 0, total: 0 });
  /** whether there are pieces in the store that Collect pieces can put together */
  readonly canCollect = signal(false);

  /** how many times the menu has asked for the pieces to be collected: the board collects when it changes */
  readonly collectRequests = signal(0);

  constructor() {
    effect(() => writeSession('jigsaw.helper', this.helper()));
    effect(() => writeSession('jigsaw.edgesOnly', this.edgesOnly()));
  }

  /** Asks the board to put the pieces in the store together at the top of it. */
  collect(): void {
    this.collectRequests.update((n) => n + 1);
  }
}

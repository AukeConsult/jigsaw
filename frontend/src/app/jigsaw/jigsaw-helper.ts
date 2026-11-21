import { Injectable, effect, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../core/preferences';
import { readSession, writeSession } from '../core/session-storage';

/**
 * The helper of the jigsaw: the switches in the top menu (the helper picture, only corner and edge pieces) and the button that opens the sidebar. The menu is in the
 * jigsaw shell and the pieces are on the board, so what they share is here: the switches (kept for the session, so they are as the person left them when the
 * page is reloaded or left and come back to), what the board tells the menu (whether the helper is on this page, whether there is a picture and pieces, how many
 * pieces are shown).
 */
@Injectable({ providedIn: 'root' })
export class JigsawHelper {
  /** whether the helper picture is shown (on to begin with) */
  readonly helper = signal(readPreference('jigsaw.helper', true, isBoolean));
  /** whether only the corner and edge pieces are shown (off to begin with) */
  readonly edgesOnly = signal(readPreference('jigsaw.edgesOnly', false, isBoolean));

  /** whether the sidebar of the jigsaw is open: on a narrow screen it is folded away until the menu opens it (on a wide screen it is always there) */
  readonly sidebarOpen = signal(readSession('jigsaw.sidebarOpen', false, isBoolean));

  /** told by the board: the page has the helper (the menu shows it only then), a picture to show, and pieces */
  readonly active = signal(false);
  readonly hasPicture = signal(false);
  readonly hasPieces = signal(false);
  /** the time played in the round that is open, as a clock (null: no round with a clock is open); the menu shows it */
  readonly clock = signal<string | null>(null);
  /** how many pieces there are and how many of them are shown */
  readonly counts = signal({ shown: 0, total: 0 });

  constructor() {
    effect(() => writePreference('jigsaw.helper', this.helper()));
    effect(() => writePreference('jigsaw.edgesOnly', this.edgesOnly()));
    effect(() => writeSession('jigsaw.sidebarOpen', this.sidebarOpen()));
  }
}

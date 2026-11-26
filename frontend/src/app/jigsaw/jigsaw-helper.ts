import { Injectable, effect, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference, preferenceSignal } from '../core/preferences';
import { readSession, writeSession } from '../core/session-storage';

const HELPER_KEY = 'jigsaw.helperByJigsaw';
interface HelperState {
  helper: boolean;
  edgesOnly: boolean;
}
const isStateMap = (v: unknown): v is Record<string, HelperState> =>
  typeof v === 'object' && v !== null && Object.values(v).every((s) => typeof s === 'object' && s !== null && isBoolean((s as HelperState).helper) && isBoolean((s as HelperState).edgesOnly));

/**
 * The helper of the jigsaw: the switches in the top menu (the helper picture, only corner and edge pieces) and the button that opens the sidebar. The menu is in the
 * jigsaw shell and the pieces are on the board, so what they share is here: the switches (kept for the session, so they are as the person left them when the
 * page is reloaded or left and come back to), what the board tells the menu (whether the helper is on this page, whether there is a picture and pieces, how many
 * pieces are shown).
 */
@Injectable({ providedIn: 'root' })
export class JigsawHelper {
  /** whether the helper picture is shown (on to begin with) */
  readonly helper = preferenceSignal('jigsaw.helper', true, isBoolean);
  /** whether only the corner and edge pieces are shown (off to begin with) */
  readonly edgesOnly = preferenceSignal('jigsaw.edgesOnly', false, isBoolean);

  /** whether the sidebar of the jigsaw is open: on a narrow screen it is folded away until the menu opens it (on a wide screen it is always there) */
  readonly sidebarOpen = signal(readSession('jigsaw.sidebarOpen', false, isBoolean));

  /** told by the board: the page has the helper (the menu shows it only then), a picture to show, and pieces */
  readonly active = signal(false);
  readonly hasPicture = signal(false);
  readonly hasPieces = signal(false);
  /** the time played in the round that is open, as a clock (null: no round with a clock is open); the menu shows it */
  readonly clock = signal<string | null>(null);
  /** the name of the player whose round is looked at (another player's round: the menu shows it); null when the round is the person's own, or none is open */
  readonly viewing = signal<string | null>(null);
  /** the round that is open is completed (every piece is in its place): the switches of the helper are not needed and are turned off; told by the round */
  readonly solved = signal(false);
  /** how many pieces there are and how many of them are shown */
  readonly counts = signal({ shown: 0, total: 0 });

  /** the jigsaw whose switches these are now (null: none open); the menu links to its page */
  readonly current = signal<string | null>(null);
  private jigsawId: string | null = null;

  /** Opens a jigsaw: its switches are as the person left them the last time it was open; a jigsaw never opened keeps the switches as they are (the last choice). */
  open(id: string): void {
    this.jigsawId = id || null;
    this.current.set(this.jigsawId);
    const saved = this.jigsawId ? readPreference<Record<string, HelperState>>(HELPER_KEY, {}, isStateMap)[this.jigsawId] : undefined;
    if (!saved) return;
    this.helper.set(saved.helper);
    this.edgesOnly.set(saved.edgesOnly);
  }

  constructor() {
    effect(() => {
      const state = { helper: this.helper(), edgesOnly: this.edgesOnly() };
      const id = this.jigsawId;
      if (!id) return;
      const all = readPreference<Record<string, HelperState>>(HELPER_KEY, {}, isStateMap);
      writePreference(HELPER_KEY, { ...all, [id]: state });
    });
    effect(() => writeSession('jigsaw.sidebarOpen', this.sidebarOpen()));
  }
}

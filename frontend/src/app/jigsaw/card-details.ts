import { Injectable, effect, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../core/preferences';

/** Where the choice to show the details of the jigsaws is kept on the device (also another day). */
const CARD_DETAILS_KEY = 'jigsaw.cardDetailsOn';

/**
 * Whether the cards and the rows of the jigsaws show their details (the author, the categories, the motive and the date) or only what every card tells: the picture, the name, the pieces and the difficulty. One choice
 * for every list of jigsaws, made with the switch beside "Cards / List"; it is kept on the device and starts on.
 */
@Injectable({ providedIn: 'root' })
export class CardDetails {
  readonly on = signal(readPreference(CARD_DETAILS_KEY, true, isBoolean));

  constructor() {
    effect(() => writePreference(CARD_DETAILS_KEY, this.on()));
  }
}

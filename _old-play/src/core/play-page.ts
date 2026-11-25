import { Type } from '@angular/core';
import { Circumstances } from './circumstances';

/**
 * The base of every page of the app. **A page of the app is a play page: it is shown only by play itself, from the main page (`PlayMain`), and which one is shown is decided by the circumstances (`PlayPages`).**
 * The app never uses routing, so a page has no address and no link leads to it.
 */
export abstract class PlayPage {}

/** One page the app can show: its component, the title of the browser tab while it is shown, and the circumstances it is for. */
export interface PlayPageEntry {
  readonly component: Type<PlayPage>;
  readonly title: string;
  fits(circumstances: Circumstances): boolean;
}

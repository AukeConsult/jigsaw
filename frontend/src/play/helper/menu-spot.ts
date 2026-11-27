import { Injectable, computed, inject, signal } from '@angular/core';
import { readPreference, writePreference } from '../../app/core/preferences';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { keptWithAccount } from '../../app/jigsaw/kept-with-account';
import { DEFAULT_MENU_PLACE, MenuPlace } from '../../app/models/shared/menu-place';
import { SIDES, Side } from './menu-drag';

/** Where the menu was put: its top left corner, in pixels of the window, or the edge it is stuck to (the corner then says nothing). */
export interface Spot {
  x: number;
  y: number;
  side?: Side;
}

const SPOT_KEY = 'play.helperSpot';
const isSpot = (value: unknown): value is Spot => !!value && typeof value === 'object' && Number.isFinite((value as Spot).x) && Number.isFinite((value as Spot).y) && ((value as Spot).side === undefined || SIDES.includes((value as Spot).side!));
const sameSpot = (a: Spot, b: Spot): boolean => a.x === b.x && a.y === b.y && a.side === b.side;
/** the spot of a place chosen by its name: an edge, or floating in the lower right corner (far past it: the menu takes itself back inside the window) */
const spotOf = (place: MenuPlace): Spot => (place === 'floating' ? { x: window.innerWidth, y: window.innerHeight } : { x: 0, y: 0, side: place });

/**
 * **Where the menu of the app is** (`Helper` draws it, the preferences can choose it): kept on the device, and its place by name (left, right, top, bottom or floating) with the account, so another device has it the same way.
 * Until it is moved or chosen it is a bar down the left side.
 */
@Injectable({ providedIn: 'root' })
export class MenuSpot {
  private readonly users = inject(JigsawUserService);

  readonly spot = signal<Spot>(readPreference<Spot>(SPOT_KEY, spotOf(DEFAULT_MENU_PLACE), isSpot), { equal: sameSpot });
  readonly place = computed<MenuPlace>(() => this.spot().side ?? 'floating');
  private readonly keepWithAccount = keptWithAccount(this.users, (account) => account.menuPlace, (place) => this.show(place), () => void this.users.keep({ menuPlace: this.place() }));

  /** It was dragged there: kept on the device and with the account. */
  put(spot: Spot): void {
    this.keep(spot);
    this.keepWithAccount();
  }

  /** A place chosen in the preferences. */
  choose(place: MenuPlace): void {
    this.show(place);
    this.keepWithAccount();
  }

  /** The same place, a little elsewhere (the menu grew, or was taken back inside the window): the device's own. */
  keep(spot: Spot): void {
    this.spot.set(spot);
    writePreference(SPOT_KEY, spot);
  }

  private show(place: MenuPlace): void {
    if (place !== this.place()) this.keep(spotOf(place));
  }
}

// Where the menu of the app is, a preference of the account (`menuPlace` on it), kept on the device too: stuck to an edge of the window as a bar, or floating. (Where a floating one is, in pixels, is the device's own.)

export const MENU_PLACES = ['left', 'right', 'top', 'bottom', 'floating'] as const;
export type MenuPlace = (typeof MENU_PLACES)[number];

/** where it is for a person who has chosen nothing and never moved it */
export const DEFAULT_MENU_PLACE: MenuPlace = 'left';

export class MenuPlaces {
  static is(value: unknown): value is MenuPlace {
    return (MENU_PLACES as readonly unknown[]).includes(value);
  }
}

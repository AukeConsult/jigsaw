import { Type } from '@angular/core';
import { Circumstances } from './circumstances';
import { HelperMenu } from './helper-menu';
import { HelperView } from './helper-view';

/** A point of a helper's menu: its entry in the menu (`menu`, a `HelperMenu`) and the views it opens (`views`, `HelperView`s, one or more, shown one under the other). */
export interface HelperPoint {
  readonly menu: Type<HelperMenu>;
  readonly views: readonly Type<HelperView>[];
}

/** Where the views of a helper are shown when its button is pressed: in a popup beside the button, or inside the main area of the main page. */
export type HelperPlacement = 'popup' | 'main';

/**
 * A helper, the basic one. **There is always one active helper, the one that fits the circumstances now, and it holds everything the helper button has in that situation: the content of the button (`menu`) and
 * its views, directly (`views`) or behind the points of a menu (`points`).** The basic one: a menu, its views, and the circumstances it is for. `menu` is the component shown inside the button (`HelperMenu`); `points` are the entries of a menu that opens from it, each with a view of its own; `views` are the
 * components shown, one after the other, in the panel that opens when the button is pressed (`HelperView`). The basic helper has an empty menu and one empty view. A helper for a situation is a class
 * that extends this one and declares what it has (`menu`, `views`, `show`, `fits`), so a helper can have as many views as it needs, and the helper that floats over the app (`play-helper`) only
 * asks the one that fits the circumstances for them.
 */
export class Helper {
  /** the part shown inside the button */
  readonly menu: Type<HelperMenu> = HelperMenu;
  /** the views shown when the menu is pressed */
  readonly views: readonly Type<HelperView>[] = [HelperView];
  /**
   * the points of its menu, each with its own entry and its own views (none: the button opens `views` at once). With points, pressing the button shows the menu, and choosing a point opens the views of that point
   * (`views` is not used then).
   */
  readonly points: readonly HelperPoint[] = [];
  /** where the views are shown: in a popup beside the button (the basic one), or inside the main area of the main page (`main`) */
  readonly show: HelperPlacement = 'popup';

  /** whether this helper is for these circumstances (the basic one is for none) */
  fits(_circumstances: Circumstances): boolean {
    return false;
  }

  /** The helper for these circumstances: the first in the list that fits (so the more particular ones come first, and the last is for every case), or none. */
  static pick(helpers: readonly Helper[], circumstances: Circumstances): Helper | undefined {
    return helpers.find((helper) => helper.fits(circumstances));
  }
}

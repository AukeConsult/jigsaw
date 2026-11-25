import { Circumstances } from '../core/circumstances';
import { Helper } from '../core/helper';
import { CheckingMenu } from './checking-menu';

/**
 * The helper for the moment when the app is opened (a refresh, or a visit another day) and has not yet found out who is logged on and which account plays: a wait icon, with nothing to open. It gives way to the
 * helper that fits (the user helper for somebody who is logged on, the logon helper for nobody) as soon as the earlier login has been restored.
 */
export class CheckingHelper extends Helper {
  override readonly menu = CheckingMenu;
  override readonly views = [];

  override fits(circumstances: Circumstances): boolean {
    return !circumstances.known;
  }
}

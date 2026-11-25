import { Circumstances } from '../core/circumstances';
import { Helper } from '../core/helper';
import { AccountMenu } from './account-menu';
import { AccountView } from './account-view';
import { EditView } from './edit-view';
import { LogonView } from './logon-view';
import { VerifyView } from './verify-view';

/**
 * The helper for a person who is not logged on: nobody plays yet (circumstance 1). It starts as the user button of the website's menu does: "Who is on" in the button, and "Who plays?" in the views (choose an account, or make one by saying a name). From there the
 * form to log on is a step (`logon-view`), and an account that plays has its form with the logins verified for it (`edit-view`, `verify-view`). As soon as an account plays, the user helper (`UserHelper`) is the active one.
 */
export class LogonHelper extends Helper {
  override readonly menu = AccountMenu;
  override readonly show = 'main';
  override readonly views = [AccountView, EditView, VerifyView, LogonView];

  override fits(circumstances: Circumstances): boolean {
    return !circumstances.playing;
  }
}

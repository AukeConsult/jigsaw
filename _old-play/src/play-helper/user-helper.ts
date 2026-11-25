import { Circumstances } from '../core/circumstances';
import { Helper } from '../core/helper';
import { AccountMenu } from './account-menu';
import { AccountView } from './account-view';
import { EditView } from './edit-view';
import { LogonView } from './logon-view';
import { PictureMenu } from './picture-menu';
import { PictureView } from './picture-view';
import { PreferencesMenu } from './preferences-menu';
import { PreferencesView } from './preferences-view';
import { VerifyView } from './verify-view';

/**
 * The helper for a person who is logged on (circumstance 2). **A user is logged on when an account plays** (as in the website: the menu shows the name of the account), whether or not a Firebase login is signed in:
 * the login is only needed to lock an account or to use a locked one, and that is done inside the account (the point Account). **It is the one active helper whenever an account plays**, with everything in it. The button shows the name of the account that plays, and the menu is inside the button, as entries side by side. Its points are: the account (the form of the account and its logins, choose another, Sign out), one to add a
 * picture and one to set preferences (a dummy for now). Each point opens its own views in the main area.
 */
export class UserHelper extends Helper {
  override readonly menu = AccountMenu;
  override readonly points = [
    { menu: AccountMenu, views: [AccountView, EditView, VerifyView, LogonView] },
    { menu: PictureMenu, views: [PictureView] },
    { menu: PreferencesMenu, views: [PreferencesView] },
  ];
  override readonly show = 'main';

  override fits(circumstances: Circumstances): boolean {
    return circumstances.playing;
  }
}

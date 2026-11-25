import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES } from '../../app/core/language.service';
import { AccountAvatar } from '../../app/jigsaw/account-avatar/account-avatar';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { USERNAME_MAX, USERNAME_MIN, USER_NAME_MAX } from '../../app/models/shared/jigsaw-user';
import { HelperView } from '../core/helper-view';
import { AccountEdit } from './account-edit';
import { AccountState } from './account-state';

/** The form of the account that plays (a fresh copy of the website's Edit account form): the alias, the name, a picture and a language, saved by itself (`AccountEdit`). Shown while the form is open. */
@Component({
  selector: 'edit-view',
  imports: [TranslocoDirective, AccountAvatar],
  providers: [provideTranslocoScope('play')],
  templateUrl: './edit-view.html',
})
export class EditView extends HelperView {
  override readonly storageKey = 'play.editView';
  private readonly users = inject(JigsawUserService);
  private readonly state = inject(AccountState);
  /** only while an account plays and its form is open, and the sign-in is not in its place */
  override readonly visible = (): boolean => !!this.users.user() && this.edit.editing() && !this.state.logonOpen();

  protected readonly edit = inject(AccountEdit);
  protected readonly me = this.users.user;
  protected readonly languages = LANGUAGES;
  protected readonly usernameMin = USERNAME_MIN;
  protected readonly usernameMax = USERNAME_MAX;
  protected readonly nameMax = USER_NAME_MAX;
}

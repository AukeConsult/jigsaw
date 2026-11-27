import { Injectable, inject } from '@angular/core';
import { isBoolean } from '../core/preferences';
import { JigsawUserService } from './jigsaw-user.service';
import { accountChoice } from './kept-with-account';

/** **Whether pictures have their effects** (a switch of the preferences; the effects themselves are in `styles.scss`): on the device, and with the account that plays (`pictureEffects`). On to begin with. */
@Injectable({ providedIn: 'root' })
export class PictureEffects {
  private readonly users = inject(JigsawUserService);

  readonly on = accountChoice<boolean>(this.users, { key: 'jigsaw.pictureEffects', fallback: true, valid: isBoolean, theirs: (account) => account.pictureEffects, save: (pictureEffects) => this.users.keep({ pictureEffects }) });
}

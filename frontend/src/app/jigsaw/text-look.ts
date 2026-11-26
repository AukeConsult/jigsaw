import { Injectable, inject } from '@angular/core';
import { DEFAULT_TEXT_LOOK, TextLookSetup, TextLooks } from '../models/shared/text-look';
import { JigsawUserService } from './jigsaw-user.service';
import { accountChoice } from './kept-with-account';

/** **How big the player likes the text, and in which letters** (`TextLooks`): on the device, and with the account that plays (`textLook`). The main page of the app says it, and the stylesheet makes every text from it. */
@Injectable({ providedIn: 'root' })
export class TextLook {
  private readonly users = inject(JigsawUserService);
  private readonly choice = accountChoice<TextLookSetup>(this.users, { key: 'jigsaw.textLook', fallback: DEFAULT_TEXT_LOOK, valid: TextLooks.is, theirs: (account) => account.textLook, save: (textLook) => this.users.keep({ textLook }) });

  readonly value = this.choice.value;

  /** The player chooses: shown and kept on the device at once, and with the account a pause after the last choice. */
  set(choice: Partial<TextLookSetup>): void {
    this.choice.set({ ...this.value(), ...choice });
  }
}

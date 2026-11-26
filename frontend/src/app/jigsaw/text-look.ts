import { Injectable, inject, signal } from '@angular/core';
import { readPreference, writePreference } from '../core/preferences';
import { DEFAULT_TEXT_LOOK, TextLookSetup, TextLooks } from '../models/shared/text-look';
import { JigsawUserService } from './jigsaw-user.service';
import { keptWithAccount } from './kept-with-account';

/** **How big the player likes the text, and in which letters** (`TextLooks`): on the device, and with the account that plays (`textLook`). The main page of the app says it, and the stylesheet makes every text from it. */
@Injectable({ providedIn: 'root' })
export class TextLook {
  private readonly users = inject(JigsawUserService);

  readonly value = signal<TextLookSetup>(readPreference<TextLookSetup>('jigsaw.textLook', DEFAULT_TEXT_LOOK, TextLooks.is));

  private readonly keep = keptWithAccount(this.users, (account) => account.textLook, (look) => this.show(look), () => void this.users.saveTextLook(this.value()));

  /** The player chooses: shown and kept on the device at once, and with the account a pause after the last choice. */
  set(choice: Partial<TextLookSetup>): void {
    this.show({ ...this.value(), ...choice });
    this.keep();
  }

  private show(look: TextLookSetup): void {
    this.value.set(look);
    writePreference('jigsaw.textLook', look);
  }
}

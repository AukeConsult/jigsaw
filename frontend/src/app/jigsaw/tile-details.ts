import { Injectable, inject } from '@angular/core';
import { isBoolean } from '../core/preferences';
import { JigsawUserService } from './jigsaw-user.service';
import { accountChoice } from './kept-with-account';

/** **Whether the picture tiles tell their details** (description, categories, motive, author, date, the clock and who-sees-it marks): on the device, and with the account that plays (`tileDetails`). They do until the player says no. */
@Injectable({ providedIn: 'root' })
export class TileDetails {
  private readonly users = inject(JigsawUserService);
  private readonly choice = accountChoice(this.users, { key: 'jigsaw.tileDetails', fallback: true, valid: isBoolean, theirs: (account) => account.tileDetails, save: (tileDetails) => this.users.keep({ tileDetails }) });

  readonly shown = this.choice.value;

  /** The player chooses: shown and kept on the device at once, and with the account a pause after the last choice. */
  set(shown: boolean): void {
    this.choice.set(shown);
  }
}

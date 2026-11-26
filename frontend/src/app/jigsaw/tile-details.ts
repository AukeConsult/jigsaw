import { Injectable, inject, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../core/preferences';
import { JigsawUserService } from './jigsaw-user.service';
import { keptWithAccount } from './kept-with-account';

/** **Whether the picture tiles tell their details** (description, categories, motive, author, date, the clock and who-sees-it marks): on the device, and with the account that plays (`tileDetails`). They do until the player says no. */
@Injectable({ providedIn: 'root' })
export class TileDetails {
  private readonly users = inject(JigsawUserService);

  readonly shown = signal(readPreference('jigsaw.tileDetails', true, isBoolean));

  private readonly keep = keptWithAccount(this.users, (account) => account.tileDetails, (shown) => this.show(shown), () => void this.users.saveTileDetails(this.shown()));

  /** The player chooses: shown and kept on the device at once, and with the account a pause after the last choice. */
  set(shown: boolean): void {
    this.show(shown);
    this.keep();
  }

  private show(shown: boolean): void {
    this.shown.set(shown);
    writePreference('jigsaw.tileDetails', shown);
  }
}

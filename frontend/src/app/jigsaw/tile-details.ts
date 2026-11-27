import { Injectable, inject } from '@angular/core';
import { readPreference, writePreference } from '../core/preferences';
import { DEFAULT_TILE_DETAIL, TileDetail, TileDetailLevels } from '../models/shared/tile-details';
import { JigsawUserService } from './jigsaw-user.service';
import { accountChoice } from './kept-with-account';

const KEY = 'jigsaw.tileDetails';

/** **How much the picture tiles tell** (`TileDetailLevels`: none, short, details or full): on the device, and with the account that plays (`tileDetails`). Everything until the player chooses less. */
@Injectable({ providedIn: 'root' })
export class TileDetails {
  private readonly users = inject(JigsawUserService);
  private readonly choice;

  readonly value;

  constructor() {
    // a device where an earlier version kept a yes or no is brought up to date first, so the choice is not lost
    const old = readPreference<unknown>(KEY, null, (v): v is unknown => true);
    if (typeof old === 'boolean') writePreference(KEY, TileDetailLevels.of(old));
    this.choice = accountChoice<TileDetail>(this.users, { key: KEY, fallback: DEFAULT_TILE_DETAIL, valid: TileDetailLevels.is, theirs: (account) => TileDetailLevels.of(account.tileDetails), save: (tileDetails) => this.users.keep({ tileDetails }) });
    this.value = this.choice.value;
  }

  /** The player chooses: shown and kept on the device at once, and with the account a pause after the last choice. */
  set(level: TileDetail): void {
    this.choice.set(level);
  }
}

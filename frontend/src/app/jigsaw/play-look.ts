import { Injectable, computed, inject, signal } from '@angular/core';
import { isBoolean, readPreference, writePreference } from '../core/preferences';
import { DEFAULT_PLAY_LOOK, PlayLookSetup, PlayLooks, Table } from '../models/shared/play-look';
import { JigsawUserService } from './jigsaw-user.service';
import { keptWithAccount } from './kept-with-account';

/**
 * **How the player likes the play area**: the table the pieces lie on and whether a piece that clicks into place is heard (`PlayLooks`). A preference of the account: it is kept on the device at once (rule 12 of `CLAUDE.md`: there
 * before the account is read, and for nobody) and, when an account plays, with the account (`playLook`), so it is the same on every device. Another account that has a choice of its own brings it; one that has none leaves what
 * the device has. The board shows it; the account preferences and the details of a round have the choices.
 */
@Injectable({ providedIn: 'root' })
export class PlayLook {
  private readonly users = inject(JigsawUserService);

  readonly table = signal<Table>(readPreference<Table>('jigsaw.table', DEFAULT_PLAY_LOOK.table, PlayLooks.isTable));
  readonly sound = signal(readPreference('jigsaw.sound', DEFAULT_PLAY_LOOK.sound, isBoolean));

  private readonly keep = keptWithAccount(this.users, (account) => account.playLook, (look) => this.show(look), () => void this.users.keep({ playLook: this.value() }));

  /** the preference as one value */
  readonly value = computed<PlayLookSetup>(() => ({ table: this.table(), sound: this.sound() }));

  /** The player chooses: shown and kept on the device at once, and with the account a pause after the last choice. */
  set(choice: Partial<PlayLookSetup>): void {
    this.show({ table: this.table(), sound: this.sound(), ...choice });
    this.keep();
  }

  /** shown, and kept on the device: only what is chosen (by the player, or the account's choice) is kept, so somebody who has chosen nothing follows the default */
  private show(look: PlayLookSetup): void {
    this.table.set(look.table);
    this.sound.set(look.sound);
    writePreference('jigsaw.table', look.table);
    writePreference('jigsaw.sound', look.sound);
  }
}

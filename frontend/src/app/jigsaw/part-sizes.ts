import { Injectable, inject } from '@angular/core';
import { DEFAULT_PART_SIZE, PartSizes } from '../models/shared/part-size';
import { JigsawUserService } from './jigsaw-user.service';
import { accountChoice } from './kept-with-account';

/** **How big the player likes the picture tiles** (`PartSizes`): on the device, and with the account that plays (`tileSize`). The main page of the app says it, and the stylesheet puts more or fewer tiles in a row. */
@Injectable({ providedIn: 'root' })
export class PartSizeChoice {
  private readonly users = inject(JigsawUserService);

  readonly tileSize = accountChoice(this.users, { key: 'jigsaw.tileSize', fallback: DEFAULT_PART_SIZE, valid: PartSizes.is, theirs: (account) => account.tileSize, save: (tileSize) => this.users.keep({ tileSize }) });
}

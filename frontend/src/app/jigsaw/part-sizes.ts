import { Injectable, inject } from '@angular/core';
import { DEFAULT_PART_SIZE, PartSize, PartSizes, SizedPart } from '../models/shared/part-size';
import { JigsawUserService } from './jigsaw-user.service';
import { AccountChoice, accountChoice } from './kept-with-account';

/**
 * **How big the player likes the picture tiles and the small labels** (`PartSizes`): each on the device, and with the account that plays (`tileSize`, `labelSize`). The main page of the app says them, and the stylesheet puts more
 * or fewer tiles in a row and makes the labels bigger or smaller.
 */
@Injectable({ providedIn: 'root' })
export class PartSizeChoice {
  private readonly users = inject(JigsawUserService);

  readonly tileSize = this.of('tileSize');
  readonly labelSize = this.of('labelSize');

  private of(part: SizedPart): AccountChoice<PartSize> {
    return accountChoice(this.users, { key: `jigsaw.${part}`, fallback: DEFAULT_PART_SIZE, valid: PartSizes.is, theirs: (account) => account[part], save: (size) => this.users.keep({ [part]: size }) });
  }
}

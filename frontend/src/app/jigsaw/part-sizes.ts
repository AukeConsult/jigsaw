import { Injectable, Signal, inject, signal } from '@angular/core';
import { readPreference, writePreference } from '../core/preferences';
import { DEFAULT_PART_SIZE, PartSize, PartSizes, SizedPart } from '../models/shared/part-size';
import { JigsawUserService } from './jigsaw-user.service';
import { keptWithAccount } from './kept-with-account';

/** the choice of the size of one part: what it is, and choosing another */
export interface PartSizeChoiceOf {
  readonly value: Signal<PartSize>;
  set(size: PartSize): void;
}

/**
 * **How big the player likes the picture tiles and the small labels** (`PartSizes`): each on the device, and with the account that plays (`tileSize`, `labelSize`). The main page of the app says them, and the stylesheet puts more
 * or fewer tiles in a row and makes the labels bigger or smaller.
 */
@Injectable({ providedIn: 'root' })
export class PartSizeChoice {
  private readonly users = inject(JigsawUserService);

  readonly tileSize = this.of('tileSize');
  readonly labelSize = this.of('labelSize');

  private of(part: SizedPart): PartSizeChoiceOf {
    const key = `jigsaw.${part}`;
    const value = signal<PartSize>(readPreference<PartSize>(key, DEFAULT_PART_SIZE, PartSizes.is));
    const show = (size: PartSize): void => {
      value.set(size);
      writePreference(key, size);
    };
    const keep = keptWithAccount(this.users, (account) => account[part], show, () => void this.users.savePartSize(part, value()));
    return {
      value: value.asReadonly(),
      set: (size) => {
        show(size);
        keep();
      },
    };
  }
}

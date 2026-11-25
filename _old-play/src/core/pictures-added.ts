import { Injectable, signal } from '@angular/core';

/** A picture was added in the app: the lists of jigsaws (`play-cards`) read again when this changes. */
@Injectable({ providedIn: 'root' })
export class PicturesAdded {
  /** how many pictures were added since the app was opened */
  readonly count = signal(0);

  added(): void {
    this.count.update((n) => n + 1);
  }
}

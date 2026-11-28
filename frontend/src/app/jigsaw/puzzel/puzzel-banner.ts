import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PuzzelRound } from './puzzel-round';

/**
 * **The note in the middle of the picture when the round is finished** (every piece is in its place): it says so, with the time the round took when it has a clock, and fades away after a few seconds (the time stays
 * in the details of the round). The board puts it on the picture (`app-puzzel-board` hands it in), and it takes no clicks (`app-puzzel-banner` in `styles.scss`). It shows what the round (`PuzzelRound`, provided by
 * the page) has.
 */
@Component({
  selector: 'app-puzzel-banner',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay')],
  template: `
    <ng-container *transloco="let t">
      @if (round.solved()) {
        <div class="finished-note alert alert-success rounded-pill shadow fw-semibold text-nowrap mb-0" role="status">
          <i class="bi bi-trophy-fill me-2" aria-hidden="true"></i>{{ t('jigsawPlay.finishedTitle') || 'Finished!' }}
          @if (round.item()?.timed !== false) {
            <span class="fw-normal ms-2">{{ t('jigsawPlay.finishedTime', { time: round.clock() }) || 'Time: ' + round.clock() }}</span>
          }
        </div>
      }
    </ng-container>
  `,
})
export class PuzzelBanner {
  protected readonly round = inject(PuzzelRound);
}

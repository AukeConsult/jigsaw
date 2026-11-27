import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PuzzelRound } from './puzzel-round';

/**
 * **The band on top of the puzzle when the round is finished** (every piece is in its place): it says so, with the time the round took when it has a clock. It lies over the top of the puzzle (`app-puzzel-banner` in `styles.scss`), so the
 * board does not move when it comes. It shows what the round (`PuzzelRound`, provided by the page) has.
 */
@Component({
  selector: 'app-puzzel-banner',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay')],
  template: `
    <ng-container *transloco="let t">
      @if (round.solved()) {
        <div class="alert alert-success rounded-0 border-0 border-bottom mb-0 py-2 text-center fw-semibold" role="status">
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

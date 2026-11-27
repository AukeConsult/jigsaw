import { Component, computed, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PlayLookSetup } from '../../models/shared/play-look';
import { PlayLook } from '../play-look';
import { PlayLookChoice } from '../play-look-choice/play-look-choice';
import { PuzzelRound } from './puzzel-round';

/**
 * **The table and the sound of the round that is open.** A round follows the player's preference of the account until something is chosen here: that is then **this round's own, stored on the round**, over the preference; "Use my
 * preferences" takes it away again. The panel of the puzzle (the menu entry Table) shows it. Another player's round has nothing to choose.
 */
@Component({
  selector: 'app-round-look',
  imports: [TranslocoDirective, PlayLookChoice],
  providers: [provideTranslocoScope('jigsawPlay')],
  host: { class: 'd-block' },
  template: `
    <ng-container *transloco="let t">
      @if (round.play() && !round.viewOnly()) {
        <app-play-look-choice idPrefix="round" [value]="shown()" (changed)="choose($event)" />
        @if (round.ownLook()) {
          <p class="form-text mt-0 mb-2">{{ t('jigsawPlay.lookOwn') || 'Only for this round.' }}</p>
          <button type="button" class="btn btn-sm btn-outline-secondary mb-3" (click)="round.setLook(null)"><i class="bi bi-arrow-counterclockwise me-1" aria-hidden="true"></i>{{ t('jigsawPlay.lookReset') || 'Use my preferences' }}</button>
        } @else {
          <p class="form-text mt-0 mb-3">{{ t('jigsawPlay.lookFollows') || 'Follows your account preferences. What you choose here is for this round only.' }}</p>
        }
      }
    </ng-container>
  `,
})
export class RoundLook {
  protected readonly round = inject(PuzzelRound);
  private readonly preference = inject(PlayLook);
  /** what the round is shown with: its own, or the preference */
  protected readonly shown = computed(() => this.round.ownLook() ?? this.preference.value());

  /** One thing is chosen: the round has its own from now, the rest as it was shown. */
  protected choose(change: Partial<PlayLookSetup>): void {
    void this.round.setLook({ ...this.shown(), ...change });
  }
}

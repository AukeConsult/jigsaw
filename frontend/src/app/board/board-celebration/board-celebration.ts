import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** What is being celebrated now, over the picture area. */
export interface Celebration {
  /** a light runs round the picture: the border is done */
  border?: boolean;
  /** "Halfway there" */
  halfway?: boolean;
  /** a shine sweeps over the picture: finished */
  shine?: boolean;
  confetti?: boolean;
}

/** how many bits of confetti fall, and in how many colours (`.confetti[data-colour]` in `styles.scss`) */
const CONFETTI = 70;
const COLOURS = 5;

/** The effects for the milestones of a round, laid over the picture area (the board shows it only while something is celebrated). All of it lets the pointer through. */
@Component({
  selector: 'app-board-celebration',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawBoard')],
  host: { class: 'board-celebration' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ng-container *transloco="let t">
      @if (show().border) {
        <svg class="celebrate-border" aria-hidden="true"><rect width="100%" height="100%" pathLength="400" /></svg>
      }
      @if (show().shine) {
        <div class="celebrate-shine" aria-hidden="true"></div>
      }
      @if (show().confetti) {
        @for (bit of confetti; track $index) {
          <span class="confetti" aria-hidden="true" [attr.data-colour]="bit.colour" [style.left.%]="bit.left" [style.animation-delay.s]="bit.delay" [style.animation-duration.s]="bit.fall"></span>
        }
      }
      @if (show().halfway) {
        <span class="celebrate-word" role="status">{{ t('jigsawBoard.halfway') || 'Halfway there!' }}</span>
      }
    </ng-container>
  `,
})
export class BoardCelebration {
  readonly show = input.required<Celebration>();
  /** each bit falls from its own place, at its own moment and speed */
  protected readonly confetti = Array.from({ length: CONFETTI }, (_, i) => ({ colour: i % COLOURS, left: Math.random() * 100, delay: Math.random() * 1.2, fall: 1.8 + Math.random() * 1.4 }));
}

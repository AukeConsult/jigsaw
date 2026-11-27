import { DatePipe } from '@angular/common';
import { Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PlaySpec } from '../../models/shared/play';
import { clockOf } from '../duration';

/** One round of a jigsaw as a row of a list: who plays it, how far it is, the time, and Continue or Look (and Delete, asked first, for the player's own round). */
@Component({
  selector: 'app-round-row',
  imports: [RouterLink, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPage')],
  templateUrl: './round-row.html',
  host: { class: 'list-group-item round-row', '[class.round-solved]': "game().status === 'solved'" },
})
export class RoundRow {
  readonly game = input.required<PlaySpec>();
  readonly jigsawId = input.required<string>();
  /** the jigsaw has a clock: the time played is shown */
  readonly timed = input(true);
  /** the round is the user's own (the others can be looked at, not changed) */
  readonly mine = input(false);

  readonly remove = output<void>();

  /** Delete was pressed and waits for "Yes" */
  protected readonly confirming = signal(false);
  protected readonly clock = clockOf;

  /** where the round opens: the puzzle of the jigsaw */
  protected link(): string[] {
    return ['/play/jigsaw', this.jigsawId()];
  }

  /** the puzzle is told which round to open */
  protected query(): { round: string } {
    return { round: this.game().id };
  }
}

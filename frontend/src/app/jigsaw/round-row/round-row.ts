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
  /** the app's row: a round opens the puzzle of the app (`/play/jigsaw/:id`, with this round) and not the page of the website */
  readonly inApp = input(false);

  readonly remove = output<void>();

  /** Delete was pressed and waits for "Yes" */
  protected readonly confirming = signal(false);
  protected readonly clock = clockOf;

  /** where the round opens: the page of the round in the website, or the puzzle in the app */
  protected link(): string[] {
    return this.inApp() ? ['/play/jigsaw', this.jigsawId()] : ['/jigsaw', this.jigsawId(), 'play', this.game().id];
  }

  /** in the app the puzzle is told which round to open */
  protected query(): { round: string } | null {
    return this.inApp() ? { round: this.game().id } : null;
  }
}

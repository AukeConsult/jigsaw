import { Component, inject, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PlaySpec } from '../../models/shared/play';
import { PuzzelRound } from './puzzel-round';

/**
 * **The details of the round that is open**: the name of the jigsaw and who made it, how it is cut, how far the round has come, the time played (of a timed round), who sees the round, and what the player can do with it (reset it, delete it, the cheat that shows the numbers
 * of the places). It shows what the round (`PuzzelRound`, provided by the page) has and calls it; **the page decides where to go** when the round is deleted (`deleted`) or an own round is started (`own`: the new round, or nothing when the
 * jigsaw is a picture, which is cut as the person chooses).
 */
@Component({
  selector: 'app-puzzel-details',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPlay'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawNew'), provideTranslocoScope('jigsawShell')],
  templateUrl: './puzzel-details.html',
})
export class PuzzelDetails {
  protected readonly round = inject(PuzzelRound);

  /** the round was deleted for good */
  readonly deleted = output<void>();
  /** another player's round was being looked at and the player asked for their own: the new round, or null (a picture: its own page asks for the number of pieces) */
  readonly own = output<PlaySpec | null>();

  /** Reset round was pressed: the person is asked to approve before the pieces are scattered again */
  protected readonly confirmingStartOver = signal(false);
  /** Delete round was pressed: the person is asked to approve before the round is deleted */
  protected readonly confirmingDelete = signal(false);

  protected async startOver(): Promise<void> {
    this.confirmingStartOver.set(false);
    await this.round.startOver();
  }

  protected async deleteRound(): Promise<void> {
    this.confirmingDelete.set(false);
    if (await this.round.deleteRound()) this.deleted.emit();
  }

  protected async startOwn(): Promise<void> {
    if (this.round.isPicture()) return this.own.emit(null);
    const game = await this.round.startOwn();
    if (game) this.own.emit(game);
  }
}

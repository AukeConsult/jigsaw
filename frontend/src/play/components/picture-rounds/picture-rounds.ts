import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PlaysService } from '../../../app/jigsaw/plays.service';
import { RoundRow } from '../../../app/jigsaw/round-row/round-row';
import { PlaySpec } from '../../../app/models/shared/play';

/**
 * **The rounds that have been played of one picture**, framed into the page before the puzzle (`/play/round/:id`, everybody's picture) and into the page of a picture (`/play/mine/picture/:id`): the user's own first, a row each (`app-round-row`):
 * who played it, how far, the time, and Continue or Look, and Delete for the user's own round (asked first). A round that is another player's can be looked at, never changed. A press on a row opens the puzzle in the app with that round.
 * Which rounds are listed is the server's to say (a private round only to its player and an admin).
 */
@Component({
  selector: 'play-picture-rounds',
  imports: [TranslocoDirective, RoundRow],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  templateUrl: './picture-rounds.html',
})
export class PictureRounds implements OnInit {
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly jigsaws = inject(JigsawService);

  /** the picture whose rounds these are */
  readonly jigsawId = input.required<string>();
  /** nothing at all is shown while there is no round to list (the page already tells how much it has been played) */
  readonly quiet = input(false);
  /** a round of the user's own was deleted: what the page says about the picture may have changed */
  readonly removed = output<void>();
  /** the picture has a clock: the time played is shown (read with the rounds) */
  protected readonly timed = signal(true);

  /** the rounds, the user's own first (null: not read yet) */
  protected readonly games = signal<PlaySpec[] | null>(null);
  protected readonly failed = signal(false);

  ngOnInit(): void {
    void this.load();
  }

  /** Reads the rounds (again, when the page has taken some away). */
  async load(): Promise<void> {
    await this.users.load();
    this.timed.set((await this.jigsaws.get(this.jigsawId()).catch(() => null))?.timed !== false);
    try {
      const all = await this.plays.list(this.jigsawId());
      const me = this.users.acting();
      this.games.set([...all.filter((g) => g.userId === me?.id), ...all.filter((g) => g.userId !== me?.id)]);
      this.failed.set(false);
    } catch {
      this.failed.set(true);
      this.games.set([]);
    }
  }

  protected isMine(game: PlaySpec): boolean {
    return game.userId === this.users.acting()?.id;
  }

  /** A round of the user's own is deleted for good (the picture and the other rounds stay). */
  protected async remove(game: PlaySpec): Promise<void> {
    try {
      await this.plays.remove(this.jigsawId(), game.id);
      this.games.update((all) => (all ?? []).filter((g) => g.id !== game.id));
      this.removed.emit();
    } catch {
      this.failed.set(true);
    }
  }
}

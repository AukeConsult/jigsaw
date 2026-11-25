import { DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { clockOf } from '../duration';
import { ImageOf, JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { PlaysService, UserGame } from '../plays.service';

/**
 * **The list of the rounds the user has played**, the one list for the website's page of the user and for the app: a row for each round, with the picture, the name, going or solved and how many pieces are in place, when it was
 * started and the time played, and Continue (or Look, for a solved one) and Delete (asked first). Nothing played yet says so, with the ways to begin. With `inApp` it is the list of the app, which has no pages of the website to go to: a
 * round opens the puzzle in the app (`/play/jigsaw/:id`, where the round that is going is gone on with), and there is no link to the page where jigsaws are looked for.
 */
@Component({
  selector: 'app-my-round-list',
  imports: [DatePipe, RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawUser')],
  templateUrl: './my-round-list.html',
})
export class MyRoundList {
  protected readonly users = inject(JigsawUserService);
  private readonly plays = inject(PlaysService);
  private readonly images = inject(JigsawImageService);

  /** the list of the app: a round opens the puzzle of the app, and there is no link to the pages of the website */
  readonly inApp = input(false);

  /** a time played, as a clock (`12:34`) */
  protected readonly clock = clockOf;
  /** something went wrong (said above the list) */
  protected readonly error = signal('');
  /** the games of the user who plays, over all the jigsaws (null: not read yet) */
  protected readonly games = signal<UserGame[] | null>(null);
  protected readonly gamesFailed = signal(false);
  /** the jigsaws whose picture could not be read (an empty box is shown) */
  protected readonly noPicture = signal<ReadonlySet<string>>(new Set());
  /** the game whose Delete button was pressed and waits for "Yes" */
  protected readonly confirmingPlayId = signal<string | null>(null);

  constructor() {
    // the games are read when a user plays (and again when another user is chosen)
    effect(() => {
      const me = this.users.user();
      this.games.set(null);
      this.gamesFailed.set(false);
      if (me) void this.loadGames(me.id);
    });
  }

  private async loadGames(userId: string): Promise<void> {
    try {
      const games = await this.plays.ofUser(userId);
      if (this.users.user()?.id === userId) this.games.set(games);
    } catch {
      this.gamesFailed.set(true);
      this.games.set([]);
    }
  }

  /** Where a round opens: the page of the round in the website, or the puzzle of the jigsaw in the app. */
  protected link(jigsawId: string, playId: string): string[] {
    return this.inApp() ? ['/play/jigsaw', jigsawId] : ['/jigsaw', jigsawId, 'play', playId];
  }

  /** The game is deleted for good (the jigsaw and the other games stay). */
  protected async removeGame(game: UserGame): Promise<void> {
    this.confirmingPlayId.set(null);
    try {
      await this.plays.remove(game.jigsaw.id, game.play.id);
      this.games.update((all) => (all ?? []).filter((g) => g.play.id !== game.play.id));
    } catch {
      this.error.set(tr('jigsawUser.couldNotDelete', 'Could not delete the round: try again.'));
    }
  }

  protected pictureUrl(jigsaw: ImageOf): string {
    return this.images.url(jigsaw, 1);
  }

  protected lacksPicture(jigsawId: string): void {
    this.noPicture.update((now) => new Set([...now, jigsawId]));
  }
}

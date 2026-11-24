import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { RoundRow } from '../round-row/round-row';
import { JigsawHeader } from '../jigsaw-header/jigsaw-header';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { PlaysService } from '../plays.service';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawKinds } from '../../models/shared/jigsaw-kind';
import { PlayChoice, PlaySpec } from '../../models/shared/play';
import { RoundChoice } from '../round-choice/round-choice';

/**
 * A jigsaw (`/jigsaw/:id`): its picture and what it is, and the games the user has played of it. A game is continued where it was left, or a new one is started
 * (the pieces are scattered again, and the old game stays in the list). The jigsaw can be edited here: its name, its author and its defaults (the difficulty and the look a
 * new game starts with). Its picture, size and pieces are fixed: every game of it shares them.
 */
@Component({
  selector: 'app-jigsaw-page',
  imports: [RouterLink, TranslocoDirective, JigsawHeader, RoundRow, RoundChoice],
  providers: [provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-page.html',
})
export class JigsawPage implements OnInit {
  private readonly jigsaws = inject(JigsawService);
  private readonly plays = inject(PlaysService);
  private readonly router = inject(Router);
  protected readonly users = inject(JigsawUserService);
  private readonly route = inject(ActivatedRoute);
  readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  readonly item = signal<JigsawSpec | null>(null);
  readonly games = signal<PlaySpec[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  /** Delete (the jigsaw) was pressed and waits for "Yes" */
  readonly confirmingDelete = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const item = await this.jigsaws.get(this.id);
      if (!item) return this.status.set('missing');
      this.item.set(item);
      await this.users.load(); // who plays is known first (nobody is a possible answer: the page is for everybody)
      const me = this.users.acting();
      const all = await this.plays.list(this.id); // everyone's rounds: the ones of the user first, each newest first
      this.games.set([...all.filter((g) => g.userId === me?.id), ...all.filter((g) => g.userId !== me?.id)]);
      this.status.set('ready');
      if (this.route.snapshot.queryParamMap.get('edit')) this.edit(); // a link that opens the page for editing
    } catch {
      this.status.set('failed');
    }
  }

  /** only the owner account may edit and delete the jigsaw (the buttons are not shown to anybody else) */
  readonly mayChange = computed(() => {
    const me = this.users.acting();
    const owner = this.item()?.ownerUid;
    return !!me && !!owner && owner === me.id;
  });

  /** The jigsaw is deleted for good (its pieces, picture and rounds go too), and the person goes to the list. */
  async deleteJigsaw(): Promise<void> {
    const me = this.users.acting();
    if (!me || this.busy()) return;
    this.busy.set(true);
    try {
      await this.jigsaws.removeAs(this.id, me.id);
      await this.router.navigate(['/']);
    } catch {
      this.error.set(tr('jigsawPage.couldNotDelete', 'Could not delete the jigsaw: only its owner can.'));
      this.confirmingDelete.set(false);
      this.busy.set(false);
    }
  }

  /** the round is the user's own (the others can be looked at, not changed) */
  isMine(game: PlaySpec): boolean {
    return game.userId === this.users.acting()?.id;
  }

  /** Goes on with the user's newest round that is not solved, or starts a new one when there is none (the list has the user's own rounds first, each newest first). */
  /** the user who plays has solved this jigsaw: it is not played again (the solved round can be looked at, or deleted) */
  protected readonly solvedByMe = computed(() => {
    const me = this.users.acting();
    return !this.isPicture() && !!me && this.games().some((g) => g.userId === me.id && g.status === 'solved'); // a picture can be played again at another number of pieces
  });

  /** the entry is only a picture: a round is cut as the person chooses */
  protected readonly isPicture = computed(() => JigsawKinds.isPicture(this.item() ?? {}));
  /** the choice of pieces and difficulty is open */
  readonly choosing = signal(false);
  /** the numbers of pieces the user who plays has solved this picture at */
  protected readonly solvedSizes = computed(() => {
    const me = this.users.acting();
    return this.games().filter((g) => g.userId === me?.id && g.status === 'solved').map((g) => g.total);
  });

  async play(): Promise<void> {
    const me = this.users.acting();
    if (!me) {
      // a round needs somebody who is logged on: an account that needs a login is signed in to, else the person chooses or makes an account; they come back to this page
      const next = `/jigsaw/${this.id}`;
      if (this.users.user()) await this.router.navigate(['/login'], { queryParams: { notice: 'needlogin', next } });
      else await this.router.navigate(['/jigsaw/user'], { queryParams: { next } });
      return;
    }
    if (this.busy()) return;
    this.error.set('');
    const unfinished = this.games().find((g) => g.userId === me.id && g.status !== 'solved');
    if (!unfinished && this.isPicture()) return void this.choosing.set(true); // a picture is cut in the round: the person chooses the pieces and the difficulty first
    await this.begin(me.id, unfinished);
  }

  /** Goes on with the round that is going, or starts one (a picture with what was chosen), and opens it. */
  async begin(userId: string, unfinished?: PlaySpec, choice?: PlayChoice): Promise<void> {
    this.busy.set(true);
    try {
      if (unfinished) {
        await this.router.navigate(['/jigsaw', this.id, 'play', unfinished.id]);
        return;
      }
      const game = await this.plays.start(this.id, userId, choice);
      await this.router.navigate(['/jigsaw', this.id, 'play', game.id]);
    } catch (err) {
      this.error.set((err as { error?: { error?: string } })?.error?.error || tr('jigsawPage.couldNotStart', 'Could not start a round: try again.'));
      this.busy.set(false);
    }
  }

  /** The person chose the pieces and the difficulty of a round of the picture. */
  async startChosen(choice: PlayChoice): Promise<void> {
    const me = this.users.acting();
    if (me) await this.begin(me.id, undefined, choice);
  }

  async removeGame(game: PlaySpec): Promise<void> {
    try {
      await this.plays.remove(this.id, game.id);
      this.games.update((all) => all.filter((g) => g.id !== game.id));
    } catch {
      this.error.set(tr('jigsawPage.couldNotDeleteRound', 'Could not delete the round: try again.'));
    }
  }

  /** Edit: the page of the jigsaw is replaced by the form with the jigsaw in it, the one of a new jigsaw (what the rounds share is locked when it has been played); the form is left to the page again. */
  edit(): void {
    if (!this.item() || !this.mayChange()) return; // a link that opens the form (`?edit=1`) does not open it for somebody who is not the owner
    void this.router.navigate(['/jigsaw', this.id, 'edit'], { replaceUrl: true });
  }
}

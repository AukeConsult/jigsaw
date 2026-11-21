import { clockOf } from '../duration';
import { DatePipe } from '@angular/common';
import { Component, OnInit, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { readPreference, writePreference } from '../../core/preferences';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawService } from '../jigsaw.service';
import { PlaysService, UserGame } from '../plays.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { CanvasSpec } from '../../models/shared/canvas';
import { JigsawUserSpec, USERNAME_MAX, USERNAME_MIN, USER_NAME_MAX } from '../../models/shared/jigsaw-user';

/**
 * Who plays (`/jigsaw/user`): a person makes a user (a user name and a name) or says the user name they already have. There is no password for now.
 * After that the person goes on to the page they came from (`?next=`); without one they stay here, with the user they chose.
 */
@Component({
  selector: 'app-jigsaw-user',
  imports: [FormsModule, RouterLink, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawUser')],
  templateUrl: './jigsaw-user.html',
})
export class JigsawUser implements OnInit {
  /** a time played, as a clock (`12:34`) */
  protected readonly clock = clockOf;

  protected readonly users = inject(JigsawUserService);
  private readonly plays = inject(PlaysService);
  private readonly images = inject(JigsawImageService);
  private readonly jigsaws = inject(JigsawService);
  private readonly router = inject(Router);
  private readonly next = inject(ActivatedRoute).snapshot.queryParamMap.get('next');

  /** choose: pick a user from the list, make: make a new user */
  readonly mode = signal<'choose' | 'make'>('choose');
  /** the users to choose from (null: not read yet) */
  readonly list = signal<JigsawUserSpec[] | null>(null);
  readonly listFailed = signal(false);
  /** what is typed to find a user in a long list (kept on the device) */
  readonly filter = signal(readPreference('jigsaw.userFilter', '', (v): v is string => typeof v === 'string'));
  readonly username = signal('');
  readonly name = signal('');
  /** an e-mail address, optional: kept so the user can be connected to a registration later */
  readonly email = signal('');
  readonly error = signal('');
  readonly busy = signal(false);
  readonly usernameMin = USERNAME_MIN;
  readonly usernameMax = USERNAME_MAX;
  readonly nameMax = USER_NAME_MAX;

  /** the games of the user who plays, over all the jigsaws (null: not read yet) */
  readonly games = signal<UserGame[] | null>(null);
  readonly gamesFailed = signal(false);
  /** the jigsaws whose picture could not be read (an empty box is shown) */
  readonly noPicture = signal<ReadonlySet<string>>(new Set());

  /** which list is shown: the rounds played or the jigsaws made; kept for the session */
  readonly tab = signal<'rounds' | 'jigsaws'>(readPreference('jigsaw.userTab', 'rounds', (v): v is 'rounds' | 'jigsaws' => v === 'rounds' || v === 'jigsaws'));

  constructor() {
    effect(() => writePreference('jigsaw.userTab', this.tab()));
    effect(() => writePreference('jigsaw.userFilter', this.filter()));
    // the games are read when a user plays (and again when another user is chosen)
    effect(() => {
      const me = this.users.user();
      this.games.set(null);
      this.gamesFailed.set(false);
      if (me) void this.loadGames(me.id);
    });
    // the jigsaws the user made are read in the same way
    effect(() => {
      const me = this.users.user();
      this.mine.set(null);
      if (me) void this.loadMine(me.id);
    });
  }

  /** the jigsaws the user who plays has made (null: not read yet) */
  readonly mine = signal<CanvasSpec[] | null>(null);
  /** the jigsaw whose Delete was pressed and waits for "Yes" */
  readonly confirmingJigsawId = signal<string | null>(null);

  private async loadMine(userId: string): Promise<void> {
    try {
      const all = await this.jigsaws.list();
      if (this.users.user()?.id === userId) this.mine.set(all.filter((j) => j.ownerUid === userId));
    } catch {
      this.mine.set([]);
    }
  }

  /** The jigsaw is deleted for good, with its picture and all its rounds (only its owner can). */
  async removeJigsaw(item: CanvasSpec): Promise<void> {
    const me = this.users.user();
    this.confirmingJigsawId.set(null);
    if (!me) return;
    try {
      await this.jigsaws.removeAs(item.id, me.id);
      this.mine.update((all) => (all ?? []).filter((j) => j.id !== item.id));
      this.games.update((all) => (all ?? []).filter((g) => g.jigsaw.id !== item.id));
    } catch {
      this.error.set(tr('jigsawUser.jigsawNotDeleted', 'Could not delete the jigsaw: try again.'));
    }
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

  /** the game whose Delete button was pressed and waits for "Yes" */
  readonly confirmingPlayId = signal<string | null>(null);

  /** The game is deleted for good (the jigsaw and the other games stay). */
  async removeGame(game: UserGame): Promise<void> {
    this.confirmingPlayId.set(null);
    try {
      await this.plays.remove(game.jigsaw.id, game.play.id);
      this.games.update((all) => (all ?? []).filter((g) => g.play.id !== game.play.id));
    } catch {
      this.error.set(tr('jigsawUser.couldNotDelete', 'Could not delete the round: try again.'));
    }
  }

  pictureUrl(jigsawId: string): string {
    return this.images.url(jigsawId, 1);
  }

  lacksPicture(jigsawId: string): void {
    this.noPicture.update((now) => new Set([...now, jigsawId]));
  }

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.users.list();
      this.list.set(list);
      if (!list.length) this.mode.set('make'); // nobody to choose from yet
    } catch {
      this.list.set([]);
      this.listFailed.set(true);
      this.mode.set('make');
    }
  }

  /** the users that fit what is typed (the name or the user name) */
  shown(): JigsawUserSpec[] {
    const text = this.filter().trim().toLowerCase();
    return (this.list() ?? []).filter((u) => !text || u.name.toLowerCase().includes(text) || u.username.includes(text));
  }

  /** A user was picked from the list: the person plays as them, and goes on. */
  async pick(user: JigsawUserSpec): Promise<void> {
    this.users.select(user);
    await this.goOn();
  }

  /**
   * The page to go on to after a user is chosen or made: the page the person was sent from (`?next=`, only a page of this module: a link from outside cannot send them
   * elsewhere). Without one the person came to this page on purpose (to choose another user, say) and stays here, with the user they chose and their rounds shown.
   */
  private async goOn(): Promise<void> {
    if (this.next && /^\/jigsaw(\/|$|\?)/.test(this.next) && !this.next.startsWith('//')) await this.router.navigateByUrl(this.next);
  }

  async submit(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.create(this.username(), this.name(), this.email());
    this.busy.set(false);
    if (error) return this.error.set(error);
    await this.goOn();
  }

  /** the user who plays is being edited, and what is in the form */
  readonly editing = signal(false);
  /** an e-mail address is kept but never shown: a new one can be typed, or the one there is can be taken away */
  readonly removeEmail = signal(false);

  edit(): void {
    const me = this.users.user();
    if (!me) return;
    this.name.set(me.name);
    this.username.set(me.username);
    this.email.set('');
    this.removeEmail.set(false);
    this.error.set('');
    this.editing.set(true);
  }

  /** The changes are saved: only what differs from the user is sent. */
  async saveEdit(): Promise<void> {
    const me = this.users.user();
    if (!me) return;
    const change: { name?: string; username?: string; email?: string | null } = {};
    if (this.name().trim() !== me.name) change.name = this.name();
    if (this.username().trim().toLowerCase() !== me.username) change.username = this.username();
    if (this.removeEmail()) change.email = null;
    else if (this.email().trim()) change.email = this.email();
    if (!Object.keys(change).length) return void this.editing.set(false); // nothing changed
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.update(change);
    this.busy.set(false);
    if (error) return this.error.set(error);
    this.editing.set(false);
  }

  /** Stop playing as the user who is chosen, to choose another. */
  leave(): void {
    this.users.leave();
  }
}

import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, output, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { AccountAvatar } from '../../jigsaw/account-avatar/account-avatar';
import { JigsawUserService } from '../../jigsaw/jigsaw-user.service';
import { JigsawUsers } from '../../models/shared/jigsaw-user';
import { LinkCodes, LinkedUser } from '../../models/shared/logon';
import { AuthService } from '../auth.service';
import { LogonLanding } from '../logon-landing';
import { LogonsService } from '../logons.service';

/**
 * What the login that is signed in can do about the users, for a person who has chosen no user yet (or wants another): play as one of the users that the login is verified for, make a new user
 * with the login (its name is the name of the login, to begin with), or add the login to a user with a link code that another login of that user made. Without a login signed in it is only the
 * way to sign in. `chosen` says a user was chosen, so the page can go on.
 */
@Component({
  selector: 'app-my-logon-users',
  imports: [RouterLink, TranslocoDirective, AccountAvatar],
  providers: [provideTranslocoScope('logons')],
  host: { class: 'd-block' },
  templateUrl: './my-logon-users.html',
})
export class MyLogonUsers {
  protected readonly auth = inject(AuthService);
  private readonly users = inject(JigsawUserService);
  private readonly logons = inject(LogonsService);
  private readonly landing = inject(LogonLanding);
  /** why the person was sent here, when they were (`?logon=`): the user they had belongs to other logins (`wrong`) or needs a login (`needlogin`); it is read as the address changes, since the page may already be open */
  protected readonly notice = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((q) => q.get('logon'))), { initialValue: null });

  readonly chosen = output<void>();

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly codeOpen = signal(false);
  /** the less used choices (a link code, another sign-in) are shown when the person asks for More */
  protected readonly moreOpen = signal(false);
  protected readonly username = signal('');
  protected readonly code = signal('');

  /** the name that shows who is signed in: the name of the login, else its address */
  protected readonly who = computed(() => this.auth.user()?.displayName || this.auth.user()?.email || '');

  /** Signs the login out: the page then shows the way to sign in. */
  protected async signOut(): Promise<void> {
    await this.auth.logout();
  }

  /** Signs out and goes to sign in with another login. */
  protected async otherLogin(): Promise<void> {
    await this.landing.switchLogin();
  }

  protected async play(id: string): Promise<void> {
    await this.run(async () => {
      const error = await this.users.selectById(id);
      if (error) throw new Error(error);
      this.chosen.emit();
    });
  }

  /** the new user that is asked about before it is made: its name and user name, and whether that user name is taken (digits are added then) */
  protected readonly newUser = signal<{ name: string; username: string; taken: boolean } | null>(null);
  /** the user that is asked about before it is deleted */
  protected readonly deleting = signal<LinkedUser | null>(null);

  /** The name a new user gets: the name of the login, else the first part of its address. */
  private newName(): string {
    const user = this.auth.user();
    return (user?.displayName || user?.email?.split('@')[0] || 'Player').trim();
  }

  /** Shows what would be made (the name and the user name, and whether the user name is taken), so the person says yes before anything is. */
  protected async askNew(): Promise<void> {
    this.deleting.set(null);
    const name = this.newName();
    const username = JigsawUsers.usernameFrom(name, '');
    this.newUser.set({ name, username, taken: false });
    this.newUser.set({ name, username, taken: !!(await this.users.lookup(username)) });
  }

  /** The person said yes: a new user, verified for the login from the start: its name is the name of the login, and its user name is made from it (with digits when it is taken). */
  protected async makeNew(): Promise<void> {
    if (!this.auth.user()) return;
    const name = this.newName();
    this.newUser.set(null);
    await this.run(async () => {
      let made = await this.users.createFromName(name, undefined, false, true);
      if (made.takenUsername) made = await this.users.createFromName(name, undefined, true, true);
      if (made.error) throw new Error(made.error);
      await this.auth.loadLinked();
      this.chosen.emit();
    });
  }

  /** The person said yes: the user is deleted (the server refuses with the reason when something is attached to it). */
  protected async deleteUser(): Promise<void> {
    const user = this.deleting();
    if (!user) return;
    this.deleting.set(null);
    await this.run(async () => {
      await this.users.remove(user.id);
      await this.auth.loadLinked();
      this.message.set(tr('logons.myUsers.deleted', '{{ name }} is deleted.', { name: user.name }));
    });
  }

  /** The login is added to a user with a code: the user is found by its user name, and the code is the one a login of that user made. */
  protected async useCode(): Promise<void> {
    const error = LinkCodes.error(this.code());
    if (error) return void this.error.set(tr('logons.myUsers.badCode', 'That is not a link code: it is ten letters and digits.'));
    await this.run(async () => {
      const user = await this.users.lookup(this.username());
      if (!user) throw new Error(tr('logons.myUsers.noSuchUser', 'No user has that alias.'));
      await this.logons.redeem(user.id, this.code());
      await this.auth.loadLinked();
      this.code.set('');
      this.username.set('');
      this.codeOpen.set(false);
      this.message.set(tr('logons.myUsers.done', 'Done: this login can use {{ name }} now.', { name: user.name }));
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await action();
    } catch (err) {
      const body = err instanceof HttpErrorResponse ? (err.error as { error?: string } | null) : null;
      this.error.set(body?.error ?? (err instanceof Error && !(err instanceof HttpErrorResponse) ? err.message : tr('logons.userLogins.failed', 'That did not work: try again.')));
    } finally {
      this.busy.set(false);
    }
  }
}

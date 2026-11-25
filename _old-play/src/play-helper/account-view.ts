import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../app/core/language.service';
import { tr } from '../../app/core/i18n';
import { readPreference, writePreference } from '../../app/core/preferences';
import { AccountAvatar } from '../../app/jigsaw/account-avatar/account-avatar';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { AuthService } from '../../app/logons/auth.service';
import { LogonsService } from '../../app/logons/logons.service';
import { JigsawUsers, JigsawUserSpec, USER_NAME_MAX } from '../../app/models/shared/jigsaw-user';
import { LinkCodes, LinkedUser } from '../../app/models/shared/logon';
import { HelperView } from '../core/helper-view';
import { PlayLogonLanding } from '../core/play-logon-landing';
import { AccountEdit } from './account-edit';
import { AccountState } from './account-state';

/**
 * Who plays (a fresh copy of what the website does on `/jigsaw/user` and in `app-my-logon-users`, in a view of the helper, with no pages): a person who is signed in sees the accounts their login is verified for and can
 * play as one, make a new one with the login, delete one, or add the login to an account with a link code; a person who is not signed in chooses an account from the list (a lock means it needs a sign-in first) or
 * makes one by saying their name (an account that is open to anyone, which can be locked later, see `verify-view`). An account that plays is shown at the top, with the way to choose another and to sign out.
 */
@Component({
  selector: 'account-view',
  imports: [TranslocoDirective, AccountAvatar],
  providers: [provideTranslocoScope('play')],
  templateUrl: './account-view.html',
})
export class AccountView extends HelperView implements OnInit {
  override readonly storageKey = 'play.accountView';
  /** the sign-in form takes the place of the accounts while it is open (as the sign-in page took the place of the user page) */
  override readonly visible = (): boolean => !this.state.logonOpen();

  protected readonly auth = inject(AuthService);
  protected readonly users = inject(JigsawUserService);
  private readonly logons = inject(LogonsService);
  private readonly landing = inject(PlayLogonLanding);
  protected readonly state = inject(AccountState);
  protected readonly edit = inject(AccountEdit);
  private readonly language = inject(LanguageService);

  /** the accounts to choose from (null: not read yet) */
  protected readonly list = signal<JigsawUserSpec[] | null>(null);
  protected readonly ready = signal(false);
  /** `start`: a new person (the box of the accounts of the login, or the name to say); `choose`: the list of the accounts */
  protected readonly mode = signal<'start' | 'choose'>('start');
  protected readonly filter = signal(readPreference('play.userFilter', '', (v): v is string => typeof v === 'string'));
  protected readonly name = signal('');
  protected readonly nameMax = USER_NAME_MAX;
  protected readonly busy = signal(false);
  /** what went wrong with the name that was said (the form of a new person) */
  protected readonly startError = signal('');
  /** what went wrong with what the signed-in person did, and what was done */
  protected readonly error = signal('');
  protected readonly message = signal('');
  /** the users who already have the name that was said (none: nobody): the person is asked which of them is them (or none) before a new account is made */
  protected readonly sameUsers = signal<JigsawUserSpec[]>([]);
  /** An account the person chose but cannot play as, and why: nobody is signed in, or the login that is signed in is not verified for it. Nothing was switched. */
  protected readonly blocked = signal<{ name: string; username: string; signedIn: boolean } | null>(null);

  // the box of the signed-in person
  protected readonly codeOpen = signal(false);
  /** the less used choices (a link code, another sign-in) are shown when the person asks for More */
  protected readonly moreOpen = signal(false);
  protected readonly username = signal('');
  protected readonly code = signal('');
  /** the new account that is asked about before it is made: its name and alias, and whether that alias is taken (digits are added then) */
  protected readonly newUser = signal<{ name: string; username: string; taken: boolean } | null>(null);
  /** the account that is asked about before it is deleted */
  protected readonly deleting = signal<LinkedUser | null>(null);
  /** the name that shows who is signed in: the name of the login, else its address */
  protected readonly who = computed(() => this.auth.user()?.displayName || this.auth.user()?.email || '');

  constructor() {
    super();
    effect(() => writePreference('play.userFilter', this.filter()));
    // the list of the accounts shows the new name and alias of an account that was changed, or the one that was just made
    effect(() => {
      this.users.user();
      untracked(() => void this.refreshList());
    });
  }

  override async ngOnInit(): Promise<void> {
    super.ngOnInit();
    try {
      this.list.set(await this.users.list());
      await this.auth.ready;
      // a person who is not signed in sees the accounts to choose from; a signed-in person sees the box of their accounts first
      if (!this.auth.user()) this.mode.set('choose');
    } catch {
      this.list.set([]);
    } finally {
      this.ready.set(true);
    }
  }

  /** the accounts that fit what is typed (the name or the alias); the ones the signed-in login is verified for are left out, they are in the box above the list */
  protected shown(): JigsawUserSpec[] {
    const text = this.filter().trim().toLowerCase();
    const mine = new Set(this.auth.linked().map((u) => u.id));
    return (this.list() ?? []).filter((u) => !mine.has(u.id)).sort(JigsawUsers.byLastUsed).filter((u) => !text || u.name.toLowerCase().includes(text) || u.username.includes(text));
  }

  /**
   * An account was picked from the list: the person plays as it. An account that has verified logins can be played as only by one of them: it is checked **before** anything is switched, and when the
   * person is not signed in, or the login they are signed in with is not verified for it, they are told so (`blocked`) and stay as they are.
   */
  protected async pick(user: JigsawUserSpec): Promise<void> {
    this.blocked.set(null);
    if (user.protected && !(await this.mayPlayAs(user))) return;
    this.users.select(user);
  }

  /** Whether the person may play as this account: it is open, or the login that is signed in is verified for it (the logins are read again, so one added elsewhere counts). Says why not when it is not. */
  private async mayPlayAs(user: JigsawUserSpec): Promise<boolean> {
    if (!this.auth.user()) {
      this.blocked.set({ name: user.name, username: user.username, signedIn: false });
      return false;
    }
    await this.auth.loadLinked();
    if (this.auth.linked().some((u) => u.id === user.id)) return true;
    this.blocked.set({ name: user.name, username: user.username, signedIn: true });
    return false;
  }

  /**
   * A new person has said their name: when somebody already has it (what was typed is found in a name or an alias, or is the alias it would make) the person is asked, "is that you?" (a list to choose from when
   * several have it), and chooses between playing as one of them and making a new account (`force`, with digits to tell them apart). Otherwise the account is made from the name (`JigsawUserService.createFromName`).
   */
  protected async startNow(force = false): Promise<void> {
    if (!force) {
      const username = JigsawUsers.usernameFrom(this.name(), '');
      const same = (this.list() ?? []).filter((u) => JigsawUsers.matches(u, this.name()) || u.username === username);
      if (same.length) return this.sameUsers.set(same);
    }
    this.busy.set(true);
    this.startError.set('');
    const made = await this.users.createFromName(this.name(), this.language.lang(), force);
    if (made.takenUsername) {
      // the server says somebody has the alias (the list may not have shown it): who is it? the person chooses between that account and a new one
      const owner = await this.users.lookup(made.takenUsername);
      this.busy.set(false);
      if (owner) return this.sameUsers.set([owner]);
      return this.startError.set(made.error);
    }
    this.busy.set(false);
    if (made.error) return this.startError.set(made.error);
    await this.refreshList();
  }

  /** Reads the list of the accounts again (one was made or changed), so the list to choose from is current. A failure leaves the list as it was. */
  private async refreshList(): Promise<void> {
    try {
      this.list.set(await this.users.list());
    } catch {
      /* the list stays as it was */
    }
  }

  /** Stop playing as this account, to choose another (the account stays, with its rounds and jigsaws). */
  protected leave(): void {
    this.users.leave();
    this.edit.editing.set(false);
    this.mode.set(this.list()?.length ? 'choose' : 'start');
  }

  /** Stop playing as this account and sign out the login too (when one is signed in). The account is let go first, so nothing acts as it after the login is gone. */
  protected async logout(): Promise<void> {
    this.users.leave();
    this.edit.editing.set(false);
    this.mode.set(this.list()?.length ? 'choose' : 'start');
    if (this.auth.user()) await this.auth.logout();
  }

  /** Signs the login out: the view then shows the way to sign in. */
  protected async signOut(): Promise<void> {
    await this.auth.logout();
  }

  /** Signs out to sign in with another login: the sign-in form is opened (the website goes to the sign-in page). */
  protected async otherLogin(): Promise<void> {
    await this.landing.switchLogin();
    this.state.openLogon();
  }

  protected async play(id: string): Promise<void> {
    await this.run(async () => {
      const error = await this.users.selectById(id);
      if (error) throw new Error(error);
    });
  }

  /** The name a new account gets: the name of the login, else the first part of its address. */
  private newName(): string {
    const user = this.auth.user();
    return (user?.displayName || user?.email?.split('@')[0] || 'Player').trim();
  }

  /** Shows what would be made (the name and the alias, and whether the alias is taken), so the person says yes before anything is. */
  protected async askNew(): Promise<void> {
    this.deleting.set(null);
    const name = this.newName();
    const username = JigsawUsers.usernameFrom(name, '');
    this.newUser.set({ name, username, taken: false });
    this.newUser.set({ name, username, taken: !!(await this.users.lookup(username)) });
  }

  /** The person said yes: a new account, verified for the login from the start: its name is the name of the login, and its alias is made from it (with digits when it is taken). */
  protected async makeNew(): Promise<void> {
    if (!this.auth.user()) return;
    const name = this.newName();
    this.newUser.set(null);
    await this.run(async () => {
      let made = await this.users.createFromName(name, undefined, false, true);
      if (made.takenUsername) made = await this.users.createFromName(name, undefined, true, true);
      if (made.error) throw new Error(made.error);
      await this.auth.loadLinked();
      await this.refreshList();
    });
  }

  /** The person said yes: the account is deleted (the server refuses with the reason when something is attached to it). */
  protected async deleteUser(): Promise<void> {
    const user = this.deleting();
    if (!user) return;
    this.deleting.set(null);
    await this.run(async () => {
      await this.users.remove(user.id);
      await this.auth.loadLinked();
      await this.refreshList();
      this.message.set(tr('play.account.deleted', '{{ name }} is deleted.', { name: user.name }));
    });
  }

  /** The login is added to an account with a code: the account is found by its alias, and the code is the one a login of that account made. */
  protected async useCode(): Promise<void> {
    const error = LinkCodes.error(this.code());
    if (error) return void this.error.set(tr('play.account.badCode', 'That is not a link code: it is ten letters and digits.'));
    await this.run(async () => {
      const user = await this.users.lookup(this.username());
      if (!user) throw new Error(tr('play.account.noSuchUser', 'No account has that alias.'));
      await this.logons.redeem(user.id, this.code());
      await this.auth.loadLinked();
      this.code.set('');
      this.username.set('');
      this.codeOpen.set(false);
      this.message.set(tr('play.account.done', 'Done: this sign-in can use {{ name }} now.', { name: user.name }));
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
      this.error.set(body?.error ?? (err instanceof Error && !(err instanceof HttpErrorResponse) ? err.message : tr('play.account.failed', 'That did not work: try again.')));
    } finally {
      this.busy.set(false);
    }
  }
}

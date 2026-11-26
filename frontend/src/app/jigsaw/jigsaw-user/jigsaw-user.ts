import { Component, OnDestroy, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { preferenceSignal } from '../../core/preferences';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MyJigsaws } from '../my-jigsaws/my-jigsaws';
import { MyRoundList } from '../my-round-list/my-round-list';
import { JigsawUserService } from '../jigsaw-user.service';
import { AuthService } from '../../logons/auth.service';
import { MyLogonUsers } from '../../logons/my-logon-users/my-logon-users';
import { AccountAvatar } from '../account-avatar/account-avatar';
import { AccountEdit } from '../account-edit';
import { UserLogins } from '../../logons/user-logins/user-logins';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawUsers, JigsawUserSpec, USERNAME_MAX, USERNAME_MIN, USER_NAME_MAX } from '../../models/shared/jigsaw-user';

/**
 * Who plays (`/jigsaw/user`): a person makes a user (a user name and a name) or says the user name they already have. There is no password for now.
 * After that the person goes on to the page they came from (`?next=`); without one they stay here, with the user they chose.
 */
@Component({
  selector: 'app-jigsaw-user',
  imports: [FormsModule, RouterLink, TranslocoDirective, MyJigsaws, MyRoundList, UserLogins, MyLogonUsers, AccountAvatar],
  providers: [provideTranslocoScope('jigsawUser'), provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawPackages'), AccountEdit],
  templateUrl: './jigsaw-user.html',
})
export class JigsawUser implements OnInit, OnDestroy {
  protected readonly users = inject(JigsawUserService);
  protected readonly auth = inject(AuthService);
  /** the form of the account that plays */
  protected readonly edit = inject(AccountEdit);
  private readonly router = inject(Router);
  private readonly next = inject(ActivatedRoute).snapshot.queryParamMap.get('next');
  /** the page was opened as `/jigsaw/user/new`: the form of a new account (anywhere else it is the accounts to choose from) */
  protected readonly isNew = inject(ActivatedRoute).snapshot.routeConfig?.path === 'user/new';

  /** start: a new person says only their name (a signed-in person sees the box of their accounts); choose: pick an account from the list */
  readonly mode = signal<'start' | 'choose'>('start');
  /** the accounts are read and it is known whether somebody is signed in: until then the page shows nothing to choose from, so the form of a new account is not seen for a moment before the list */
  readonly ready = signal(false);

  /** the users to choose from (null: not read yet) */
  readonly list = signal<JigsawUserSpec[] | null>(null);
  readonly listFailed = signal(false);
  /** what is typed to find a user in a long list (kept on the device) */
  readonly filter = preferenceSignal('jigsaw.userFilter', '', (v): v is string => typeof v === 'string');
  /** what a new person says they are called */
  readonly name = signal('');
  /** a new user starts with the language the app is shown in */
  private readonly appLanguage = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  readonly error = signal('');
  readonly busy = signal(false);
  readonly usernameMin = USERNAME_MIN;
  readonly usernameMax = USERNAME_MAX;
  readonly nameMax = USER_NAME_MAX;

  /** which list is shown: the rounds played or the jigsaws made; kept for the session */
  readonly tab = preferenceSignal<'rounds' | 'jigsaws'>('jigsaw.userTab', 'rounds', (v): v is 'rounds' | 'jigsaws' => v === 'rounds' || v === 'jigsaws');

  /** the person was sent here after signing in to protect the user: the edit form is opened, at the list of the logins */
  private readonly showLogins = inject(ActivatedRoute).snapshot.queryParamMap.get('logins') === '1';
  private openedLogins = false;

  constructor() {
    this.edit.onSaved = () => this.refreshList(); // the list of the users shows the new name and user name
    effect(() => {
      if (!this.showLogins || this.openedLogins || !this.users.user()) return;
      this.openedLogins = true;
      untracked(() => {
        this.edit.open();
        setTimeout(() => document.querySelector('app-user-logins')?.scrollIntoView({ block: 'center' }), 400); // when the form is drawn
      });
    });
  }

  /** What is waiting in the form of the account is saved when the page is left. */
  ngOnDestroy(): void {
    void this.edit.close();
  }

  async ngOnInit(): Promise<void> {
    try {
      const list = await this.users.list();
      this.list.set(list);
      await this.auth.ready;
      // the form of a new account is only at /jigsaw/user/new; /jigsaw/user shows the accounts to choose from (a signed-in person sees the box of their accounts first)
      if (!this.isNew && !this.auth.user()) this.mode.set('choose');
    } catch {
      this.list.set([]);
      this.listFailed.set(true);
    } finally {
      this.ready.set(true);
    }
  }

  /** the users that fit what is typed (the name or the user name); the ones the signed-in login is verified for are left out, they are in the box above the list */
  shown(): JigsawUserSpec[] {
    const text = this.filter().trim().toLowerCase();
    const mine = new Set(this.auth.linked().map((u) => u.id));
    return (this.list() ?? []).filter((u) => !mine.has(u.id)).sort(JigsawUsers.byLastUsed).filter((u) => !text || u.name.toLowerCase().includes(text) || u.username.includes(text));
  }

  /** A user the person chose but cannot play as, and why: nobody is signed in, or the login that is signed in is not verified for it. Shown above the list; nothing was switched. */
  readonly blocked = signal<{ name: string; username: string; signedIn: boolean } | null>(null);

  /**
   * A user was picked from the list: the person plays as them (`JigsawUserService.playAs` says who may), and goes on. When the person may not (not signed in, or a login that is not verified for the user and is no
   * admin's), they are told so (`blocked`) and stay as they are.
   */
  async pick(user: JigsawUserSpec): Promise<void> {
    this.blocked.set(null);
    const result = await this.users.playAs(user);
    if (result !== 'playing') return this.blocked.set({ name: user.name, username: user.username, signedIn: result === 'blocked' });
    await this.goOn();
  }

  /** A user was chosen or made with the login that is signed in: the person goes on as after any other choice. */
  protected async onLogonChosen(): Promise<void> {
    await this.goOn();
  }

  /**
   * The page to go on to after a user is chosen or made: the page the person was sent from (`?next=`, only a page of this module: a link from outside cannot send them
   * elsewhere). Without one the person came to this page on purpose (to choose another user, say) and stays here, with the user they chose and their rounds shown.
   */
  private async goOn(): Promise<void> {
    if (this.next && /^\/jigsaw(\/|$|\?)/.test(this.next)) await this.router.navigateByUrl(this.next);
  }

  /** the users who already have the name that was typed (none: nobody): the person is asked which of them is them (or none) before a new user is made */
  readonly sameUsers = signal<JigsawUserSpec[]>([]);

  /**
   * A new person has said their name: when somebody already has it (what was typed is found in a name or a user name, or is the user name it would make) the person is asked, "is that you?" (a list to choose from when several have it), and chooses between playing as one of them and
   * making a new user (`force`, with digits to tell them apart). Otherwise the user is made from the name (see `JigsawUserService.createFromName`), so nobody has to think of a user name.
   */
  async startNow(force = false): Promise<void> {
    if (!force) {
      // looked for in both the names and the user names (see `JigsawUsers.matches`), and the user name the typed name would make
      const username = JigsawUsers.usernameFrom(this.name(), '');
      const same = (this.list() ?? []).filter((u) => JigsawUsers.matches(u, this.name()) || u.username === username);
      if (same.length) return this.sameUsers.set(same);
    }
    this.busy.set(true);
    this.error.set('');
    const made = await this.users.createFromName(this.name(), this.appLanguage.lang(), force);
    if (made.takenUsername) {
      // the server says somebody has the user name (the list may not have shown it): who is it? the person chooses between that user and a new one
      const owner = await this.users.lookup(made.takenUsername);
      this.busy.set(false);
      if (owner) return this.sameUsers.set([owner]);
      return this.error.set(made.error);
    }
    this.busy.set(false);
    if (made.error) return this.error.set(made.error);
    await this.refreshList();
    await this.goOn();
  }

  /** Edit is a switch: it opens the form of the user, and pressed again it closes it (what is waiting is saved first). */
  toggleEdit(): void {
    if (this.edit.editing()) void this.edit.close();
    else this.edit.open();
  }

  /** Reads the list of the users again (a user was made or changed), so the list to choose from is current. A failure leaves the list as it was. */
  private async refreshList(): Promise<void> {
    try {
      this.list.set(await this.users.list());
    } catch {
      /* the list stays as it was */
    }
  }

  /**
   * Log out: stop playing as this user (the user stays in the database, with its rounds and jigsaws), sign out the Firebase login too (when one is signed in), and go to the front page; the next person starts
   * from "What is your name?". The user is let go first, so nothing acts as it after the login is gone.
   */
  async logout(): Promise<void> {
    this.users.leave();
    this.edit.editing.set(false);
    this.mode.set(this.list()?.length ? 'choose' : 'start');
    if (this.auth.user()) await this.auth.logout();
    await this.router.navigateByUrl('/');
  }

  /** Stop playing as the user who is chosen, to choose another. */
  leave(): void {
    this.users.leave();
    this.edit.editing.set(false);
    // the list is shown (somebody who chooses another user is not new); a person who is new has the other way, "I am new here"
    this.mode.set(this.list()?.length ? 'choose' : 'start');
  }
}

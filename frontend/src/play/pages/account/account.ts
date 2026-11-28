import { Component, OnDestroy, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../app/core/language.service';
import { preferenceSignal } from '../../../app/core/preferences';
import { AccountAvatar } from '../../../app/jigsaw/account-avatar/account-avatar';
import { LanguageField } from '../../../app/jigsaw/language-field/language-field';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { AuthService } from '../../../app/logons/auth.service';
import { LogonLanding } from '../../../app/logons/logon-landing';
import { MyLogonUsers } from '../../../app/logons/my-logon-users/my-logon-users';
import { UserLogins } from '../../../app/logons/user-logins/user-logins';
import { JigsawUsers, JigsawUserSpec, USERNAME_MAX, USERNAME_MIN, USER_BIO_MAX, USER_NAME_MAX } from '../../../app/models/shared/jigsaw-user';
import { AccountEdit } from '../../../app/jigsaw/account-edit';

/**
 * The page of the route `/play/account`, who is on and everything about the user's account: **the app's own page, made of the real shared components** (`app-my-logon-users`, what a signed-in login can do about the accounts: play as one, make a new one, delete one, add the
 * login to one with a link code; `app-user-logins`, the logins verified for the account that plays; and `app-account-avatar`) An account that plays is shown
 * at the top, with the way to choose another and to sign out, and under it its edit page (its alias, name, picture, "Who am I" and language, which save by themselves, and its sign-ins), which is just there: nothing is pressed to open it. When nobody plays: a signed-in person has the box of their accounts, and anybody chooses an account from the list (a lock means it needs a sign-in first) or makes one by
 * saying their name (an account that is open to anyone).
 */
@Component({
  selector: 'play-account',
  imports: [TranslocoDirective, AccountAvatar, LanguageField, MyLogonUsers, UserLogins],
  providers: [provideTranslocoScope('play', 'userLevels'), AccountEdit],
  host: { class: 'd-block' },
  templateUrl: './account.html',
})
export class PlayAccount implements OnInit, OnDestroy {
  protected readonly auth = inject(AuthService);
  private readonly landing = inject(LogonLanding);
  protected readonly users = inject(JigsawUserService);
  private readonly language = inject(LanguageService);
  private readonly router = inject(Router);
  protected readonly edit = inject(AccountEdit);
  protected readonly usernameMin = USERNAME_MIN;
  protected readonly usernameMax = USERNAME_MAX;

  /** the accounts to choose from (null: not read yet) */
  protected readonly list = signal<JigsawUserSpec[] | null>(null);
  protected readonly ready = signal(false);
  /** `start`: a new person says their name (or, signed in, has the box of the accounts of the login); `choose`: the list of the accounts */
  protected readonly mode = signal<'start' | 'choose'>('start');
  protected readonly filter = preferenceSignal('play.userFilter', '', (v): v is string => typeof v === 'string');
  protected readonly name = signal('');
  protected readonly nameMax = USER_NAME_MAX;
  protected readonly bioMax = USER_BIO_MAX;
  protected readonly busy = signal(false);
  /** what went wrong with the name that was said */
  protected readonly startError = signal('');
  /** the accounts that already have the name that was said (none: nobody): the person is asked which of them is them (or none) before a new account is made */
  protected readonly sameUsers = signal<JigsawUserSpec[]>([]);
  /** An account the person chose but cannot play as, and why: nobody is signed in, or the login that is signed in is not verified for it. Nothing was switched. */
  protected readonly blocked = signal<{ name: string } | null>(null);

  constructor() {
    // sent here to log on (`?next=`): back there as soon as somebody plays. Only a picture's page or a page of the admin: nothing from outside can send a person elsewhere
    const next = inject(ActivatedRoute).snapshot.queryParamMap.get('next');
    if (next && /^(\/play\/round\/[A-Za-z0-9_-]+|\/jigsaw(\/ai-use)?)$/.test(next)) {
      effect(() => {
        if (this.users.acting()) untracked(() => void this.router.navigateByUrl(next));
      });
    }
    // the edit page of the account that plays is open as soon as there is one (and again for another account)
    let editedId: string | null = null;
    effect(() => {
      const id = this.users.user()?.id ?? null;
      if (id === editedId) return;
      editedId = id;
      untracked(() => (id ? this.edit.open() : this.edit.editing.set(false)));
    });
    // a login that was signed in is signed out (by the button here, or in the box of the accounts): back home
    let signedIn = !!this.auth.user();
    effect(() => {
      const now = !!this.auth.user();
      if (signedIn && !now) untracked(() => void this.router.navigateByUrl('/'));
      signedIn = now;
    });
    // the list shows an account that was just made, or changed
    effect(() => {
      this.users.user();
      untracked(() => void this.refreshList());
    });
  }

  /** What is waiting in the edit page is saved when the page is left (there is no Close to press). */
  ngOnDestroy(): void {
    void this.edit.close();
  }

  async ngOnInit(): Promise<void> {
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
   * An account was picked from the list: the person plays as it (`JigsawUserService.playAs` says who may: an open account, one the login is verified for, or any for an admin). A person who is not signed in is sent to the
   * login page, and comes back here; one whose login may not is told so (`blocked`) and stays as they are.
   */
  protected async pick(user: JigsawUserSpec): Promise<void> {
    this.blocked.set(null);
    const result = await this.users.playAs(user);
    if (result === 'logon') await this.router.navigate(['/login'], { queryParams: { next: this.landing.here(), notice: 'needlogin' } }); // the login page says the account is locked, and the person comes back to this page
    else if (result === 'blocked') this.blocked.set({ name: user.name });
  }

  /**
   * A new person has said their name: when somebody already has it (what was typed is found in a name or an alias, or is the alias it would make) the person is asked, "is that you?" (a list to choose from when several have it),
   * and chooses between playing as one of them and making a new account (`force`, with digits to tell them apart). Otherwise the account is made from the name (`JigsawUserService.createFromName`).
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

  /** Sign out: stop playing as this account and sign out the login too (when one is signed in), and go home (`/`, the list). The account is let go first, so nothing acts as it after the login is gone. */
  protected async logout(): Promise<void> {
    this.users.leave();
    this.edit.editing.set(false);
    this.mode.set(this.list()?.length ? 'choose' : 'start');
    if (this.auth.user()) await this.auth.logout();
    await this.router.navigateByUrl('/');
  }
}

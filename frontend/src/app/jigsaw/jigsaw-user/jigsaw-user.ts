import { Component, OnInit, effect, inject, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { readPreference, writePreference } from '../../core/preferences';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MyJigsaws } from '../my-jigsaws/my-jigsaws';
import { MyRoundList } from '../my-round-list/my-round-list';
import { JigsawUserService } from '../jigsaw-user.service';
import { AuthService } from '../../logons/auth.service';
import { MyLogonUsers } from '../../logons/my-logon-users/my-logon-users';
import { AccountAvatar } from '../account-avatar/account-avatar';
import { pictureFromFile } from '../account-picture';
import { UserLogins } from '../../logons/user-logins/user-logins';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawUsers, JigsawUserSpec, USERNAME_MAX, USERNAME_MIN, USER_NAME_MAX } from '../../models/shared/jigsaw-user';

/** how long the account form waits after the last change before it saves it */
const EDIT_PAUSE_MS = 800;

/**
 * Who plays (`/jigsaw/user`): a person makes a user (a user name and a name) or says the user name they already have. There is no password for now.
 * After that the person goes on to the page they came from (`?next=`); without one they stay here, with the user they chose.
 */
@Component({
  selector: 'app-jigsaw-user',
  imports: [FormsModule, RouterLink, TranslocoDirective, MyJigsaws, MyRoundList, UserLogins, MyLogonUsers, AccountAvatar],
  providers: [provideTranslocoScope('jigsawUser'), provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawPackages')],
  templateUrl: './jigsaw-user.html',
})
export class JigsawUser implements OnInit {
  protected readonly users = inject(JigsawUserService);
  protected readonly auth = inject(AuthService);
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
  readonly filter = signal(readPreference('jigsaw.userFilter', '', (v): v is string => typeof v === 'string'));
  readonly username = signal('');
  readonly name = signal('');
  /** the language of the user: a new user starts with the language the app is shown in */
  private readonly appLanguage = inject(LanguageService);
  readonly language = signal(this.appLanguage.lang());
  protected readonly languages = LANGUAGES;
  readonly error = signal('');
  readonly busy = signal(false);
  readonly usernameMin = USERNAME_MIN;
  readonly usernameMax = USERNAME_MAX;
  readonly nameMax = USER_NAME_MAX;

  /** which list is shown: the rounds played or the jigsaws made; kept for the session */
  readonly tab = signal<'rounds' | 'jigsaws'>(readPreference('jigsaw.userTab', 'rounds', (v): v is 'rounds' | 'jigsaws' => v === 'rounds' || v === 'jigsaws'));

  /** the person was sent here after signing in to protect the user: the edit form is opened, at the list of the logins */
  private readonly showLogins = inject(ActivatedRoute).snapshot.queryParamMap.get('logins') === '1';
  private openedLogins = false;

  constructor() {
    this.startEditAutosave();
    effect(() => {
      if (!this.showLogins || this.openedLogins || !this.users.user()) return;
      this.openedLogins = true;
      untracked(() => {
        this.edit();
        setTimeout(() => document.querySelector('app-user-logins')?.scrollIntoView({ block: 'center' }), 400); // when the form is drawn
      });
    });
    effect(() => writePreference('jigsaw.userTab', this.tab()));
    effect(() => writePreference('jigsaw.userFilter', this.filter()));
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
   * A user was picked from the list: the person plays as them, and goes on. A user that has verified logins can be played as only by one of them: it is checked **before** anything is switched, and
   * when the person is not signed in, or the login they are signed in with is not verified for the user, they are told so (`blocked`) and stay as they are.
   */
  async pick(user: JigsawUserSpec): Promise<void> {
    this.blocked.set(null);
    if (user.protected && !(await this.mayPlayAs(user))) return;
    this.users.select(user);
    await this.goOn();
  }

  /** Whether the person may play as this user: it is open, or the login that is signed in is verified for it (the logins of that account are read again, so one added elsewhere counts). Says why not when it is not. */
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

  /** A user was chosen or made with the login that is signed in: the person goes on as after any other choice. */
  protected async onLogonChosen(): Promise<void> {
    await this.goOn();
  }

  /**
   * The page to go on to after a user is chosen or made: the page the person was sent from (`?next=`, only a page of this module: a link from outside cannot send them
   * elsewhere). Without one the person came to this page on purpose (to choose another user, say) and stays here, with the user they chose and their rounds shown.
   */
  private async goOn(): Promise<void> {
    if (this.next && /^\/jigsaw(\/|$|\?)/.test(this.next) && !this.next.startsWith('//')) await this.router.navigateByUrl(this.next);
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

  /** whether the user name typed in the edit form is free ('free'), has another user ('taken') or is not looked at (''): the same, or not yet looked up, or not allowed */
  readonly usernameCheck = signal<'' | 'free' | 'taken'>('');
  private checkTimer: ReturnType<typeof setTimeout> | undefined;

  /** A user name is typed in the edit form: a moment after the last key it is looked up, so the person sees at once whether it can be had (only the server knows; it also refuses a taken name when saving). */
  onUsernameTyped(value: string): void {
    this.username.set(value);
    this.usernameCheck.set('');
    clearTimeout(this.checkTimer);
    const me = this.users.user();
    const wanted = JigsawUsers.normalised(value);
    if (!me || wanted === me.username || JigsawUsers.usernameError(wanted)) return;
    this.checkTimer = setTimeout(async () => {
      const found = await this.users.lookup(wanted);
      if (JigsawUsers.normalised(this.username()) === wanted) this.usernameCheck.set(found && found.id !== me.id ? 'taken' : 'free');
    }, 400);
  }

  /** the user who plays is being edited, and what is in the form */
  readonly editing = signal(false);
  /** the picture in the form: undefined is the one the account has, null that it is taken away, a data address a new one that is chosen */
  readonly picture = signal<string | null | undefined>(undefined);
  readonly pictureFailed = signal(false);

  /** A file is chosen for the picture: it is cut square and shrunk (it is saved by itself a moment later, see `startEditAutosave`). */
  async onPicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // the same file can be chosen again
    if (!file) return;
    this.pictureFailed.set(false);
    try {
      this.picture.set(await pictureFromFile(file));
    } catch {
      this.pictureFailed.set(true);
    }
  }

  /** Edit is a switch: it opens the form of the user, and pressed again it closes it (what is waiting is saved first, see `closeEdit`). */
  toggleEdit(): void {
    if (this.editing()) void this.closeEdit();
    else this.edit();
  }

  /** What the form changes in the account: only what differs from it (nothing: an empty object). */
  private editChange(): { name?: string; username?: string; language?: string; picture?: string | null } {
    const me = this.users.user();
    const change: { name?: string; username?: string; language?: string; picture?: string | null } = {};
    if (!me) return change;
    if (this.name().trim() !== me.name) change.name = this.name();
    if (this.username().trim().toLowerCase() !== me.username) change.username = this.username();
    if (this.language() !== me.language) change.language = this.language();
    if (this.picture() !== undefined && (this.picture() !== null || me.pictureAt)) change.picture = this.picture();
    return change;
  }

  /** Whether what is in the form may be saved: it has a name, and a user name that is allowed and, when it is a new one, has been looked up and is free. */
  private editSavable(): boolean {
    const wanted = JigsawUsers.normalised(this.username());
    if (!this.name().trim() || JigsawUsers.usernameError(wanted)) return false;
    return wanted === this.users.user()?.username || this.usernameCheck() === 'free';
  }

  private editTimer: ReturnType<typeof setTimeout> | undefined;

  /** Every change in the form is saved a pause after the last one (the page has no Save): the pause starts again at each change, and nothing is saved while the form may not be saved. */
  private startEditAutosave(): void {
    effect(() => {
      if (!this.editing()) return;
      this.name();
      this.username();
      this.language();
      this.picture();
      this.usernameCheck();
      this.users.user(); // after a save the account is the form again: nothing is left to save
      untracked(() => {
        clearTimeout(this.editTimer);
        if (!Object.keys(this.editChange()).length || !this.editSavable()) return;
        this.editTimer = setTimeout(() => void this.saveEdit(), EDIT_PAUSE_MS);
      });
    });
  }

  /** Close: what is waiting is saved at once (when it may be), and the form is closed. */
  async closeEdit(): Promise<void> {
    clearTimeout(this.editTimer);
    if (Object.keys(this.editChange()).length && this.editSavable()) await this.saveEdit();
    if (!this.error()) this.editing.set(false);
  }

  edit(): void {
    const me = this.users.user();
    if (!me) return;
    this.name.set(me.name);
    this.username.set(me.username);
    this.language.set(me.language);
    this.picture.set(undefined);
    this.pictureFailed.set(false);
    this.usernameCheck.set('');
    this.error.set('');
    this.editing.set(true);
  }

  /** The changes are saved: only what differs from the user is sent. The form stays open. */
  async saveEdit(): Promise<void> {
    const change = this.editChange();
    if (!Object.keys(change).length) return;
    this.busy.set(true);
    this.error.set('');
    const error = await this.users.update(change);
    this.busy.set(false);
    if (error) return this.error.set(error);
    await this.refreshList(); // the list of the users shows the new name and user name
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
    this.editing.set(false);
    this.mode.set(this.list()?.length ? 'choose' : 'start');
    if (this.auth.user()) await this.auth.logout();
    await this.router.navigateByUrl('/');
  }

  /** Stop playing as the user who is chosen, to choose another. */
  leave(): void {
    this.users.leave();
    this.editing.set(false);
    // the list is shown (somebody who chooses another user is not new); a person who is new has the other way, "I am new here"
    this.mode.set(this.list()?.length ? 'choose' : 'start');
  }
}

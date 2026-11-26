import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { tr } from '../core/i18n';
import { AuthService } from '../logons/auth.service';
import { LanguageService } from '../core/language.service';
import { environment } from '../../environments/environment';
import { JigsawUserSpec, JigsawUsers, UserEdit, UserSettings } from '../models/shared/jigsaw-user';
import { UserLevel, UserLevels } from '../models/shared/user-level';
import { FRONT_FINDER_KEY, hasFinderPreferences, readFinderPreferences, writeFinderPreferences } from './jigsaw-finder/finder-preferences';
import { JigsawFilters } from '../models/shared/jigsaw-filter';
import { apiError } from '../core/api-error';
import { rememberUserId, storedUserId } from '../core/stored-user';

/** Why a request about a user failed, in words for the person (the API says why when it can). */
function reasonOf(err: unknown): string {
  return apiError(err) ?? tr('jigsawUser.couldNotReach', 'Could not reach the server: try again.');
}

/**
 * The user who plays: a person chooses a user name and a name once ("Make a user"), or says the user name they have ("I have a user name"). There is no password:
 * knowing the user name is enough, for now. Which user is playing is kept in this browser (`localStorage`), and the user is read from the database when the page opens.
 */
@Injectable({ providedIn: 'root' })
export class JigsawUserService {
  private readonly http = inject(HttpClient);
  private readonly language = inject(LanguageService);

  /** the user who is playing now (null: none chosen yet) */
  readonly user = signal<JigsawUserSpec | null>(null);
  private readonly auth = inject(AuthService);
  /**
   * The user who is acting: the one who plays, when nothing more is needed. A user that needs a login (it has verified accounts) is acting only while somebody is signed in with one of them;
   * else the person can only look. Everything that is the user's own (a heart, a round, a change) goes by this, not by `user`.
   */
  readonly acting = computed(() => {
    const user = this.user();
    return user && (this.admin() || JigsawUsers.mayAct(user, this.auth.user()?.uid)) ? user : null; // an admin who has gone into the account acts as it with their own login
  });
  /**
   * The account of the signed-in login that is a real admin (null: the login is no admin's, or nobody is signed in). The key of an admin is the login itself: the Bearer token that every call carries, and the server
   * sees from it that the login is verified for an admin account (`createGate`). The page knows the same from the session (`AuthService.linked`, each account with its level). Nothing is stored or cleaned up.
   */
  private readonly adminAccount = computed(() => this.auth.linked().find((u) => UserLevels.isAdmin(UserLevels.of({ level: u.level, protected: true }))) ?? null);
  /**
   * The admin who is in the account that plays (null: nobody is): the login is an admin's and the account that plays is **not one this login is verified for**. An account that the login is verified for is the person's own, so choosing it
   * (also another account of the same login) is not going into somebody's account: it has its own level, and there is no band and no way back. Only an admin who goes into an account that is not theirs (`openAs`) is "in" it.
   * Worked out each time from what is true now.
   */
  readonly admin = computed(() => {
    const account = this.adminAccount();
    const me = this.user();
    return account && me && account.id !== me.id && !this.auth.linked().some((u) => u.id === me.id) ? { id: account.id, name: account.name } : null;
  });
  /** What the user who plays may do beyond playing (`UserLevels.of`: it counts only for an account that needs a login). Only for what the page shows: the server decides what is allowed. */
  readonly level = computed<UserLevel>(() => (this.admin() ? 'admin' : UserLevels.of(this.user()))); // an admin who is in an account has the rights of an admin there
  readonly mayPublish = computed(() => UserLevels.mayPublish(this.level()));
  readonly isAdmin = computed(() => UserLevels.isAdmin(this.level()));
  /** There is no admin at all (the server says so): the first one has to be made by somebody, so the page of the levels is open to every account who plays. */
  readonly noAdmin = signal(false);
  /** The admin menu and the page of the levels are for an admin, or for every account who plays while there is no admin. */
  readonly mayOpenLevels = computed(() => this.isAdmin() || (this.noAdmin() && !!this.user()));
  private loaded: Promise<JigsawUserSpec | null> | null = null;

  /** Asks whether there is no admin (the answer is public: only a yes or a no); a failure is a no. */
  async readNoAdmin(): Promise<void> {
    try {
      this.noAdmin.set((await firstValueFrom(this.http.get<{ open: boolean }>(`${environment.jigsawApi}/jigsaw-levels/open`))).open);
    } catch {
      this.noAdmin.set(false);
    }
  }

  private url(id: string): string {
    return `${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(id)}`;
  }

  /** the account with this id, as the database has it now */
  private read(id: string): Promise<JigsawUserSpec> {
    return firstValueFrom(this.http.get<JigsawUserSpec>(this.url(id)));
  }

  /** the account with this alias */
  private readByAlias(username: string): Promise<JigsawUserSpec> {
    return firstValueFrom(this.http.get<JigsawUserSpec>(`${environment.jigsawApi}/jigsaw-users/by-username/${encodeURIComponent(JigsawUsers.normalised(username))}`));
  }

  /** The user who played here last, read from the database (once); null when none was chosen or the user is gone. */
  load(): Promise<JigsawUserSpec | null> {
    this.loaded ??= (async () => {
      const noAdmin = this.readNoAdmin(); // asked at the same time as the user is read
      try {
        const id = storedUserId();
        if (!id) return null;
        try {
          const user = await this.read(id);
          this.user.set(user);
          this.language.use(user.language); // the app is shown in the language of the user
          if (user.search && !hasFinderPreferences(FRONT_FINDER_KEY)) writeFinderPreferences(FRONT_FINDER_KEY, user.search); // a device that has no search of its own takes the user's
          return user;
        } catch (err) {
          if (err instanceof HttpErrorResponse && err.status === 404) rememberUserId(null); // the user is gone: choose again
          return null;
        }
      } finally {
        await noAdmin;
      }
    })();
    return this.loaded;
  }

  /**
   * Makes a user from only a name, and plays as them: the user name is the name itself (`JigsawUsers.usernameFrom`). When the server says it is taken (409) nothing is made and
   * `takenUsername` says which user name it was, so the page can show who has it and let the person choose between that user and a new one; digits are added only when that
   * choice is made (`withDigits`: four digits to tell the two apart, tried again with other digits when those are taken). Any other trouble is given back at once.
   */
  async createFromName(name: string, language?: string, withDigits = false, linkLogon = false): Promise<{ error: string; takenUsername: string }> {
    let reason = '';
    for (let attempt = 0; attempt < (withDigits ? 5 : 1); attempt++) {
      const username = JigsawUsers.usernameFrom(name, withDigits ? String(Math.floor(1000 + Math.random() * 9000)) : '');
      const error = JigsawUsers.error({ username, name, language });
      if (error) return { error, takenUsername: '' };
      try {
        this.choose(await firstValueFrom(this.http.post<JigsawUserSpec>(`${environment.jigsawApi}/jigsaw-users`, { username, name, ...(language ? { language } : {}), ...(linkLogon ? { linkLogon: true } : {}) }))); // `linkLogon`: the user is verified for the login that is signed in
        return { error: '', takenUsername: '' };
      } catch (err) {
        if (!(err instanceof HttpErrorResponse && err.status === 409)) return { error: reasonOf(err), takenUsername: '' };
        if (!withDigits) return { error: reasonOf(err), takenUsername: username };
        reason = reasonOf(err);
      }
    }
    return { error: reason, takenUsername: '' };
  }

  /** The user who has this user name (without the e-mail), or null when there is none or it could not be read. Does not change who plays. */
  async lookup(username: string): Promise<JigsawUserSpec | null> {
    try {
      return await this.readByAlias(username);
    } catch {
      return null;
    }
  }

  /** The users to choose from (without their e-mail addresses), by name. */
  list(): Promise<JigsawUserSpec[]> {
    return firstValueFrom(this.http.get<JigsawUserSpec[]>(`${environment.jigsawApi}/jigsaw-users`));
  }

  /** Changes the name or the alias of another account (an admin does it): the account as it is then, or the reason it was refused (the alias is taken, ...). */
  async changeAccount(id: string, change: { name?: string; username?: string }): Promise<{ user: JigsawUserSpec } | { error: string }> {
    try {
      const user = await firstValueFrom(this.http.put<JigsawUserSpec>(this.url(id), change));
      if (user.id === this.user()?.id) this.user.set(user);
      return { user };
    } catch (err) {
      return { error: reasonOf(err) };
    }
  }

  /**
   * An admin goes into an account: from now on the app is that account (its jigsaws, rounds and settings, seen and changed as it), with no login of its own; the calls say who the admin is
   * (the Bearer token of the admin's own login, which every call carries) and the server lets that login act as the account, except for the account's logins. The reason when it is not allowed, or ''.
   */
  async openAs(id: string): Promise<string> {
    // only a login that is an admin's goes into an account; nothing is kept for it: the page plays as the account, and every call carries the admin's own login
    if (!this.adminAccount() || this.user()?.id === id) return tr('userLevels.into.notAllowed', 'Only an admin can go into an account.');
    try {
      const account = await this.read(id);
      this.emptyFinder();
      rememberUserId(account.id);
      this.user.set(account);
      this.loaded = Promise.resolve(account);
      return '';
    } catch (err) {
      return reasonOf(err);
    }
  }

  /** The admin comes out of the account and is the admin account again. */
  async backToAdmin(): Promise<string> {
    const admin = this.admin();
    if (!admin) return '';
    this.emptyFinder();
    return this.selectById(admin.id);
  }

  /** Gives an account a level (an admin does it): the account as it is then, or the reason it was refused (the last admin cannot step down). */
  async setLevel(id: string, level: UserLevel): Promise<{ user: JigsawUserSpec } | { error: string }> {
    try {
      const user = await firstValueFrom(this.http.put<JigsawUserSpec>(`${environment.jigsawApi}/jigsaw-levels/${encodeURIComponent(id)}`, { level }));
      if (user.id === this.user()?.id) this.user.set(user); // an admin who changes their own level is told at once
      void this.readNoAdmin(); // the first admin may have been made
      void this.auth.loadLinked(); // the levels of the accounts of this login: a login that has just become an admin's is one at once
      return { user };
    } catch (err) {
      return { error: reasonOf(err) };
    }
  }

  /**
   * The person picks an account from a list: **one rule for the pages that have such a list**. An open account is played at once. One that needs a login is played with a login that is verified for it, or with an
   * **admin's**: an admin goes into any account, the same as with Open on the page of the levels (the server allows it). Checked before anything is switched: `logon` (nobody is signed in) and `blocked` (this login
   * may not) leave things as they are.
   */
  async playAs(account: JigsawUserSpec): Promise<'playing' | 'logon' | 'blocked'> {
    if (account.protected) {
      if (!this.auth.user()) return 'logon';
      await this.auth.loadLinked(); // read again, so a login added elsewhere counts
      if (!this.auth.linked().some((u) => u.id === account.id)) return this.adminAccount() && !(await this.openAs(account.id)) ? 'playing' : 'blocked';
    }
    this.select(account);
    return 'playing';
  }

  /** Plays as a user from the list. */
  select(user: JigsawUserSpec): void {
    this.choose(user);
  }

  /** Plays as the user with this UID (one that a login is verified for): the user is read first, since the list of a login has only the name. The reason when it could not be read, or ''. */
  async selectById(id: string): Promise<string> {
    try {
      this.choose(await this.read(id));
      return '';
    } catch (err) {
      return reasonOf(err);
    }
  }

  /** Reads the user who plays again (it was changed on the server, say a login was added), without changing who plays. */
  async refresh(): Promise<void> {
    const me = this.user();
    if (!me) return;
    try {
      this.user.set(await this.read(me.id));
    } catch {
      /* it is read again at the next visit */
    }
  }

  /** Plays as a user that exists: found by the user name. The reason when there is no such user. */
  async use(username: string): Promise<string> {
    const error = JigsawUsers.usernameError(username);
    if (error) return error;
    try {
      this.choose(await this.readByAlias(username));
      return '';
    } catch (err) {
      return err instanceof HttpErrorResponse && err.status === 404 ? tr('jigsawUser.noSuchUser', 'There is no user with that alias.') : reasonOf(err);
    }
  }

  /**
   * Changes the user who plays: only what is given (an e-mail address that is null is taken away; the address is private and is never read back). The reason when it could
   * not be changed (the user name is taken, a field is not allowed).
   */
  async update(change: UserEdit): Promise<string> {
    const me = this.user();
    if (!me) return tr('jigsawUser.chooseFirst', 'Choose an account first.');
    try {
      const saved = await firstValueFrom(this.http.put<JigsawUserSpec>(this.url(me.id), change));
      this.user.set(saved);
      this.language.use(saved.language);
      return '';
    } catch (err) {
      return reasonOf(err);
    }
  }

  /** The language is chosen in the menu: the app is shown in it, and it is kept as the language of the user who plays (nothing is kept for nobody: the choice stays on this device). */
  async changeLanguage(code: string): Promise<void> {
    this.language.use(code);
    const me = this.user();
    if (me && me.language !== code) await this.update({ language: code });
  }

  /** A choice of the player (how they look for jigsaws, the play area, the text, the sizes...) is kept with the account that plays, so it is the same on every device. Nothing is kept for nobody; a failure is not told (the device keeps it). */
  async keep(choice: UserSettings): Promise<void> {
    if (this.user()) await this.update(choice);
  }

  /** Deletes a user for good; the server only does it when nothing is attached to it (no jigsaws, no rounds played, no other login), and says why when not. Lets the user go when it was the one playing. */
  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(this.url(id)));
    if (this.user()?.id === id) this.leave();
  }

  /** Stops playing as this user (the user stays in the database). */
  leave(): void {
    this.emptyFinder();
    rememberUserId(null);
    this.user.set(null);
    this.loaded = Promise.resolve(null);
  }

  /**
   * What was looked for belongs to the person who looked: when the user changes (another account is chosen, or none plays any more) the filter of the front page is emptied, so the next person sees all the
   * pictures. How they are shown (cards or list) stays. An empty setup is written, not nothing, so a device that has been emptied is not given the search of the user again when the page opens.
   */
  private emptyFinder(): void {
    writeFinderPreferences(FRONT_FINDER_KEY, { view: readFinderPreferences(FRONT_FINDER_KEY).view, filter: JigsawFilters.empty() });
  }

  private choose(user: JigsawUserSpec): void {
    if (this.user()?.id !== user.id) this.emptyFinder();
    rememberUserId(user.id);
    // the account was chosen: the lists put it first the next time (a failure is not worth telling the person about)
    void firstValueFrom(this.http.post(`${this.url(user.id)}/used`, {})).catch(() => undefined);
    this.user.set(user);
    this.language.use(user.language); // the app is shown in the language of the user
    this.loaded = Promise.resolve(user);
  }
}

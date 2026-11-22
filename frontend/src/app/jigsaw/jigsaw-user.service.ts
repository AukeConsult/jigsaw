import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { tr } from '../core/i18n';
import { LanguageService } from '../core/language.service';
import { environment } from '../../environments/environment';
import { JigsawSetup } from '../models/shared/jigsaw-filter';
import { JigsawUserSpec, JigsawUsers } from '../models/shared/jigsaw-user';
import { FRONT_FINDER_KEY, hasFinderPreferences, writeFinderPreferences } from './jigsaw-finder/finder-preferences';

/** Where the browser keeps which user is playing (the UID; the user itself is in the database). An earlier version kept the user name, which was then the id too. */
const STORED_KEY = 'jigsaw.userId';
const LEGACY_KEY = 'jigsaw.username';

/** Why a request about a user failed, in words for the person (the API says why when it can). */
function reasonOf(err: unknown): string {
  const body = err instanceof HttpErrorResponse ? (err.error as { error?: string } | null) : null;
  return body?.error ?? tr('jigsawUser.couldNotReach', 'Could not reach the server: try again.');
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
  private loaded: Promise<JigsawUserSpec | null> | null = null;

  private url(id: string): string {
    return `${environment.jigsawApi}/jigsaw-users/${encodeURIComponent(id)}`;
  }

  private stored(): string | null {
    try {
      return localStorage.getItem(STORED_KEY) ?? localStorage.getItem(LEGACY_KEY);
    } catch {
      return null;
    }
  }

  private remember(id: string | null): void {
    try {
      localStorage.removeItem(LEGACY_KEY);
      if (id) localStorage.setItem(STORED_KEY, id);
      else localStorage.removeItem(STORED_KEY);
    } catch {
      /* no storage: the user is asked for again the next time */
    }
  }

  /** The user who played here last, read from the database (once); null when none was chosen or the user is gone. */
  load(): Promise<JigsawUserSpec | null> {
    this.loaded ??= (async () => {
      const id = this.stored();
      if (!id) return null;
      try {
        const user = await firstValueFrom(this.http.get<JigsawUserSpec>(this.url(id)));
        this.user.set(user);
        this.language.use(user.language); // the app is shown in the language of the user
        if (user.search && !hasFinderPreferences(FRONT_FINDER_KEY)) writeFinderPreferences(FRONT_FINDER_KEY, user.search); // a device that has no search of its own takes the user's
        return user;
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 404) this.remember(null); // the user is gone: choose again
        return null;
      }
    })();
    return this.loaded;
  }

  /** Makes a user and plays as them. The reason when it could not be made (the user name is taken, a field is not allowed). */
  async create(username: string, name: string, email = '', language?: string): Promise<string> {
    const error = JigsawUsers.error({ username, name, email, language });
    if (error) return error;
    try {
      const user = await firstValueFrom(this.http.post<JigsawUserSpec>(`${environment.jigsawApi}/jigsaw-users`, { username, name, ...(email.trim() ? { email: email.trim() } : {}), ...(language ? { language } : {}) }));
      this.choose(user);
      return '';
    } catch (err) {
      return reasonOf(err);
    }
  }

  /** The users to choose from (without their e-mail addresses), by name. */
  list(): Promise<JigsawUserSpec[]> {
    return firstValueFrom(this.http.get<JigsawUserSpec[]>(`${environment.jigsawApi}/jigsaw-users`));
  }

  /** Plays as a user from the list. */
  select(user: JigsawUserSpec): void {
    this.choose(user);
  }

  /** Plays as a user that exists: found by the user name. The reason when there is no such user. */
  async use(username: string): Promise<string> {
    const error = JigsawUsers.usernameError(username);
    if (error) return error;
    try {
      this.choose(await firstValueFrom(this.http.get<JigsawUserSpec>(`${environment.jigsawApi}/jigsaw-users/by-username/${encodeURIComponent(JigsawUsers.normalised(username))}`)));
      return '';
    } catch (err) {
      return err instanceof HttpErrorResponse && err.status === 404 ? tr('jigsawUser.noSuchUser', 'There is no user with that user name.') : reasonOf(err);
    }
  }

  /**
   * Changes the user who plays: only what is given (an e-mail address that is null is taken away; the address is private and is never read back). The reason when it could
   * not be changed (the user name is taken, a field is not allowed).
   */
  async update(change: { name?: string; username?: string; email?: string | null; language?: string; search?: JigsawSetup }): Promise<string> {
    const me = this.user();
    if (!me) return tr('jigsawUser.chooseFirst', 'Choose a user first.');
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

  /** How the user looks for jigsaws (cards or list, and the filter) is kept with the user, when Go is pressed on the Find page: it is the same on every device. Nothing is kept for nobody; a failure is not told (the device keeps it). */
  async saveSearch(search: JigsawSetup): Promise<void> {
    if (this.user()) await this.update({ search });
  }

  /** Stops playing as this user (the user stays in the database). */
  leave(): void {
    this.remember(null);
    this.user.set(null);
    this.loaded = Promise.resolve(null);
  }

  private choose(user: JigsawUserSpec): void {
    this.remember(user.id);
    this.user.set(user);
    this.language.use(user.language); // the app is shown in the language of the user
    if (user.search) writeFinderPreferences(FRONT_FINDER_KEY, user.search); // a user who is chosen brings their search
    this.loaded = Promise.resolve(user);
  }
}

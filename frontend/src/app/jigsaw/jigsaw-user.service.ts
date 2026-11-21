import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { tr } from '../core/i18n';
import { environment } from '../../environments/environment';
import { JigsawUserSpec, JigsawUsers } from '../models/shared/jigsaw-user';

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

  /** the user who is playing now (null: none chosen yet) */
  readonly user = signal<JigsawUserSpec | null>(null);
  private loaded: Promise<JigsawUserSpec | null> | null = null;

  private url(id: string): string {
    return `${environment.apiBase}/jigsaw-users/${encodeURIComponent(id)}`;
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
        return user;
      } catch (err) {
        if (err instanceof HttpErrorResponse && err.status === 404) this.remember(null); // the user is gone: choose again
        return null;
      }
    })();
    return this.loaded;
  }

  /** Makes a user and plays as them. The reason when it could not be made (the user name is taken, a field is not allowed). */
  async create(username: string, name: string, email = ''): Promise<string> {
    const error = JigsawUsers.error({ username, name, email });
    if (error) return error;
    try {
      const user = await firstValueFrom(this.http.post<JigsawUserSpec>(`${environment.apiBase}/jigsaw-users`, { username, name, ...(email.trim() ? { email: email.trim() } : {}) }));
      this.choose(user);
      return '';
    } catch (err) {
      return reasonOf(err);
    }
  }

  /** The users to choose from (without their e-mail addresses), by name. */
  list(): Promise<JigsawUserSpec[]> {
    return firstValueFrom(this.http.get<JigsawUserSpec[]>(`${environment.apiBase}/jigsaw-users`));
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
      this.choose(await firstValueFrom(this.http.get<JigsawUserSpec>(`${environment.apiBase}/jigsaw-users/by-username/${encodeURIComponent(JigsawUsers.normalised(username))}`)));
      return '';
    } catch (err) {
      return err instanceof HttpErrorResponse && err.status === 404 ? tr('jigsawUser.noSuchUser', 'There is no user with that user name.') : reasonOf(err);
    }
  }

  /**
   * Changes the user who plays: only what is given (an e-mail address that is null is taken away; the address is private and is never read back). The reason when it could
   * not be changed (the user name is taken, a field is not allowed).
   */
  async update(change: { name?: string; username?: string; email?: string | null }): Promise<string> {
    const me = this.user();
    if (!me) return tr('jigsawUser.chooseFirst', 'Choose a user first.');
    try {
      this.user.set(await firstValueFrom(this.http.put<JigsawUserSpec>(this.url(me.id), change)));
      return '';
    } catch (err) {
      return reasonOf(err);
    }
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
    this.loaded = Promise.resolve(user);
  }
}

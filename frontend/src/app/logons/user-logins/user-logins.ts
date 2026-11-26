import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { JigsawUserService } from '../../jigsaw/jigsaw-user.service';
import { LinkCodes, UserLogon } from '../../models/shared/logon';
import { AuthService } from '../auth.service';
import { LogonLanding } from '../logon-landing';
import { LogonsService } from '../logons.service';
import { apiError } from '../../core/api-error';

/**
 * The logins of the user who plays, in the edit form of the user (under Contact): the list of the Firebase accounts that are verified for it (any one of them is enough to use it; the person is signed in with one at a time). A user with no login is open to
 * anybody who picks it; the person who is signed in can verify their login for it, and then only the logins in the list can use it. A second login is added with a link code: made here, typed on the
 * other login (`app-my-logon-users`). Any login of the user may take any of them away; the last one makes the user open again.
 */
@Component({
  selector: 'app-user-logins',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('logons')],
  host: { class: 'd-block mb-3' }, // it sits in the edit form of the user, above Cancel and Save
  templateUrl: './user-logins.html',
})
export class UserLogins {
  protected readonly auth = inject(AuthService);
  protected readonly users = inject(JigsawUserService);
  private readonly logons = inject(LogonsService);
  /** the sign-in from here is to have the login verified for the user: the landing does it once the person is signed in */
  protected readonly landing = inject(LogonLanding);

  /** the verified logins of the user, as the page may know them (null: not read yet) */
  protected readonly items = signal<UserLogon[] | null>(null);
  protected readonly max = signal(7);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** the link code that was made, and when it runs out */
  protected readonly code = signal<{ code: string; expiresAt: number } | null>(null);
  protected readonly copied = signal(false);
  /** the ref of the login whose removal waits for "Yes" */
  protected readonly confirming = signal<string | null>(null);
  protected readonly minutes = LinkCodes.MINUTES;
  /** the logins whose picture could not be read: they show the icon of their kind instead */
  protected readonly broken = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // the logins are read when there is a user that has some and somebody is signed in (without a login nobody may ask: the server would turn it down)
    effect(() => {
      const me = this.users.user();
      const signedIn = !!this.auth.user();
      untracked(() => {
        this.code.set(null);
        this.confirming.set(null);
        if (me?.protected && signedIn) void this.read(me.id);
        else this.items.set(me?.protected ? null : []);
      });
    });
  }

  /** The icon of a kind of login (Google, an e-mail address with a password or a link, a phone number). */
  protected iconOf(provider: string | null): string {
    return ({ 'google.com': 'bi-google', password: 'bi-envelope', phone: 'bi-telephone' } as Record<string, string>)[provider ?? ''] ?? 'bi-person-badge';
  }

  protected lacksPicture(ref: string): void {
    this.broken.update((now) => new Set([...now, ref]));
  }

  private async read(userId: string): Promise<void> {
    try {
      const list = await this.logons.list(userId);
      this.items.set(list.items);
      this.max.set(list.max);
    } catch (err) {
      this.items.set([]);
      this.error.set(this.reason(err));
    }
  }

  private reason(err: unknown): string {
    return apiError(err) ?? tr('logons.userLogins.failed', 'That did not work: try again.');
  }

  /** The name that shows which login is signed in: the name of the account, else its address. */
  protected who(): string {
    return this.auth.user()?.displayName || this.auth.user()?.email || '';
  }

  /** Signs the login out: the section then shows the way to sign in. */
  protected async signOut(): Promise<void> {
    await this.auth.logout();
  }

  /** Signs out and goes to sign in with another login; that login is verified for this user when the person is back. */
  protected async otherLogin(): Promise<void> {
    const me = this.users.user();
    if (me) await this.landing.switchLogin(me.id);
  }

  /** The login that is signed in is verified for the user: from now on only its logins use it. */
  protected async protect(): Promise<void> {
    const me = this.users.user();
    if (!me) return;
    await this.run(async () => {
      await this.logons.link(me.id);
      await this.users.refresh();
      await this.auth.loadLinked();
    });
  }

  /** A link code for a second login (shown to the person, who types it after signing in with the other login). */
  protected async makeCode(): Promise<void> {
    const me = this.users.user();
    if (!me) return;
    await this.run(async () => {
      this.copied.set(false);
      this.code.set(await this.logons.makeCode(me.id));
    });
  }

  protected async copy(): Promise<void> {
    const code = this.code()?.code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      this.copied.set(true);
    } catch {
      /* the person types it by hand */
    }
  }

  /** One login is taken away. When it was the last, the user is open to anybody again. */
  protected async remove(ref: string): Promise<void> {
    const me = this.users.user();
    if (!me) return;
    this.confirming.set(null);
    await this.run(async () => {
      const mine = this.items()?.find((i) => i.ref === ref)?.you;
      await this.logons.remove(me.id, ref);
      await this.users.refresh();
      await this.auth.loadLinked();
      if (mine) this.items.update((list) => (list ?? []).filter((i) => i.ref !== ref)); // the login that is signed in took itself away: it may not ask any more, the next call says so
      else await this.read(me.id);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
    } catch (err) {
      this.error.set(this.reason(err));
    } finally {
      this.busy.set(false);
    }
  }
}

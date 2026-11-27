import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { JigsawUserService } from '../jigsaw/jigsaw-user.service';
import { AuthService } from './auth.service';
import { LogonsService } from './logons.service';

/** Where the wish to verify the login for the user is kept between pressing "Sign in to protect this user" and being signed in (an e-mail link opens in another tab, so it is on the device, not in the tab), it runs out. */
const INTENT_KEY = 'jigsaw.protectAfterLogin';
const INTENT_MS = 30 * 60_000;
/** The page of the account, where the logins of the user are: where a login that was started to verify one ends. */
const ACCOUNT_PAGE = '/play/account';
/**
 * Where a person goes when a login is done. A person who signed in from "Sign in to protect this user" has this login verified for that user at once (they asked for it by pressing that), and goes to the
 * account page, where the list of the verified logins is. A person who plays as a user already goes on, and keeps that user (the server says at the first call whether this login may use it). A person who
 * plays as nobody and whose login is verified for exactly one user plays as that user; with several, or none, they go to the account page to choose, or to make one with the login.
 */
@Injectable({ providedIn: 'root' })
export class LogonLanding {
  private readonly auth = inject(AuthService);
  private readonly users = inject(JigsawUserService);
  private readonly router = inject(Router);
  private readonly logons = inject(LogonsService);

  /** Where the person is now, as a page a login comes back to. A login page is left out: it goes home. */
  here(): string {
    const url = this.router.url.split('#')[0];
    return url.startsWith('/login') ? '/' : url;
  }

  /** The page of the account, where the logins of the user are. */
  accountPage(): string {
    return ACCOUNT_PAGE;
  }

  /** The person is about to sign in to have the login verified for this user (the one who plays now): `go` does it once they are signed in, and comes back to the account page. */
  intend(userId: string): void {
    try {
      localStorage.setItem(INTENT_KEY, JSON.stringify({ userId, at: Date.now() }));
    } catch {
      /* no storage: the person presses Protect after signing in */
    }
  }

  /**
   * "Sign in with another login": the login that is signed in is signed out and the person goes to the login page. With a user id (a user that has no login yet) the next login is verified for that user, as
   * when the person signs in from "Sign in to protect this user", and whatever comes of the login the person is back at the account page, at the list of the logins. Without one, the
   * person comes back to the page they pressed it on.
   */
  async switchLogin(verifyForUserId?: string): Promise<void> {
    if (verifyForUserId) this.intend(verifyForUserId);
    await this.auth.logout();
    await this.router.navigate(['/login'], { queryParams: { next: verifyForUserId ? this.accountPage() : this.here() } });
  }

  /** The user the person wanted to protect, once (it is forgotten as it is read), or null when there is none or it has run out. */
  private takeIntent(): string | null {
    try {
      const raw = localStorage.getItem(INTENT_KEY);
      localStorage.removeItem(INTENT_KEY);
      const wish = raw ? (JSON.parse(raw) as { userId?: unknown; at?: unknown }) : null;
      return wish && typeof wish.userId === 'string' && typeof wish.at === 'number' && Date.now() - wish.at < INTENT_MS ? wish.userId : null;
    } catch {
      return null;
    }
  }

  async go(next: string | null): Promise<void> {
    const active = await this.users.load();
    // a login that was started to verify the user (the one the person has chosen on this device: a link from outside cannot make a login verified for another user): it is verified for the user when nothing
    // protects it yet, and whatever comes of that (it is done, it could not be done, or the user is protected already) the person is back at the account page
    const wish = this.takeIntent();
    if (active && wish === active.id) {
      if (!active.protected) await this.verify(active.id);
      return void (await this.router.navigateByUrl(ACCOUNT_PAGE));
    }
    const linked = this.auth.linked();
    if (!active && linked.length === 1 && !(await this.users.selectById(linked[0].id))) return void (await this.router.navigateByUrl(this.auth.landingPath(next)));
    // to the account page, where the accounts are chosen (it goes on to `next` where it allows that)
    if (!active && linked.length !== 1) return void (await this.router.navigate([ACCOUNT_PAGE], { queryParams: next ? { next } : {} }));
    await this.router.navigateByUrl(this.auth.landingPath(next));
  }

  /** Verifies the login that is signed in for the user. False when it could not be done (the person can press Protect on the page). */
  private async verify(userId: string): Promise<boolean> {
    try {
      await this.logons.link(userId);
      await this.users.refresh();
      await this.auth.loadLinked();
      return true;
    } catch {
      return false;
    }
  }
}

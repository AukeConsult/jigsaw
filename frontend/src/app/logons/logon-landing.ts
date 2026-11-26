import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { JigsawUserService } from '../jigsaw/jigsaw-user.service';
import { AuthService } from './auth.service';
import { LogonsService } from './logons.service';
import { isLocalPath, isPlayUrl } from '../core/app-mode';

/** Where the wish to verify the login for the user is kept between pressing "Sign in to protect this user" and being signed in (an e-mail link opens in another tab, so it is on the device, not in the tab), with the page it was pressed on; it runs out. */
const INTENT_KEY = 'jigsaw.protectAfterLogin';
const INTENT_MS = 30 * 60_000;
/** The website's page of the user with the edit form open, at the list of the logins: where a login that was started from the edit form of the website ends. */
const EDIT_FORM = '/jigsaw/user?logins=1';
/** The page of the account in the app: where a login that was started in the app ends (it has the logins in it). */
const APP_ACCOUNT = '/play/account';
/**
 * Where a person goes when a login is done. A person who signed in from "Sign in to protect this user" has this login verified for that user at once (they asked for it by pressing that), and goes to the
 * edit form of the user, where the list of the verified logins is (a login started from the edit form always ends there). A person who plays as a user already goes on, and keeps that user (the server says at the first call whether this login may use it). A person who
 * plays as nobody and whose login is verified for exactly one user plays as that user; with several, or none, they go to the page of the users to choose, or to make one with the login.
 */
@Injectable({ providedIn: 'root' })
export class LogonLanding {
  private readonly auth = inject(AuthService);
  private readonly users = inject(JigsawUserService);
  private readonly router = inject(Router);
  private readonly logons = inject(LogonsService);

  /** Where the person is now, as a page a login comes back to: **relative to the module they are in** (the website or the app), never the other one. A login page is left out: it goes home. */
  here(): string {
    const url = this.router.url.split('#')[0];
    return url.startsWith('/login') ? '/' : url;
  }

  /** The page of the account in the module the person is in, where the logins of the user are: the edit form of the website's page of the user, or the account page of the app. */
  accountPage(): string {
    return isPlayUrl(this.router.url) ? APP_ACCOUNT : EDIT_FORM;
  }

  /** The person is about to sign in to have the login verified for this user (the one who plays now): `go` does it once they are signed in, and comes back to the page they pressed it on. */
  intend(userId: string): void {
    try {
      localStorage.setItem(INTENT_KEY, JSON.stringify({ userId, back: this.accountPage(), at: Date.now() }));
    } catch {
      /* no storage: the person presses Protect after signing in */
    }
  }

  /**
   * "Sign in with another login": the login that is signed in is signed out and the person goes to the login page. With a user id (a user that has no login yet) the next login is verified for that user, as
   * when the person signs in from "Sign in to protect this user", and (it is the edit form that asked) whatever comes of the login the person is back at the account of the user, at the list of the logins. Without one, the
   * person comes back to the page they pressed it on. Both stay in the module the person is in (the website or the app).
   */
  async switchLogin(verifyForUserId?: string): Promise<void> {
    if (verifyForUserId) this.intend(verifyForUserId);
    await this.auth.logout();
    await this.router.navigate(['/login'], { queryParams: { next: verifyForUserId ? this.accountPage() : this.here() } });
  }

  /** The user the person wanted to protect and the page to come back to, once (it is forgotten as it is read), or null when there is none or it has run out. */
  private takeIntent(): { userId: string; back: string } | null {
    try {
      const raw = localStorage.getItem(INTENT_KEY);
      localStorage.removeItem(INTENT_KEY);
      const wish = raw ? (JSON.parse(raw) as { userId?: unknown; back?: unknown; at?: unknown }) : null;
      return wish && typeof wish.userId === 'string' && typeof wish.at === 'number' && Date.now() - wish.at < INTENT_MS ? { userId: wish.userId, back: isLocalPath(wish.back) ? wish.back : EDIT_FORM } : null;
    } catch {
      return null;
    }
  }

  async go(next: string | null): Promise<void> {
    const active = await this.users.load();
    // a login that was started from the edit form (for the user the person has chosen on this device: a link from outside cannot make a login verified for another user): it is verified for the user when nothing
    // protects it yet, and whatever comes of that (it is done, it could not be done, or the user is protected already) the person is back at the edit form
    const wish = this.takeIntent();
    if (active && wish?.userId === active.id) {
      if (!active.protected) await this.verify(active.id);
      return void (await this.router.navigateByUrl(wish.back));
    }
    const linked = this.auth.linked();
    if (!active && linked.length === 1 && !(await this.users.selectById(linked[0].id))) return void (await this.router.navigateByUrl(this.auth.landingPath(next)));
    if (!active && linked.length !== 1) {
      // to the page where the accounts are chosen, in the module the person came from: the website's page of the user, or the account page of the app
      if (isPlayUrl(next)) return void (await this.router.navigateByUrl(APP_ACCOUNT));
      const toPage = next && /^\/jigsaw(\/|$)/.test(next) && !next.startsWith('//') ? { next } : {};
      return void (await this.router.navigate(['/jigsaw/user'], { queryParams: toPage }));
    }
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

import { Injectable, inject } from '@angular/core';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { AuthService } from '../../app/logons/auth.service';
import { LogonsService } from '../../app/logons/logons.service';

/** Where the wish to verify the login for the user is kept between pressing "Lock this account" and being signed in (an e-mail link opens in another tab, so it is on the device, not in the tab); it runs out. */
const INTENT_KEY = 'jigsaw.protectAfterLogin';
const INTENT_MS = 30 * 60_000;

/**
 * What happens when a login is done, in the app (a fresh copy of the website's `LogonLanding`, which goes to pages: the app has none yet, so nothing here navigates; the helper changes with the
 * circumstances). A person who signed in from "Lock this account" has this login verified for that account at once (they asked for it by pressing that). A person who plays as an account already goes on,
 * and keeps it (the server says at the first call whether this login may use it). A person who plays as nobody and whose login is verified for exactly one account plays as that account; with several,
 * or none, the accounts are shown to choose from, or to make one with the login.
 */
@Injectable({ providedIn: 'root' })
export class PlayLogonLanding {
  private readonly auth = inject(AuthService);
  private readonly users = inject(JigsawUserService);
  private readonly logons = inject(LogonsService);

  /** The person is about to sign in to have the login verified for this account (the one who plays now): `go` does it once they are signed in. */
  intend(userId: string): void {
    try {
      localStorage.setItem(INTENT_KEY, JSON.stringify({ userId, at: Date.now() }));
    } catch {
      /* no storage: the person presses Lock after signing in */
    }
  }

  /** "Use another sign-in": the login that is signed in is signed out. With an account id, the next login is verified for that account, as when the person signs in from "Lock this account". */
  async switchLogin(verifyForUserId?: string): Promise<void> {
    if (verifyForUserId) this.intend(verifyForUserId);
    await this.auth.logout();
  }

  /** The account the person wanted to lock, once (it is forgotten as it is read), or null when there is none or it has run out. */
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

  /**
   * Called when a login is done. True when the login was started from the form of the account ("Lock this account" or "Use another sign-in" there): whatever came of it (it is done, it could not be done, or the
   * account is locked already) the person is back at the form of the account, at the logins, as in the website.
   */
  async go(): Promise<boolean> {
    const active = await this.users.load();
    if (active && this.takeIntent() === active.id) {
      if (!active.protected) await this.verify(active.id);
      return true;
    }
    const linked = this.auth.linked();
    if (!active && linked.length === 1) await this.users.selectById(linked[0].id);
    return false;
  }

  /** Verifies the login that is signed in for the account. False when it could not be done (the person can press Lock this account again). */
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

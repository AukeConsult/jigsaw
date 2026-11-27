import { Injectable, signal } from '@angular/core';
import {
  GoogleAuthProvider,
  User,
  createUserWithEmailAndPassword,
  isSignInWithEmailLink,
  onAuthStateChanged,
  onIdTokenChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  signInWithEmailLink,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { environment } from '../../environments/environment';
import { tr } from '../core/i18n';
import { LinkedUser, LogonSession } from '../models/shared/logon';
import { auth } from './firebase';
import { isLocalPath } from '../core/local-path';

/** Where the email is kept between asking for a sign-in link and opening it (the same device). */
const EMAIL_KEY = 'jigsaw.emailForSignIn';

/**
 * Signing in with Firebase (Google, email and password, an emailed link). The person who is signed in is `user`; every way of signing in ends in `finishLogin`, which tells the
 * API, and the API makes or updates the account that Karins jigsaw shares with Seven Friends. This is beside the users of the jigsaw (`JigsawUserService`), which it does not change.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  /** the person who is signed in (null: nobody) */
  readonly user = signal<User | null>(null);

  /** the jigsaw users that the account that is signed in is verified for (none when nobody is signed in, or the account has not been linked to any) */
  readonly linked = signal<LinkedUser[]>([]);

  /** Resolves once Firebase has restored (or not) the earlier sign-in. */
  readonly ready = new Promise<void>((resolve) => {
    onAuthStateChanged(
      auth,
      (user) => {
        this.user.set(user);
        if (user) void this.loadLinked(user);
        else this.linked.set([]);
        resolve();
      },
      () => resolve(), // the login did not start (a wrong Firebase setting): treated as signed out
    );
    setTimeout(resolve, 4000); // never keep the app waiting for good
  });

  /** the ID token of who is signed in, at hand for a request that cannot wait for it (see `headersNow`) */
  private idToken: string | null = null;
  private renewal: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    onIdTokenChanged(auth, (user) => void this.keepToken(user)); // a sign-in, a sign-out and every new token
  }

  /** The login of a request that must be sent at once (the page is being closed or hidden, so nothing can be waited for): the header `authTokenInterceptor` adds, or none when nobody is signed in. */
  headersNow(): { Authorization?: string } {
    return this.idToken ? { Authorization: `Bearer ${this.idToken}` } : {};
  }

  private async keepToken(user: User | null): Promise<void> {
    clearTimeout(this.renewal);
    if (!user) {
      this.idToken = null;
      return;
    }
    try {
      const { token, expirationTime } = await user.getIdTokenResult();
      if (auth.currentUser !== user) return; // signed out, or in as another, while it was read
      this.idToken = token;
      // a token lasts an hour and Firebase renews it only when asked: ask just before it runs out (the new one comes back here)
      this.renewal = setTimeout(() => void user.getIdToken().catch(() => undefined), Date.parse(expirationTime) - Date.now() - 20_000);
    } catch {
      this.idToken = null; // no token now: the server says so if it is needed
    }
  }

  async signInWithGoogle(): Promise<void> {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    const { user } = await signInWithPopup(auth, provider);
    await this.finishLogin(user);
  }

  async signInWithEmail(email: string, password: string): Promise<void> {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await this.finishLogin(user);
  }

  /** Makes the account, and asks for the address to be confirmed (best effort: the account is made all the same). */
  async registerWithEmail(email: string, password: string, name?: string): Promise<void> {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    if (name) {
      await updateProfile(user, { displayName: name });
      await user.getIdToken(true); // the token made at sign-up has no name yet: the API reads the name from the token
    }
    try {
      await sendEmailVerification(user, { url: `${location.origin}/play/account` });
    } catch {
      /* the email could not be sent: the account is there, and the address can be confirmed later */
    }
    await this.finishLogin(user);
  }

  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(auth, email);
  }

  /** Step 1 of the sign-in link: email a link; opening it brings the person to `/login/link`. */
  async sendSignInLink(email: string): Promise<void> {
    await sendSignInLinkToEmail(auth, email, { url: `${location.origin}/login/link`, handleCodeInApp: true });
    try {
      localStorage.setItem(EMAIL_KEY, email); // so the page the link opens does not have to ask again
    } catch {
      /* no storage: the page asks for the address */
    }
  }

  isSignInLink(url: string = location.href): boolean {
    return isSignInWithEmailLink(auth, url);
  }

  rememberedEmail(): string | null {
    try {
      return localStorage.getItem(EMAIL_KEY);
    } catch {
      return null;
    }
  }

  /** Step 2: the link was opened. Opening it proves the address, so it counts as confirmed. */
  async completeSignInLink(email: string, url: string = location.href): Promise<void> {
    const { user } = await signInWithEmailLink(auth, email, url);
    try {
      localStorage.removeItem(EMAIL_KEY);
    } catch {
      /* nothing to remove */
    }
    await this.finishLogin(user);
  }

  /** Where to go after signing in: the page the person came from (only an address inside the app), else home. */
  landingPath(next: string | null): string {
    return isLocalPath(next) ? next : '/';
  }

  logout(): Promise<void> {
    return signOut(auth);
  }

  /** Reads which jigsaw users the account is verified for (for an account that was signed in before this visit; a login tells it with the session). A failure leaves the list as it is. */
  async loadLinked(user: User | null = auth.currentUser): Promise<void> {
    if (!user) return;
    try {
      const res = await fetch(`${environment.jigsawApi}/session`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
      if (res.ok) this.linked.set(((await res.json()) as { users: LinkedUser[] }).users);
    } catch {
      /* the list is read again at the next change */
    }
  }

  /** Tells the API who has signed in, so the account is kept; signs out again when that fails, so the app and the API agree. */
  private async finishLogin(user: User): Promise<void> {
    try {
      const token = await user.getIdToken();
      const res = await fetch(`${environment.jigsawApi}/session`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(tr('logons.login.syncFailed', 'Could not keep your account ({{ status }}). Please try again.', { status: res.status }));
      this.linked.set(((await res.json()) as LogonSession).users);
    } catch (err) {
      await signOut(auth);
      throw err;
    }
  }
}

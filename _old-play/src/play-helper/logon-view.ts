import { Component, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../app/core/i18n';
import { authMessage, wasCancelled, wasRejected } from '../../app/logons/auth-errors';
import { AuthService } from '../../app/logons/auth.service';
import { HelperView } from '../core/helper-view';
import { PlayLogonLanding } from '../core/play-logon-landing';
import { AccountEdit } from './account-edit';
import { AccountState } from './account-state';

/**
 * The form to log on, in the panel of the logon helper: Google, or email and password, with a way to make a new account and to ask for a new password (a fresh copy of what the
 * website's sign-in page does, with the same `AuthService`). When the logon is done the circumstances change (somebody is logged on) and the helper changes to the one that fits.
 * The texts of the errors of Firebase are the ones of the scope `logons` (`authMessage`), so it is loaded here too.
 */
@Component({
  selector: 'logon-view',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play'), provideTranslocoScope('logons')],
  templateUrl: './logon-view.html',
})
export class LogonView extends HelperView {
  override readonly storageKey = 'play.logonView';
  /** the sign-in form is a step of the account views: it is shown when the person asked for it, in the place of the accounts */
  override readonly visible = (): boolean => this.state.logonOpen();

  private readonly auth = inject(AuthService);
  private readonly landing = inject(PlayLogonLanding);
  protected readonly state = inject(AccountState);
  private readonly edit = inject(AccountEdit);

  protected readonly mode = signal<'signin' | 'signup'>('signin');
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly again = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  /** a logon with email and password was turned down: the person may not have an account yet, so making one is offered clearly */
  protected readonly rejected = signal(false);

  protected toggleMode(): void {
    this.mode.update((m) => (m === 'signin' ? 'signup' : 'signin'));
    this.error.set(null);
    this.info.set(null);
    this.rejected.set(false);
  }

  protected google(): Promise<void> {
    return this.run(() => this.auth.signInWithGoogle());
  }

  protected submit(): Promise<void> {
    const email = this.email().trim();
    const password = this.password();
    if (this.mode() === 'signup' && password !== this.again()) {
      this.error.set(tr('play.logon.passwordsDiffer', 'The two passwords are not the same. Type them again.'));
      return Promise.resolve();
    }
    return this.run(() => (this.mode() === 'signin' ? this.auth.signInWithEmail(email, password) : this.auth.registerWithEmail(email, password, this.name().trim() || undefined)));
  }

  protected async forgot(): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    const email = this.email().trim();
    if (!email) {
      this.error.set(tr('play.logon.enterEmail', 'Enter your email first.'));
      return;
    }
    try {
      await this.auth.resetPassword(email);
      this.info.set(tr('play.logon.resetSent', 'Reset email sent, if this email has a sign-in.'));
    } catch (err) {
      this.error.set(authMessage(err, tr('play.logon.resetFail', 'Could not send reset email.')));
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    this.rejected.set(false);
    try {
      await action();
      const fromForm = await this.landing.go(); // verifies the login for the account the person wanted to lock, or plays as the one account it is verified for
      this.state.closeLogon(); // the accounts are back
      if (fromForm) this.edit.open(); // a login started from the form of the account ends at that form
    } catch (err) {
      if (!wasCancelled(err)) this.error.set(authMessage(err, tr('play.logon.signInFailed', 'Sign-in failed. Please try again.')));
      if (this.mode() === 'signin' && wasRejected(err)) this.rejected.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

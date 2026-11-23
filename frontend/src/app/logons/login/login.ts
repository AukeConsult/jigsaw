import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { authMessage, wasCancelled, wasRejected } from '../auth-errors';
import { AuthService } from '../auth.service';
import { LogonLanding } from '../logon-landing';

/** Sign in or create an account: Google, an emailed link, or email and password. */
@Component({
  selector: 'app-login',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('logons')],
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly landing = inject(LogonLanding);
  private readonly query = inject(ActivatedRoute).snapshot.queryParamMap;
  private readonly next = this.query.get('next');
  /** the person was sent here because the user they had needs a login */
  protected readonly needsLogin = this.query.get('notice') === 'needlogin';

  protected readonly mode = signal<'signin' | 'signup'>('signin');
  protected readonly name = signal('');
  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly again = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly info = signal<string | null>(null);
  /** a sign-in with email and password was turned down: the person may not have an account yet, so creating one is offered clearly */
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
      this.error.set(tr('logons.login.passwordsDiffer', 'The two passwords are not the same. Type them again.'));
      return Promise.resolve();
    }
    return this.run(() => (this.mode() === 'signin' ? this.auth.signInWithEmail(email, password) : this.auth.registerWithEmail(email, password, this.name().trim() || undefined)));
  }

  protected async forgot(): Promise<void> {
    this.error.set(null);
    this.info.set(null);
    const email = this.email().trim();
    if (!email) {
      this.error.set(tr('logons.login.enterEmail', 'Enter your email first.'));
      return;
    }
    try {
      await this.auth.resetPassword(email);
      this.info.set(tr('logons.login.resetSent', 'Password reset email sent (if the account exists).'));
    } catch (err) {
      this.error.set(authMessage(err, tr('logons.login.resetFail', 'Could not send reset email.')));
    }
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    this.info.set(null);
    this.rejected.set(false);
    try {
      await action();
      await this.landing.go(this.next);
    } catch (err) {
      if (!wasCancelled(err)) this.error.set(authMessage(err, tr('logons.login.signInFailed', 'Sign-in failed. Please try again.')));
      if (this.mode() === 'signin' && wasRejected(err)) this.rejected.set(true);
    } finally {
      this.busy.set(false);
    }
  }
}

import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { AuthService } from '../auth.service';

/** Who is signed in with Firebase, and a way to sign out. (Behind `authGuard`, so somebody is always signed in here.) */
@Component({
  selector: 'app-account',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('logons')],
  templateUrl: './account.html',
})
export class Account {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly user = this.auth.user;

  protected async logout(): Promise<void> {
    await this.auth.logout();
    await this.router.navigateByUrl('/login');
  }
}

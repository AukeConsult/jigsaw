import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../jigsaw-user.service';

/**
 * **The band that says an admin is in an account** (everything is done as that account), with the way back: one component for the admin (`app-admin-shell`) and the app (`play-main`). Nothing when no admin is in an account. The way back
 * leaves the account and opens the page of the levels (`/jigsaw`). The host is the band (`.app-banner`, one line over or before the page).
 */
@Component({
  selector: 'app-admin-banner',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('userLevels')],
  host: { class: 'app-banner' },
  template: `
    <ng-container *transloco="let t">
      @if (users.admin(); as admin) {
        <div class="alert alert-warning rounded-0 border-0 border-bottom m-0 py-1 px-2 small d-flex flex-wrap align-items-center justify-content-center gap-2" role="status">
          <span><i class="bi bi-person-gear me-1" aria-hidden="true"></i>{{ t('userLevels.into.banner', { name: users.user()?.name }) || 'You are using ' + users.user()?.name + ' as an admin.' }}</span>
          <button type="button" class="btn btn-sm btn-outline-dark" (click)="back()">{{ t('userLevels.into.back', { name: admin.name }) || 'Back to ' + admin.name }}</button>
        </div>
      }
    </ng-container>
  `,
})
export class AdminBanner {
  protected readonly users = inject(JigsawUserService);
  private readonly router = inject(Router);

  /** The admin comes out of the account they went into, and is back on the page of the accounts. */
  protected async back(): Promise<void> {
    await this.users.backToAdmin();
    await this.router.navigate(['/jigsaw']);
  }
}

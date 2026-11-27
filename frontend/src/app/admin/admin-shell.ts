import { Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LabelFit } from '../core/label-fit';
import { AdminBanner } from '../jigsaw/admin-banner/admin-banner';
import { JigsawUserService } from '../jigsaw/jigsaw-user.service';
import { LanguageSelect } from '../jigsaw/language-select/language-select';
import { Home } from '../home/home';

/**
 * The frame of the admin: one bar over the page that is open, with the logo (home, the app), the pages of the admin, who is logged on, the language and the way back to the app. The words of the bar are shown only while it
 * fits on one line (`appLabelFit`).
 */
@Component({
  selector: 'app-admin-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslocoDirective, LabelFit, AdminBanner, LanguageSelect, Home],
  providers: [provideTranslocoScope('userLevels'), provideTranslocoScope('jigsawUser')],
  host: { class: 'app-shell' },
  template: `
    <ng-container *transloco="let t">
      <header class="app-header menu-style">
        <nav appLabelFit class="d-flex flex-wrap align-items-center gap-2 px-3 py-2" [attr.aria-label]="t('userLevels.menu') || 'Admin'">
          <app-home />
          <div class="nav nav-pills flex-nowrap">
            <a class="nav-link" routerLink="/jigsaw" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }" [title]="t('userLevels.title') || 'Account levels'"><i class="bi bi-shield-lock me-1" aria-hidden="true"></i><span class="fit-label">{{ t('userLevels.title') || 'Account levels' }}</span></a>
            @if (users.isAdmin()) {
              <a class="nav-link" routerLink="/jigsaw/ai-use" routerLinkActive="active" [title]="t('jigsawUser.aiUsage') || 'AI use'"><i class="bi bi-stars me-1" aria-hidden="true"></i><span class="fit-label">{{ t('jigsawUser.aiUsage') || 'AI use' }}</span></a>
            }
          </div>
          <div class="d-flex align-items-center gap-2 ms-auto">
            @if (users.user(); as me) {
              <a class="nav-link text-nowrap" routerLink="/play/account" [title]="me.username"><i class="bi bi-person-circle me-1" aria-hidden="true"></i><span class="fit-label">{{ me.name }}</span></a>
            }
            <app-language-select [inBar]="'top'" />
            <a class="btn btn-sm btn-outline-primary text-nowrap" routerLink="/" [title]="t('userLevels.backToApp') || 'Back to the app'"><i class="bi bi-box-arrow-left me-1" aria-hidden="true"></i><span class="fit-label">{{ t('userLevels.backToApp') || 'Back to the app' }}</span></a>
          </div>
        </nav>
      </header>
      <app-admin-banner />
    </ng-container>
    <router-outlet />
  `,
})
export class AdminShell {
  protected readonly users = inject(JigsawUserService);
}

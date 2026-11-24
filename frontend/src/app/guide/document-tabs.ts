import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** The strip of the documents about the app, shown above each of them: the help, the about page and how to install the app. */
@Component({
  selector: 'app-document-tabs',
  imports: [TranslocoDirective, RouterLink, RouterLinkActive],
  providers: [provideTranslocoScope('guide')],
  template: `
    <nav class="toolbar guide mx-auto mb-3 justify-content-center" *transloco="let t" [attr.aria-label]="t('guide.documents') || 'Documents'">
      <a class="link-action large" routerLink="/jigsaw/guide" routerLinkActive="fw-semibold"><i class="bi bi-book" aria-hidden="true"></i>{{ t('guide.tabGuide') || 'Help' }}</a>
      <a class="link-action large" routerLink="/jigsaw/about" routerLinkActive="fw-semibold"><i class="bi bi-info-circle" aria-hidden="true"></i>{{ t('guide.tabAbout') || 'About' }}</a>
      <a class="link-action large" routerLink="/install" routerLinkActive="fw-semibold"><i class="bi bi-download" aria-hidden="true"></i>{{ t('guide.tabInstall') || 'Install' }}</a>
    </nav>
  `,
})
export class DocumentTabs {}

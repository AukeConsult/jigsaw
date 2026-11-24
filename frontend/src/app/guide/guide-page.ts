import { HttpClient } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { version } from '../../environments/version';
import { LanguageService } from '../core/language.service';
import { renderMarkdown } from '../core/markdown';

/**
 * A user guide, shown from its Markdown file: the guide of the language chosen (`i18n/<language>/<name>`), else the English one. Which guide is in the route data
 * (`jigsaw-guide.md`).
 */
@Component({
  selector: 'app-guide-page',
  imports: [TranslocoDirective, RouterLink, RouterLinkActive],
  providers: [provideTranslocoScope('guide')],
  template: `
    <main class="container-fluid page-margin" *transloco="let t">
      <!-- the two documents: the user guide and the about page -->
      <nav class="toolbar guide mx-auto mb-3 justify-content-center" [attr.aria-label]="t('guide.documents') || 'Documents'">
        <a class="link-action large" routerLink="/jigsaw/guide" routerLinkActive="fw-semibold"><i class="bi bi-book" aria-hidden="true"></i>{{ t('guide.tabGuide') || 'Help' }}</a>
        <a class="link-action large" routerLink="/jigsaw/about" routerLinkActive="fw-semibold"><i class="bi bi-info-circle" aria-hidden="true"></i>{{ t('guide.tabAbout') || 'About' }}</a>
      </nav>
      <article class="guide mx-auto" aria-label="Help">
        @if (failed()) {
          <div class="alert alert-danger py-2 small" role="alert">{{ t('guide.failed') || 'Could not load the help.' }}</div>
        } @else if (html() === null) {
          <p class="text-body-secondary">{{ t('guide.opening') || 'Opening the help…' }}</p>
        } @else {
          <div [innerHTML]="html()"></div>
        }
      </article>
      @if (aboutPage) {
        <!-- which build this is: one more for every build, so an app (Windows, Android, a browser) can be told from another -->
        <p class="text-center text-body-secondary small mt-3">{{ t('guide.version') || 'Version' }} {{ version.name }}@if (version.dev) { · {{ t('guide.devBuild') || 'development build' }}}</p>
      }
    </main>
  `,
})
export class GuidePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);

  /** the build number of this web app, shown on the About page */
  protected readonly version = version;
  /** true on the About page (the same component shows the help and the about document) */
  protected readonly aboutPage = this.route.snapshot.data['guide'] === 'jigsaw-about.md';

  /** the guide as HTML (null: not read yet) */
  readonly html = signal<string | null>(null);
  readonly failed = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.language.lang());
    });
  }

  private async load(lang: string): Promise<void> {
    const name: string = this.route.snapshot.data['guide'] ?? 'jigsaw-guide.md';
    const url = (file: string) => new URL(file, document.baseURI).href;
    const read = (file: string) => firstValueFrom(this.http.get(url(file), { responseType: 'text' }));
    this.failed.set(false);
    // the guide of the language, else the English one
    const places = [`i18n/${lang}/${name}`, `i18n/en/${name}`];
    try {
      let text: string | null = null;
      for (const place of places) {
        try {
          const got = await read(place);
          if (/^\s*<(!doctype|html)/i.test(got)) continue; // a host that answers a missing file with the page of the app (it is not a guide)
          text = got;
          break;
        } catch {
          /* not there: the next place */
        }
      }
      if (text === null) throw new Error('no guide');
      this.html.set(renderMarkdown(text));
    } catch {
      this.failed.set(true);
    }
  }
}

import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { version } from '../../environments/version';
import { LanguageService } from '../core/language.service';
import { renderMarkdown } from '../core/markdown';

/**
 * **A user guide, shown from its Markdown file** (the document, with no page round it: `GuidePage` frames it at `/jigsaw/guide` and `/jigsaw/about`, and the app's info page frames it too): the guide of the language chosen
 * (`i18n/<language>/<name>`), else the English one. Which guide is the input `name` (`jigsaw-guide.md`, `jigsaw-about.md`).
 */
@Component({
  selector: 'app-guide-document',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('guide')],
  template: `
    <ng-container *transloco="let t">
      <article class="guide mx-auto" aria-label="Help">
        @if (failed()) {
          <div class="alert alert-danger py-2 small" role="alert">{{ t('guide.failed') || 'Could not load the help.' }}</div>
        } @else if (html() === null) {
          <p class="text-body-secondary">{{ t('guide.opening') || 'Opening the help…' }}</p>
        } @else {
          <div [innerHTML]="html()"></div>
        }
      </article>
      @if (aboutPage()) {
        <!-- which build this is: one more for every build, so an app (Windows, Android, a browser) can be told from another -->
        <p class="text-center text-body-secondary small mt-3">{{ t('guide.version') || 'Version' }} {{ version.name }}@if (version.dev) { · {{ t('guide.devBuild') || 'development build' }}}</p>
      }
    </ng-container>
  `,
})
export class GuideDocument {
  private readonly http = inject(HttpClient);
  /** the file of the guide */
  readonly name = input('jigsaw-guide.md');
  private readonly language = inject(LanguageService);

  /** the build number of this web app, shown on the About page */
  protected readonly version = version;
  /** true for the About document (the same component shows the help and the about document) */
  protected readonly aboutPage = computed(() => this.name() === 'jigsaw-about.md');

  /** the guide as HTML (null: not read yet) */
  readonly html = signal<string | null>(null);
  readonly failed = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.language.lang(), this.name());
    });
  }

  private async load(lang: string, name: string): Promise<void> {
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

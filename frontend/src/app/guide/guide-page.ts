import { HttpClient } from '@angular/common/http';
import { Component, effect, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { LanguageService } from '../core/language.service';
import { renderMarkdown } from '../core/markdown';

/**
 * A user guide, shown from its Markdown file (in `docs/guide`, copied to `public/docs` by `scripts/sync-docs.mjs`). Which one is in the route data: the jigsaw
 * module shows the short guide of the jigsaw, the canvas module the whole guide. A guide in another language than English is `<name>.<lang>.md` (the
 * English file is the fallback when there is none).
 */
@Component({
  selector: 'app-guide-page',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('guide')],
  template: `
    <main class="container py-4" *transloco="let t">
      <article class="guide mx-auto" aria-label="User guide">
        @if (failed()) {
          <div class="alert alert-danger py-2 small" role="alert">{{ t('guide.failed') || 'Could not load the user guide.' }}</div>
        } @else if (html() === null) {
          <p class="text-body-secondary">{{ t('guide.opening') || 'Opening the user guide…' }}</p>
        } @else {
          <div [innerHTML]="html()"></div>
        }
      </article>
    </main>
  `,
})
export class GuidePage {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly language = inject(LanguageService);

  /** the guide as HTML (null: not read yet) */
  readonly html = signal<string | null>(null);
  readonly failed = signal(false);

  constructor() {
    effect(() => {
      void this.load(this.language.lang());
    });
  }

  private async load(lang: string): Promise<void> {
    const name: string = this.route.snapshot.data['guide'] ?? 'user-guide.md';
    const url = (file: string) => new URL(`docs/${file}`, document.baseURI).href;
    const read = (file: string) => firstValueFrom(this.http.get(url(file), { responseType: 'text' }));
    this.failed.set(false);
    try {
      let text: string;
      try {
        text = lang === 'en' ? await read(name) : await read(name.replace(/\.md$/, `.${lang}.md`));
      } catch {
        text = await read(name);
      }
      this.html.set(renderMarkdown(text));
    } catch {
      this.failed.set(true);
    }
  }
}

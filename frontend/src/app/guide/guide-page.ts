import { HttpClient } from '@angular/common/http';
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { renderMarkdown } from '../core/markdown';

/**
 * A user guide, shown from its Markdown file (in `docs/guide`, copied to `public/docs` by `scripts/sync-docs.mjs`). Which one is in the route data: the jigsaw
 * module shows the short guide of the jigsaw, the canvas module the whole guide.
 */
@Component({
  selector: 'app-guide-page',
  template: `
    <main class="container py-4">
      <article class="guide mx-auto" aria-label="User guide">
        @if (failed()) {
          <div class="alert alert-danger py-2 small" role="alert">Could not load the user guide.</div>
        } @else if (html() === null) {
          <p class="text-body-secondary">Opening the user guide…</p>
        } @else {
          <div [innerHTML]="html()"></div>
        }
      </article>
    </main>
  `,
})
export class GuidePage implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);

  /** the guide as HTML (null: not read yet) */
  readonly html = signal<string | null>(null);
  readonly failed = signal(false);

  async ngOnInit(): Promise<void> {
    try {
      const text = await firstValueFrom(this.http.get(new URL(`docs/${this.route.snapshot.data['guide'] ?? 'user-guide.md'}`, document.baseURI).href, { responseType: 'text' }));
      this.html.set(renderMarkdown(text));
    } catch {
      this.failed.set(true);
    }
  }
}

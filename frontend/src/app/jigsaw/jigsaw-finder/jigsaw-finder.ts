import { Component, OnInit, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JigsawSummary } from '../../models/shared/jigsaw-search';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawRow } from '../jigsaw-row/jigsaw-row';
import { JigsawService, JigsawSearchRequest } from '../jigsaw.service';
import { readFinderPreferences, writeFinderPreferences } from './finder-preferences';

/**
 * The jigsaws that match what was looked for, the newest first, as cards or as a list: how many there are, and a button for the next page. What is looked for, and how the jigsaws
 * are shown, is what was kept under `storageKey` (the Find page sets it). A search that is on is said, with a way to change it or to look at all the jigsaws again. Use it wherever
 * a jigsaw is to be picked.
 */
@Component({
  selector: 'app-jigsaw-finder',
  imports: [RouterLink, TranslocoDirective, JigsawCard, JigsawRow],
  providers: [provideTranslocoScope('jigsawList')],
  host: { class: 'd-block' },
  templateUrl: './jigsaw-finder.html',
})
export class JigsawFinder implements OnInit {
  private readonly service = inject(JigsawService);

  /** where what is looked for is kept on the device */
  readonly storageKey = input('jigsaw.finder');
  /** how many jigsaws a page of the answer has */
  readonly pageSize = input(36);

  readonly view = signal<'list' | 'cards'>('cards');
  /** what is looked for: the jigsaws shown are those it matches */
  readonly filter = signal<JigsawFilter>(JigsawFilters.empty());

  /** the jigsaws found, as many pages as have been asked for */
  readonly items = signal<JigsawSummary[]>([]);
  readonly total = signal(0);
  readonly hasMore = signal(false);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private page = 1;
  /** only the answer to the last question is used */
  private asked = 0;
  /** what was kept has been read: before that, nothing is asked or kept */
  private ready = false;

  constructor() {
    // what is chosen is kept on the device each time it changes
    effect(() => {
      const now = { view: this.view(), filter: this.filter() };
      if (this.ready) writeFinderPreferences(this.storageKey(), now);
    });
    // a new choice of what to look for asks again from the first page
    effect(() => {
      const filter = this.filter();
      const size = this.pageSize();
      if (this.ready) untracked(() => void this.load(filter, 1, size));
    });
  }

  ngOnInit(): void {
    const saved = readFinderPreferences(this.storageKey());
    this.view.set(saved.view);
    this.filter.set(saved.filter);
    this.ready = true; // the first question is asked by the effect, now that the choice is set
  }

  private async load(filter: JigsawFilter, page: number, limit: number): Promise<void> {
    const ticket = ++this.asked;
    this.loading.set(true);
    try {
      const found = await this.service.search(JigsawFilters.query(filter, page, limit) as JigsawSearchRequest);
      if (ticket !== this.asked) return;
      this.page = page;
      this.items.update((now) => (page === 1 ? found.items : [...now, ...found.items]));
      this.total.set(found.total);
      this.hasMore.set(found.hasMore);
      this.failed.set(false);
    } catch {
      if (ticket === this.asked) this.failed.set(true);
    } finally {
      if (ticket === this.asked) this.loading.set(false);
    }
  }

  /** The next page of what was found is added to the end. */
  protected more(): void {
    void this.load(this.filter(), this.page + 1, this.pageSize());
  }

  /** Looks at all the jigsaws again. */
  protected clear(): void {
    this.filter.set(JigsawFilters.empty());
  }

  protected filtered(): boolean {
    return JigsawFilters.isOn(this.filter());
  }
}

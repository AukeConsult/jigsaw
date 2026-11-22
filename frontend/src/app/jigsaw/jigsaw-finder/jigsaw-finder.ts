import { scrollParent } from '../../core/theme';
import { Component, ElementRef, OnInit, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawFilter, JigsawFilters } from '../../models/shared/jigsaw-filter';
import { JigsawSummary } from '../../models/shared/jigsaw-search';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawRow } from '../jigsaw-row/jigsaw-row';
import { JigsawService, JigsawSearchRequest } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { readFinderPreferences } from './finder-preferences';

/**
 * The jigsaws that match what was looked for, the newest first, as cards or as a list: how many there are, and a button for the next page. What is looked for, and how the jigsaws
 * are shown, is what was kept under `storageKey` (the Find page sets it, with Go: this component only reads it, so a change made on the page, as with the quick filters, lasts until the page is left and does not replace what the user looked for). A search that is on is said, with a way to change it or to look at all the jigsaws again. Use it wherever
 * a jigsaw is to be picked.
 */
@Component({
  selector: 'app-jigsaw-finder',
  imports: [TranslocoDirective, JigsawCard, JigsawRow],
  providers: [provideTranslocoScope('jigsawList')],
  host: { class: 'd-block' },
  templateUrl: './jigsaw-finder.html',
})
export class JigsawFinder implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly users = inject(JigsawUserService);

  /** where what is looked for is kept on the device */
  readonly storageKey = input('jigsaw.finder');
  /** how many jigsaws a page of the answer has */
  readonly pageSize = input(20);

  readonly view = signal<'list' | 'cards'>('cards');
  /** what is looked for: the jigsaws shown are those it matches (a page can bind it, `[(filter)]`, to change what is looked for: the Find page's choice is read when the finder opens) */
  readonly filter = model<JigsawFilter>(JigsawFilters.empty());

  /** the jigsaws found, as many pages as have been asked for */
  readonly items = signal<JigsawSummary[]>([]);
  readonly total = signal(0);
  readonly hasMore = signal(false);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private page = 1;
  /** only the answer to the last question is used */
  private asked = 0;
  /** what was kept has been read: before that, nothing is asked */
  private ready = false;

  /** an invisible mark under the last jigsaw: when it comes into view, the next page is asked for */
  private readonly end = viewChild<ElementRef<HTMLElement>>('end');
  /** this browser cannot tell when the end is in view: the button for the next page is shown then */
  protected readonly needsButton = typeof IntersectionObserver === 'undefined';

  constructor() {
    // endless scroll: the mark under the list is watched while there is more; a page is asked for when it is near (400 px before it is in view), once at a time
    effect((onCleanup) => {
      const mark = this.end()?.nativeElement;
      if (!mark || !this.hasMore() || this.needsButton) return;
      const watcher = new IntersectionObserver(
        (seen) => {
          if (seen.some((s) => s.isIntersecting) && !untracked(() => this.loading())) this.more();
        },
        { root: scrollParent(mark), rootMargin: '0px 0px 400px 0px' }, // the page that scrolls inside the window (a phone), else the window
      );
      watcher.observe(mark);
      onCleanup(() => watcher.disconnect());
    });
    // a new choice of what to look for asks again from the first page
    effect(() => {
      const filter = this.filter();
      const size = this.pageSize();
      if (this.ready) untracked(() => void this.load(filter, 1, size));
    });
  }

  async ngOnInit(): Promise<void> {
    await this.users.load(); // the user is read first: a device with no search of its own takes the user's, and it is kept when the user is read
    const saved = readFinderPreferences(this.storageKey());
    this.view.set(saved.view);
    this.filter.set(saved.filter); // what the user looked for (the Find page, Go): this page only reads it; a change made here (a quick filter) is for now and is not kept
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
    if (this.loading() || !this.hasMore()) return;
    void this.load(this.filter(), this.page + 1, this.pageSize());
  }

  protected filtered(): boolean {
    return JigsawFilters.isOn(this.filter());
  }
}

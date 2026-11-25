import { Component, ElementRef, OnInit, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { scrollParent } from '../../app/core/theme';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { JigsawSearchRequest, JigsawService } from '../../app/jigsaw/jigsaw.service';
import { JigsawFilters } from '../../app/models/shared/jigsaw-filter';
import { JigsawSummary } from '../../app/models/shared/jigsaw-search';
import { PicturesAdded } from '../core/pictures-added';
import { PlayCard } from '../play-card/play-card';

/**
 * All the jigsaws, the newest first, as cards (a fresh copy of the website's finder for the app, with no search, no list view, no filters and no count): the
 * next page when the end comes into view.
 */
@Component({
  selector: 'play-cards',
  imports: [TranslocoDirective, PlayCard],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  templateUrl: './play-cards.html',
})
export class PlayCards implements OnInit {
  private readonly service = inject(JigsawService);
  private readonly users = inject(JigsawUserService);
  private readonly added = inject(PicturesAdded);

  /** how many jigsaws a page of the answer has */
  readonly pageSize = input(20);
  /** a card was pressed: the id of its jigsaw */
  readonly open = output<string>();

  /** the jigsaws found, as many pages as have been asked for */
  readonly items = signal<JigsawSummary[]>([]);
  readonly hasMore = signal(false);
  readonly loading = signal(true);
  readonly failed = signal(false);
  private page = 1;

  /** an invisible mark under the last jigsaw: when it comes into view, the next page is asked for */
  private readonly end = viewChild<ElementRef<HTMLElement>>('end');
  /** this browser cannot tell when the end is in view: the button for the next page is shown then */
  protected readonly needsButton = typeof IntersectionObserver === 'undefined';

  constructor() {
    // a picture was added: the list is read again from the first page (the newest first, so it is there)
    let seen = this.added.count();
    effect(() => {
      const now = this.added.count();
      if (now === seen) return;
      seen = now;
      untracked(() => void this.load(1));
    });
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
  }

  async ngOnInit(): Promise<void> {
    await this.users.load(); // who asks is read first: what a person may see depends on it
    await this.load(1);
  }

  private async load(page: number): Promise<void> {
    this.loading.set(true);
    try {
      const found = await this.service.search(JigsawFilters.query(JigsawFilters.empty(), page, this.pageSize()) as JigsawSearchRequest);
      this.page = page;
      this.items.update((now) => (page === 1 ? found.items : [...now, ...found.items]));
      this.hasMore.set(found.hasMore);
      this.failed.set(false);
    } catch {
      this.failed.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  /** The next page of what was found is added to the end. */
  protected more(): void {
    if (this.loading() || !this.hasMore()) return;
    void this.load(this.page + 1);
  }
}

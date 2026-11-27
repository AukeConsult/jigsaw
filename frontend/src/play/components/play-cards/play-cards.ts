import { Component, ElementRef, OnInit, computed, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../app/core/language.service';
import { scrollParent } from '../../../app/core/theme';
import { FeedService, isPicture } from '../../../app/jigsaw/feed.service';
import { FeedTile } from '../../../app/jigsaw/feed-tile/feed-tile';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawSearchRequest, JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PackageItem } from '../../../app/models/shared/feed-item';
import { JigsawFilter, JigsawFilters } from '../../../app/models/shared/jigsaw-filter';
import { JigsawSummary } from '../../../app/models/shared/jigsaw-search';
import { ListView } from '../../list-view';
import { PlayListFilter, listQuestion } from '../../play-list-filter';
import { PlayCard } from '../play-card/play-card';

/**
 * All the jigsaws, the newest first, as cards (no search, no list view and no count), filtered by what the preferences chose: the next page when the end comes into view.
 */
@Component({
  selector: 'play-cards',
  imports: [TranslocoDirective, PlayCard, FeedTile],
  providers: [provideTranslocoScope('play'), provideTranslocoScope('jigsawList')],
  host: { class: 'd-block' },
  templateUrl: './play-cards.html',
})
export class PlayCards implements OnInit {
  private readonly service = inject(JigsawService);
  protected readonly users = inject(JigsawUserService);
  private readonly list = inject(PlayListFilter);
  private readonly feed = inject(FeedService);
  /** what the home page shows, as the menu of the helper has it: here, whether only the favorites are listed */
  protected readonly view = inject(ListView);

  /** how many jigsaws a page of the answer has */
  readonly pageSize = input(20);

  /** the jigsaws found, as many pages as have been asked for */
  readonly items = signal<JigsawSummary[]>([]);
  readonly hasMore = signal(false);
  /** the pictures with the other tiles (information, offers, packages) among them: the rule is the model's (`HomeFeed.merge`, through `FeedService`) */
  protected readonly tiles = computed(() => this.feed.tiles(this.items(), !this.hasMore(), this.filter()));
  protected readonly isPicture = isPicture;
  private readonly language = inject(LanguageService).lang;
  /** the names of the packages the home page has, in the language that is chosen */
  private readonly packageNames = computed(() => new Map(this.feed.others().flatMap((tile) => (tile instanceof PackageItem ? [[tile.id, tile.titleFor(this.language())] as const] : []))));

  /** what the tag of a picture says: nothing for a picture that is of no package, else the name of the package ('' when the home page has it no more) */
  protected packageName(picture: JigsawSummary): string | null {
    return picture.packageId ? (this.packageNames().get(picture.packageId) ?? '') : null;
  }
  readonly loading = signal(true);
  readonly failed = signal(false);
  private page = 1;
  /** only the answer to the last question is used */
  private ticket = 0;
  private started = false;
  /** what the list is filtered by: what the preferences chose (everything, when nothing was) */
  private readonly filter = signal<JigsawFilter>(JigsawFilters.empty());
  /** something is chosen in the filter: an empty list then means no picture matches, not that there is none */
  protected readonly filtered = signal(false);

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
    // the switch My favorites of the menu: the list is asked for again, from the first page
    effect(() => {
      this.view.favorites();
      untracked(() => {
        if (this.started) void this.load(1);
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await this.list.ready; // who asks is read first (what a person may see depends on it), and the filter is the user's
    this.filter.set(this.list.filter());
    this.filtered.set(JigsawFilters.isOn(this.filter()));
    this.started = true;
    void this.feed.load(); // the tiles that are not pictures; they come when they are read, the pictures do not wait for them
    await this.load(1);
  }

  private async load(page: number): Promise<void> {
    const ticket = ++this.ticket;
    this.loading.set(true);
    try {
      const asked: JigsawFilter = { ...this.filter(), ...(this.view.favorites() ? { favorites: true as const } : {}) }; // only the favorites of the user, when the menu says so (nobody plays: no favorites, so everything)
      const found = await this.service.search(JigsawFilters.query(listQuestion(asked, !!this.users.acting()), page, this.pageSize()) as JigsawSearchRequest);
      if (ticket !== this.ticket) return;
      this.page = page;
      this.items.update((now) => (page === 1 ? found.items : [...now, ...found.items]));
      this.hasMore.set(found.hasMore);
      this.failed.set(false);
    } catch {
      if (ticket === this.ticket) this.failed.set(true);
    } finally {
      if (ticket === this.ticket) this.loading.set(false);
    }
  }

  /** The next page of what was found is added to the end. */
  protected more(): void {
    if (this.loading() || !this.hasMore()) return;
    void this.load(this.page + 1);
  }
}

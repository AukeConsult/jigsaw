import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, effect, inject, input, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { readPreference, writePreference } from '../../core/preferences';
import { scrollParent } from '../../core/theme';
import { Plays } from '../../models/shared/play';
import { ListedRound, RoundsList, RoundsView } from '../../models/shared/rounds-list';
import { clockOf } from '../duration';
import { ImageOf, JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { PlaysService } from '../plays.service';

/**
 * The rounds that the users have played, the person's own too, on the jigsaws the person may see, a page at a time with endless scroll (the same way as the finder): who played, how far it is,
 * the time, and a link that opens the round (the person's own is gone on with, another player's is looked at, never changed). The front page shows it in place of the jigsaws when the button
 * "Rounds" is on, with three simple selects over it: whose rounds (everybody's, mine, the others'), which (all, finished, ongoing) and in what order (the date, the player, how far they are). The
 * choice is kept on the device and the server does the choosing, so a page of the list is a page of what was chosen. It needs a user (the API says who asks from the header), so it reads nothing
 * until the user is known.
 */
@Component({
  selector: 'app-all-rounds',
  imports: [RouterLink, DatePipe, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList'), provideTranslocoScope('jigsawPage')],
  host: { class: 'd-block' },
  templateUrl: './all-rounds.html',
})
export class AllRounds implements OnInit {
  private readonly plays = inject(PlaysService);
  private readonly images = inject(JigsawImageService);
  protected readonly users = inject(JigsawUserService);

  /** how many rounds a page has */
  readonly pageSize = input(20);

  /** whose rounds, which, and in what order (kept on the device) */
  protected readonly view = signal<RoundsView>(readPreference('jigsaw.roundsView', RoundsList.DEFAULT_VIEW, RoundsList.isView));
  /** the rounds read so far, as many pages as have been asked for */
  protected readonly items = signal<ListedRound[]>([]);
  protected readonly total = signal(0);
  protected readonly hasMore = signal(false);
  protected readonly loading = signal(true);
  protected readonly failed = signal(false);
  /** the jigsaws whose picture could not be read (a jigsaw can be made without one): their box is empty */
  protected readonly noPicture = signal<ReadonlySet<string>>(new Set());
  private page = 1;
  /** only the answer to the last question is used */
  private asked = 0;

  /** an invisible mark under the last round: when it comes into view, the next page is asked for */
  private readonly end = viewChild<ElementRef<HTMLElement>>('end');
  /** this browser cannot tell when the end is in view: the button for the next page is shown then */
  protected readonly needsButton = typeof IntersectionObserver === 'undefined';
  protected readonly clock = clockOf;
  protected readonly lastActive = Plays.lastActive;

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
  }

  async ngOnInit(): Promise<void> {
    await this.users.load(); // who asks is known first
    await this.load(1);
  }

  private async load(page: number): Promise<void> {
    const ticket = ++this.asked;
    this.loading.set(true);
    try {
      const view = this.view();
      const found = await this.plays.listRounds(page, this.pageSize(), this.users.acting() ? view : { ...view, whose: 'all' }); // nobody who plays: whose rounds is not asked
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

  /** A new choice of whose rounds, which of them or the order: it is kept, and the list is read again from the first page. */
  protected choose(change: Partial<RoundsView>): void {
    this.view.update((now) => ({ ...now, ...change }));
    writePreference('jigsaw.roundsView', this.view());
    void this.load(1);
  }

  /** The next page is added to the end. */
  protected more(): void {
    if (this.loading() || !this.hasMore()) return;
    void this.load(this.page + 1);
  }

  /** The round is the person's own (the others' are looked at, not changed). */
  protected mine(round: ListedRound): boolean {
    return round.play.userId === this.users.acting()?.id;
  }

  protected pictureUrl(jigsaw: ImageOf): string {
    return this.images.url(jigsaw, 1);
  }

  protected lacksPicture(jigsawId: string): void {
    this.noPicture.update((now) => new Set([...now, jigsawId]));
  }
}

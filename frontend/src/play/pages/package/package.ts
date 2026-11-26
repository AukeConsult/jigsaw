import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../app/core/language.service';
import { BoughtService } from '../../../app/jigsaw/bought.service';
import { CategoryTags } from '../../../app/jigsaw/category-tags/category-tags';
import { FeedService } from '../../../app/jigsaw/feed.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { AccountLimits } from '../../../app/models/shared/account-limits';
import { FeedItems, PackageItem } from '../../../app/models/shared/feed-item';
import { JigsawSummary } from '../../../app/models/shared/jigsaw-search';
import { PlayCard } from '../../components/play-card/play-card';
import { FEED_PATHS, priceText } from '../feed/feed-kind';

/**
 * The page of the route `/play/package/:id`, where a package tile leads: **a package**, with its words in the language that is chosen, whether it is free or what it costs, and its pictures as cards. **Its owner (or an admin) has a button on top to edit it.** On top is also the
 * button that **adds it to my pictures (free) or buys it** (nothing is charged: payment is not built): it is then kept under the account (`bought-packages`), its pictures are in the account's search and the cards open the start of
 * a round. Until then the cards are only looked at (a lock on each). Its owner and an admin may open the pictures without having got it. A link leads to all the packages.
 */
@Component({
  selector: 'play-package',
  imports: [TranslocoDirective, RouterLink, PlayCard, CategoryTags],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  templateUrl: './package.html',
})
export class PlayPackage {
  private readonly id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
  private readonly feed = inject(FeedService);
  private readonly bought = inject(BoughtService);
  protected readonly users = inject(JigsawUserService);
  protected readonly language = inject(LanguageService).lang;
  protected readonly item = signal<PackageItem | null>(null);
  protected readonly packagesPath = FEED_PATHS.package;
  /** the owner (or an admin) has a button to its form: the same rule as the server, and only a publisher may open that page */
  protected readonly mayEdit = computed(() => {
    const pack = this.item();
    const me = this.users.acting();
    return !!pack && !!me && this.users.mayPublish() && FeedItems.mayChange(pack.data, me.id, this.users.isAdmin());
  });
  protected readonly pictures = signal<JigsawSummary[]>([]);
  /** the account has got the package */
  protected readonly had = signal(false);
  /** the account that plays cannot add packages: it is not verified (an admin is not stopped) */
  protected readonly unverified = computed(() => {
    const me = this.users.acting();
    return !!me && !this.users.isAdmin() && !!AccountLimits.packageError(me);
  });
  /** the account may open and play the pictures: it has the package, owns it, or is an admin (the server says) */
  protected readonly mayPlay = signal(false);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly failed = signal(false);

  constructor() {
    void this.users.load().then(() => this.read());
  }

  private async read(): Promise<void> {
    const found = await this.feed.package(this.id);
    if (found) {
      this.item.set(found.item as PackageItem);
      this.pictures.set(found.pictures);
      this.had.set(found.bought);
      this.mayPlay.set(found.mayPlay);
    }
    this.loading.set(false);
  }

  /** Gets or buys the package, and reads the page again: the pictures can be opened. */
  protected async get(): Promise<void> {
    const me = this.users.acting();
    if (!me || this.busy()) return;
    this.busy.set(true);
    this.failed.set(false);
    try {
      await this.bought.get(me.id, this.id);
      await this.read();
    } catch {
      this.failed.set(true);
    } finally {
      this.busy.set(false);
    }
  }

  protected price(item: PackageItem): string {
    return item.isFree ? '' : priceText(item.price, item.currency, this.language());
  }
}

import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../../app/core/language.service';
import { AccountAliases } from '../../../app/jigsaw/account-aliases';
import { BoughtService } from '../../../app/jigsaw/bought.service';
import { CategoryTags } from '../../../app/jigsaw/category-tags/category-tags';
import { FeedService } from '../../../app/jigsaw/feed.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { AccountLimits } from '../../../app/models/shared/account-limits';
import { BoughtPackages } from '../../../app/models/shared/bought-package';
import { FeedItems, PackageItem } from '../../../app/models/shared/feed-item';
import { JigsawSummary } from '../../../app/models/shared/jigsaw-search';
import { TileShapes } from '../../../app/models/shared/tile-shape';
import { PlayCard } from '../../components/play-card/play-card';
import { FEED_PATHS, priceText } from '../feed/feed-kind';

/**
 * The page of the route `/play/package/:id`, where a package tile leads: **a package**, with its words in the language that is chosen, whether it is free or what it costs, who published it, and its pictures as cards. **Its owner (or an admin) has a button on top to edit it.** On top is also the
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
  private readonly accounts = inject(AccountAliases);
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
  /** who has published it: the name of its owner's account, or '' */
  protected readonly publisher = computed(() => this.accounts.nameOf(this.item()?.data.ownerUid));
  protected readonly pictures = signal<JigsawSummary[]>([]);
  /** the width of a picture's tile for each unit of its height */
  protected shapeOf(picture: JigsawSummary): number {
    return TileShapes.of(picture.width, picture.height);
  }
  /** the account has got the package */
  protected readonly had = signal(false);
  /** the account that plays cannot add packages: it is not verified (an admin is not stopped) */
  protected readonly unverified = computed(() => {
    const me = this.users.acting();
    return !!me && !this.users.isAdmin() && !!AccountLimits.packageError(me);
  });
  /** the account that plays owns the package: a press on a picture opens it to be looked at and changed, not the start of a round */
  protected readonly owns = computed(() => !!this.users.acting() && this.item()?.data.ownerUid === this.users.acting()!.id);
  /** whether no round of this picture can be started by who plays (`BoughtPackages.mayUse`, the rule the server starts rounds by: it has not added the package, and owns neither the package nor the picture; an admin neither) */
  protected locked(picture: JigsawSummary): boolean {
    const pack = this.item();
    return !BoughtPackages.mayUse(picture, this.users.acting()?.id, new Set(pack && this.had() ? [pack.id] : []), pack?.data.ownerUid);
  }
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

import { Component, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LanguageService } from '../../core/language.service';
import { JigsawImageService } from '../jigsaw-image.service';
import { FeedAction, FeedItem, InfoItem, KeptItem, OfferItem, PackageItem } from '../../models/shared/feed-item';

/**
 * A tile of the home page that is not a picture: information, an offer or a package, each in its own form but in the same frame as a card, so the grid stays in line. It is shared by the website's finder
 * and the app's list. The words are in the language that is chosen (`titleFor`, `textFor` and `labelFor`: the master's where a language has none). A press does what the tile's `action()` says (a page of the site, another site, or nothing); a tile with nothing to do is not pressed.
 */
@Component({
  selector: 'app-feed-tile',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  templateUrl: './feed-tile.html',
  host: { class: 'd-block h-100' },
})
export class FeedTile {
  private readonly router = inject(Router);
  /** the words are shown in the language that is chosen, and change with it */
  protected readonly language = inject(LanguageService).lang;

  private readonly images = inject(JigsawImageService);

  readonly item = input.required<FeedItem>();
  /** a package the account has got: the tile says so */
  readonly had = input(false);

  protected readonly info = computed(() => (this.item() instanceof InfoItem ? (this.item() as InfoItem) : null));
  protected readonly offer = computed(() => (this.item() instanceof OfferItem ? (this.item() as OfferItem) : null));
  protected readonly pack = computed(() => (this.item() instanceof PackageItem ? (this.item() as PackageItem) : null));
  protected readonly action = computed<FeedAction>(() => this.item().action());
  /** the tile is private: only its owner sees it, and a banner says so */
  protected readonly private = computed(() => {
    const item = this.item();
    return item instanceof KeptItem && item.isPrivate;
  });

  /** A package: one picture of its collection, chosen at random (the answer names a few: a tile shows another one each time the page is opened), and its address. */
  protected readonly cover = computed(() => {
    const ids = this.pack()?.data.coverIds ?? [];
    return ids.length ? this.images.url({ id: ids[Math.floor(Math.random() * ids.length)] }, 1) : null;
  });
  /** the package has no picture, or the picture could not be read: the box is empty */
  protected readonly noCover = signal(false);
  /** what a package costs, written for the language and the currency; nothing for a free one */
  protected readonly price = computed(() => {
    const k = this.pack();
    if (!k || k.isFree) return '';
    try {
      return new Intl.NumberFormat(this.language(), { style: 'currency', currency: k.currency }).format(k.price / 100);
    } catch {
      return `${(k.price / 100).toFixed(2)} ${k.currency}`;
    }
  });
  /** a press leads somewhere (a package has no page yet) */
  protected readonly pressable = computed(() => {
    const type = this.action().type;
    return type === 'route' || type === 'link' || type === 'package';
  });

  protected press(): void {
    const action = this.action();
    if (action.type === 'route') void this.router.navigateByUrl(action.to);
    else if (action.type === 'link') window.open(action.url, '_blank', 'noopener');
    else if (action.type === 'package') void this.router.navigate(['/play/package', action.packageId]); // the page of a package is in the app (opening it sets the mode)
  }
}

import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { FeedAction, FeedItem, InfoItem, OfferItem, PackageItem } from '../../models/shared/feed-item';

/**
 * A tile of the home page that is not a picture: information, an offer or a package, each in its own form but in the same frame as a card, so the grid stays in line. It is shared by the website's finder
 * and the app's list. A press does what the tile's `action()` says (a page of the site, another site, or nothing); a tile with nothing to do is not pressed.
 */
@Component({
  selector: 'app-feed-tile',
  templateUrl: './feed-tile.html',
  host: { class: 'd-block h-100' },
})
export class FeedTile {
  private readonly router = inject(Router);

  readonly item = input.required<FeedItem>();

  protected readonly info = computed(() => (this.item() instanceof InfoItem ? (this.item() as InfoItem) : null));
  protected readonly offer = computed(() => (this.item() instanceof OfferItem ? (this.item() as OfferItem) : null));
  protected readonly pack = computed(() => (this.item() instanceof PackageItem ? (this.item() as PackageItem) : null));
  protected readonly action = computed<FeedAction>(() => this.item().action());
  /** a press leads somewhere (a package has no page yet) */
  protected readonly pressable = computed(() => {
    const type = this.action().type;
    return type === 'route' || type === 'link';
  });

  protected press(): void {
    const action = this.action();
    if (action.type === 'route') void this.router.navigateByUrl(action.to);
    else if (action.type === 'link') window.open(action.url, '_blank', 'noopener');
  }
}

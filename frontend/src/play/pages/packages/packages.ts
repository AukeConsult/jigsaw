import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { FeedTile } from '../../../app/jigsaw/feed-tile/feed-tile';
import { FeedService } from '../../../app/jigsaw/feed.service';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { FeedItem, PackageItem } from '../../../app/models/shared/feed-item';

/**
 * The page of the route `/play/packages`: **every package there is to get, as tiles** (the same tile as on the home page: a picture of it, its title and words, free or its price), so a person can find one. The ones the
 * account has already got are marked (the home page does not list those). A press on a tile opens the package, where it is got or bought. It is what `GET /jigsaw-feed` gives of packages: the active ones the person may see.
 */
@Component({
  selector: 'play-packages',
  imports: [TranslocoDirective, FeedTile],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `
    <main class="container-fluid page-margin page-max" *transloco="let t">
      <h1 class="page-title mb-3"><i class="bi bi-box-seam me-2" aria-hidden="true"></i>{{ t('play.allPackages') || 'Packages' }}</h1>
      @if (loading()) {
        <div class="text-center py-4"><span class="spinner-border" role="presentation" aria-hidden="true"></span></div>
      } @else if (!packages().length) {
        <p class="text-body-secondary text-center py-4">{{ t('play.feed.noPackages') || 'There are no packages yet.' }}</p>
      } @else {
        <div class="row tile-grid row-cols-2 row-cols-sm-3 row-cols-lg-4 g-2 g-sm-3">
          @for (pack of packages(); track pack.id) {
            <div class="col"><app-feed-tile [item]="pack" [had]="!pack.onHome" /></div>
          }
        </div>
      }
    </main>
  `,
})
export class PlayPackages {
  private readonly feed = inject(FeedService);
  private readonly users = inject(JigsawUserService);
  protected readonly loading = signal(true);
  protected readonly packages = computed(() => this.feed.others().filter((tile: FeedItem): tile is PackageItem => tile.kind === 'package'));

  constructor() {
    void this.read();
  }

  private async read(): Promise<void> {
    await this.users.load();
    await this.feed.load();
    this.loading.set(false);
  }
}

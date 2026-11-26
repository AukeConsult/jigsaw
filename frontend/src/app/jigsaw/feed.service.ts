import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { FeedItem, FeedItemData, FeedItems, PictureItem } from '../models/shared/feed-item';
import { HomeFeed } from '../models/shared/home-feed';
import { JigsawFilter } from '../models/shared/jigsaw-filter';
import { JigsawSummary } from '../models/shared/jigsaw-search';

/**
 * The tiles of the home page that are not pictures (information, offers, packages), read from the API (`GET /jigsaw-feed`), and the one rule that puts them among the pictures (`HomeFeed.merge`). The
 * website's finder and the app's list use this service the same way, so the two show the same tiles in the same places. Tiles of the app's own (made in the frontend, `source: 'local'`) would be added
 * to `others` here too.
 */
@Injectable({ providedIn: 'root' })
export class FeedService {
  private readonly http = inject(HttpClient);

  /** the tiles that are not pictures, as the objects */
  readonly others = signal<FeedItem[]>([]);

  /** Reads the tiles again (the home page asks when it opens). Tiles that cannot be read leave the list as it is: the pictures are the page. */
  async load(): Promise<void> {
    try {
      const found = await firstValueFrom(this.http.get<{ items: FeedItemData[] }>(`${environment.jigsawApi}/jigsaw-feed`));
      this.others.set(found.items.map((data) => FeedItems.of(data)));
    } catch {
      /* no tiles: only the pictures */
    }
  }

  /** The packages the account that plays has got, also those that are not on the home page any more (none when they cannot be read). */
  async mine(): Promise<FeedItem[]> {
    try {
      const found = await firstValueFrom(this.http.get<{ items: FeedItemData[] }>(`${environment.jigsawApi}/jigsaw-feed/mine`));
      return found.items.map((data) => FeedItems.of(data));
    } catch {
      return [];
    }
  }

  /** A package with all its public pictures, whether the account has got it and may play them (for its page); null when there is no such package. */
  async package(id: string): Promise<{ item: FeedItem; pictures: JigsawSummary[]; bought: boolean; mayPlay: boolean } | null> {
    try {
      const found = await firstValueFrom(this.http.get<{ item: FeedItemData; pictures: JigsawSummary[]; bought: boolean; mayPlay: boolean }>(`${environment.jigsawApi}/jigsaw-feed/package/${encodeURIComponent(id)}`));
      return { item: FeedItems.of(found.item), pictures: found.pictures, bought: found.bought, mayPlay: found.mayPlay };
    } catch {
      return null;
    }
  }

  /** The pictures found, with the other tiles among them. `complete`: there are no more pictures to ask for. `filter`: what the person looks for, which a package has to match too (`matchesFilter`). */
  tiles(pictures: readonly JigsawSummary[], complete: boolean, filter: JigsawFilter): FeedItem[] {
    return HomeFeed.merge(pictures.map((summary) => PictureItem.from(summary)), this.others().filter((tile) => tile.matchesFilter(filter)), complete);
  }
}

/** A tile that is a picture (the page draws it as a card). */
export const isPicture = (tile: FeedItem): tile is PictureItem => tile instanceof PictureItem;

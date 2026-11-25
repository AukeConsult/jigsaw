import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { FeedItem, FeedItemData, FeedItems, PictureItem } from '../models/shared/feed-item';
import { HomeFeed } from '../models/shared/home-feed';
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

  /** The pictures found, with the other tiles among them. `complete`: there are no more pictures to ask for. */
  tiles(pictures: readonly JigsawSummary[], complete: boolean): FeedItem[] {
    return HomeFeed.merge(pictures.map((summary) => PictureItem.from(summary)), this.others(), complete);
  }
}

/** A tile that is a picture (the page draws it as a card). */
export const isPicture = (tile: FeedItem): tile is PictureItem => tile instanceof PictureItem;

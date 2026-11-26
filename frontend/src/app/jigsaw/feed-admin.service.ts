import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { FeedItemData } from '../models/shared/feed-item';
import { JigsawSummary } from '../models/shared/jigsaw-search';

/** The kinds a publisher or an admin writes: each has its own collection and routes. */
export type FeedAdminKind = 'info' | 'offer' | 'package';

/** How the translation of a save went (the tile is saved in every case). */
export type TranslationResult = 'none' | 'done' | 'unavailable' | 'failed';

/** What an author sends: the words in the master language, where it leads and when it is shown. */
export interface FeedBody {
  masterLanguage: string;
  title: string;
  text: string;
  label?: string;
  route?: string;
  link?: string;
  from?: number;
  to?: number;
  slot?: number;
  priority?: number;
  /** who sees it on the home page: `everyone`, `owner` (private: only its owner, with a banner) or `hidden` */
  visibility?: 'everyone' | 'owner' | 'hidden';
  /** a package: what it costs in cents (nothing: free) and the currency */
  price?: number;
  currency?: string;
  /** a package: its categories */
  categories?: string[];
}

/**
 * The tiles of the home page that a publisher or an admin writes (`/jigsaw-info`, `/jigsaw-offers`): the list with a search and a status, one tile, and add, change and delete. A publisher has their own, an admin
 * every tile. The server has the AI make the words of the other languages when a tile is saved.
 */
@Injectable({ providedIn: 'root' })
export class FeedAdminService {
  private readonly http = inject(HttpClient);

  private base(kind: FeedAdminKind): string {
    return `${environment.jigsawApi}/${kind === 'info' ? 'jigsaw-info' : kind === 'offer' ? 'jigsaw-offers' : 'jigsaw-packages'}`;
  }

  list(kind: FeedAdminKind, search: string, status: string): Promise<{ items: FeedItemData[]; now: number }> {
    const params: Record<string, string> = {};
    if (search.trim()) params['search'] = search.trim();
    if (status) params['status'] = status;
    return firstValueFrom(this.http.get<{ items: FeedItemData[]; now: number }>(this.base(kind), { params }));
  }

  get(kind: FeedAdminKind, id: string): Promise<{ item: FeedItemData; now: number }> {
    return firstValueFrom(this.http.get<{ item: FeedItemData; now: number }>(`${this.base(kind)}/${encodeURIComponent(id)}`));
  }

  create(kind: FeedAdminKind, body: FeedBody): Promise<{ item: FeedItemData; translation: TranslationResult }> {
    return firstValueFrom(this.http.post<{ item: FeedItemData; translation: TranslationResult }>(this.base(kind), body));
  }

  update(kind: FeedAdminKind, id: string, body: FeedBody): Promise<{ item: FeedItemData; translation: TranslationResult }> {
    return firstValueFrom(this.http.put<{ item: FeedItemData; translation: TranslationResult }>(`${this.base(kind)}/${encodeURIComponent(id)}`, body));
  }

  /** the pictures of a package (its owner, or an admin) */
  async pictures(id: string): Promise<JigsawSummary[]> {
    return (await firstValueFrom(this.http.get<{ pictures: JigsawSummary[] }>(`${this.base('package')}/${encodeURIComponent(id)}/pictures`))).pictures;
  }

  remove(kind: FeedAdminKind, id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base(kind)}/${encodeURIComponent(id)}`));
  }
}

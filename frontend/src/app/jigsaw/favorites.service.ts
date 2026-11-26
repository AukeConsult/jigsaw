import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ActingIds } from './acting-ids';

/**
 * The jigsaws the user who plays has ticked with a heart. They are kept with the user, in the collection `jigsaw-favorites` (the API knows who asks from the header every
 * request carries), and read once for each user who plays. A heart changes at once and is put back if the server could not keep it. Nobody chosen: no hearts.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService extends ActingIds {
  private readonly http = inject(HttpClient);

  /** a user is chosen: a heart can be ticked */
  readonly available = computed(() => !!this.users.acting());

  protected async fetch(): Promise<string[]> {
    return (await firstValueFrom(this.http.get<{ ids: string[] }>(`${environment.jigsawApi}/jigsaw-favorites`))).ids;
  }

  isFavorite(jigsawId: string): boolean {
    return this.ids().has(jigsawId);
  }

  /** Ticks the heart of the jigsaw, or takes the tick away when it is ticked. */
  async toggle(jigsawId: string): Promise<void> {
    if (!this.available()) return;
    const on = !this.ids().has(jigsawId);
    this.set(jigsawId, on);
    try {
      const url = `${environment.jigsawApi}/jigsaw-favorites/${encodeURIComponent(jigsawId)}`;
      await firstValueFrom(on ? this.http.put(url, null) : this.http.delete(url));
    } catch {
      this.set(jigsawId, !on); // it was not kept: the heart is as it was
    }
  }

  private set(jigsawId: string, on: boolean): void {
    this.ids.update((now) => {
      const next = new Set(now);
      if (on) next.add(jigsawId);
      else next.delete(jigsawId);
      return next;
    });
  }
}

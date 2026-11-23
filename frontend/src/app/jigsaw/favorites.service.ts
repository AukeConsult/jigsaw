import { HttpClient } from '@angular/common/http';
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { JigsawUserService } from './jigsaw-user.service';

/**
 * The jigsaws the user who plays has ticked with a heart. They are kept with the user, in the collection `jigsaw-favorites` (the API knows who asks from the header every
 * request carries), and read once for each user who plays. A heart changes at once and is put back if the server could not keep it. Nobody chosen: no hearts.
 */
@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private readonly http = inject(HttpClient);
  private readonly users = inject(JigsawUserService);

  /** the ids of the user's favorite jigsaws */
  readonly ids = signal<ReadonlySet<string>>(new Set());
  /** a user is chosen: a heart can be ticked */
  readonly available = computed(() => !!this.users.acting());

  constructor() {
    // the favorites are read again when another user plays
    effect(() => {
      const id = this.users.acting()?.id ?? null;
      untracked(() => void this.read(id));
    });
  }

  private async read(userId: string | null): Promise<void> {
    if (!userId) return this.ids.set(new Set());
    try {
      const found = await firstValueFrom(this.http.get<{ ids: string[] }>(`${environment.jigsawApi}/jigsaw-favorites`));
      if (this.users.acting()?.id === userId) this.ids.set(new Set(found.ids)); // not for a user who has been left since
    } catch {
      /* no hearts ticked: they can be ticked, and are read again the next time */
    }
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

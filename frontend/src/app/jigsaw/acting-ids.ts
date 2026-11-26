import { effect, inject, signal, untracked } from '@angular/core';
import { JigsawUserService } from './jigsaw-user.service';

/**
 * A set of jigsaw ids that belongs to the account that is acting (its hearts, what it has solved): read when another account acts, none for nobody, and never put on an account that has been left since. A set that
 * cannot be read stays as it is and is read again the next time. The service that extends it says how it is read (`fetch`).
 */
export abstract class ActingIds {
  protected readonly users = inject(JigsawUserService);

  readonly ids = signal<ReadonlySet<string>>(new Set());

  constructor() {
    // (an effect runs after the service is made, so what `fetch` uses is there)
    effect(() => {
      const id = this.users.acting()?.id ?? null;
      untracked(() => void this.read(id));
    });
  }

  protected abstract fetch(userId: string): Promise<Iterable<string>>;

  /** reads them again (something may have changed since) */
  refresh(): void {
    void this.read(this.users.acting()?.id ?? null);
  }

  private async read(userId: string | null): Promise<void> {
    if (!userId) return this.ids.set(new Set());
    try {
      const found = await this.fetch(userId);
      if (this.users.acting()?.id === userId) this.ids.set(new Set(found));
    } catch {
      /* as it was: it is read again the next time */
    }
  }
}

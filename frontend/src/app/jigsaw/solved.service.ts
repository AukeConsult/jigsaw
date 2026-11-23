import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { JigsawUserService } from './jigsaw-user.service';
import { PlaysService } from './plays.service';

/**
 * The jigsaws the user who plays has solved (a round of theirs is solved), read when the user is chosen and again when a list is opened (`refresh`), so a card can say so. Nobody
 * chosen, or the rounds could not be read: none is marked.
 */
@Injectable({ providedIn: 'root' })
export class SolvedService {
  private readonly users = inject(JigsawUserService);
  private readonly plays = inject(PlaysService);

  /** the ids of the jigsaws the user has solved */
  readonly ids = signal<ReadonlySet<string>>(new Set());

  constructor() {
    effect(() => {
      const id = this.users.acting()?.id ?? null;
      untracked(() => void this.read(id));
    });
  }

  /** reads the rounds again (a round may have been solved since) */
  refresh(): void {
    void this.read(this.users.acting()?.id ?? null);
  }

  isSolved(jigsawId: string): boolean {
    return this.ids().has(jigsawId);
  }

  private async read(userId: string | null): Promise<void> {
    if (!userId) return this.ids.set(new Set());
    try {
      const games = await this.plays.ofUser(userId);
      if (this.users.acting()?.id === userId) this.ids.set(new Set(games.filter((g) => g.play.status === 'solved').map((g) => g.jigsaw.id)));
    } catch {
      /* none marked: it is read again the next time a list is opened */
    }
  }
}

import { Injectable, inject } from '@angular/core';
import { ActingIds } from './acting-ids';
import { PlaysService } from './plays.service';

/**
 * The jigsaws the user who plays has solved (a round of theirs is solved), read when the user is chosen and again when a list is opened (`refresh`), so a card can say so. Nobody
 * chosen, or the rounds could not be read: none is marked.
 */
@Injectable({ providedIn: 'root' })
export class SolvedService extends ActingIds {
  private readonly plays = inject(PlaysService);

  isSolved(jigsawId: string): boolean {
    return this.ids().has(jigsawId);
  }

  protected async fetch(userId: string): Promise<string[]> {
    return (await this.plays.ofUser(userId)).filter((g) => g.play.status === 'solved').map((g) => g.jigsaw.id);
  }
}

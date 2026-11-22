import { DatePipe } from '@angular/common';
import { Component, ElementRef, computed, effect, inject, input, signal, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { clockOf } from '../duration';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawUserService } from '../jigsaw-user.service';
import { PlaysService, UserGame } from '../plays.service';

/** A band stuck to the top of the page with the user's rounds that are not solved: the picture of each (press it to go straight on with the round), and under it, in tiny text, when it was started and the time played. Scrolls sideways; shows nothing when there are no rounds. */
@Component({
  selector: 'app-my-rounds',
  imports: [DatePipe, TranslocoDirective, JigsawCard],
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './my-rounds.html',
  host: { class: 'd-block', '(window:resize)': 'update()' },
})
export class MyRounds {
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);

  /** the jigsaws the person may see: a round only names its jigsaw, so the cards are made from these */
  readonly jigsaws = input.required<JigsawSpec[]>();
  /** the user's rounds that are not solved, newest first; null until they are read */
  private readonly going = signal<UserGame[] | null>(null);
  /** each round with its jigsaw (a round whose jigsaw is not in the list is left out) */
  protected readonly mine = computed(() => {
    const byId = new Map(this.jigsaws().map((j) => [j.id, j]));
    return (this.going() ?? []).flatMap((game) => {
      const jigsaw = byId.get(game.jigsaw.id);
      return jigsaw ? [{ game, jigsaw }] : [];
    });
  });

  protected readonly clock = clockOf;
  private readonly row = viewChild<ElementRef<HTMLElement>>('row');
  protected readonly canBack = signal(false);
  protected readonly canForward = signal(false);

  constructor() {
    void this.readRounds();
    // the buttons are worked out again when the row is drawn or its cards change, and when the window is resized
    effect(() => {
      this.mine();
      this.row();
      queueMicrotask(() => this.update());
    });
  }

  /** which buttons are shown: one that way only when the row has more to show that way */
  protected update(): void {
    const el = this.row()?.nativeElement;
    if (!el) return;
    this.canBack.set(el.scrollLeft > 1);
    this.canForward.set(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }

  /** scrolls most of a screenful of the row, to the next cards (-1 back, 1 forward) */
  protected scroll(direction: -1 | 1): void {
    const el = this.row()?.nativeElement;
    el?.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  private async readRounds(): Promise<void> {
    const me = await this.users.load();
    if (!me) return;
    try {
      const open = (await this.plays.ofUser(me.id)).filter((g) => g.play.status !== 'solved');
      this.going.set(open.sort((a, b) => b.play.startedAt - a.play.startedAt));
    } catch {
      /* no band without the rounds */
    }
  }
}

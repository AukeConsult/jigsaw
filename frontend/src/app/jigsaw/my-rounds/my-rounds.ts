import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { Plays } from '../../models/shared/play';
import { clockOf } from '../duration';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { PlaysService, UserGame } from '../plays.service';
import { WELCOME_ART } from '../welcome-art';

/** A band stuck to the top of the page with the user's rounds that are not solved: the picture of each (press it to go straight on with the round), and under it, in tiny text, when it was started and the time played. Scrolls sideways; shows nothing when there are no rounds. */
@Component({
  selector: 'app-my-rounds',
  imports: [DatePipe, TranslocoDirective, JigsawCard],
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './my-rounds.html',
  host: { '(window:resize)': 'update()' },
})
export class MyRounds {
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly jigsawService = inject(JigsawService);

  /** the jigsaws of the open rounds, each read by itself (a round only names its jigsaw, so the cards are made from these) */
  private readonly jigsaws = signal<JigsawSpec[]>([]);
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

  /** the user has no round going (or nobody has been chosen yet): the band welcomes instead; not while the rounds are being read, or when they could not be */
  protected readonly welcome = computed(() => this.going()?.length === 0);

  /** the rounds are read (also when there are none, nobody is chosen, or they could not be read): the page waits for this before it asks for the jigsaws, so the band is there first and nothing below it jumps */
  readonly loaded = output<void>();

  /** the pictures of the welcome band (jigsaws almost put together), and which one is shown: they follow each other, round and round, every few seconds */
  protected readonly art = WELCOME_ART;
  protected readonly artIndex = signal(0);

  protected readonly clock = clockOf;
  private readonly row = viewChild<ElementRef<HTMLElement>>('row');
  protected readonly canBack = signal(false);
  protected readonly canForward = signal(false);

  constructor() {
    void this.readRounds();
    // round robin between the pictures (not for a person who has asked for less movement)
    if (this.art.length > 1 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const timer = setInterval(() => this.artIndex.update((i) => (i + 1) % this.art.length), 5000);
      inject(DestroyRef).onDestroy(() => clearInterval(timer));
    }
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
    try {
      await this.readOpenRounds();
    } finally {
      this.loaded.emit();
    }
  }

  private async readOpenRounds(): Promise<void> {
    const me = await this.users.load();
    if (!me) return void this.going.set([]); // nobody chosen yet: no rounds
    try {
      const open = (await this.plays.ofUser(me.id)).filter((g) => g.play.status !== 'solved');
      // the jigsaws of the rounds are read one by one, each once (not the whole list of jigsaws); one that cannot be read leaves its round out
      const ids = [...new Set(open.map((g) => g.jigsaw.id))];
      const read = await Promise.all(ids.map((id) => this.jigsawService.get(id).catch(() => null)));
      this.jigsaws.set(read.filter((j): j is JigsawSpec => !!j));
      this.going.set(open.sort((a, b) => Plays.lastActive(b.play) - Plays.lastActive(a.play)));
    } catch {
      /* no band without the rounds (and no welcome: it would say there are none) */
    }
  }
}

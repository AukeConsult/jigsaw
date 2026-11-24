import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, computed, effect, inject, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isBoolean, readPreference, writePreference } from '../../core/preferences';
import { WelcomeTime } from '../../core/welcome-time';
import { AuthService } from '../../logons/auth.service';
import { JigsawSpec } from '../../models/shared/jigsaw-settings';
import { Plays } from '../../models/shared/play';
import { clockOf } from '../duration';
import { JigsawCard } from '../jigsaw-card/jigsaw-card';
import { JigsawService } from '../jigsaw.service';
import { News } from '../news/news';
import { JigsawUserService } from '../jigsaw-user.service';
import { PlaysService, UserGame } from '../plays.service';
import { WELCOME_ART } from '../welcome-art';

/** A band stuck to the top of the page with the user's rounds that are not solved: the picture of each (press it to go straight on with the round), and under it, in tiny text, when it was started and the time played. Scrolls sideways; shows nothing when there are no rounds. */
@Component({
  selector: 'app-my-rounds',
  imports: [DatePipe, RouterLink, TranslocoDirective, JigsawCard, News],
  providers: [provideTranslocoScope('jigsawHome')],
  templateUrl: './my-rounds.html',
  host: { '(window:resize)': 'update()' },
})
export class MyRounds {
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly jigsawService = inject(JigsawService);
  private readonly welcomeTime = inject(WelcomeTime);
  private readonly auth = inject(AuthService);

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
  /** Hide, in the corner of the welcome: it goes away at once */
  protected hideWelcome(): void {
    this.welcomeTime.hide();
  }

  protected readonly welcome = computed(() => this.welcomeTime.visible() && (this.going()?.length === 0 || this.welcomeTime.forced())); // for a minute after the app is opened; also with a round going when Welcome in the menu was pressed (`WelcomeTime`)

  /** the rounds are read (also when there are none, nobody is chosen, or they could not be read): the page waits for this before it asks for the jigsaws, so the band is there first and nothing below it jumps */
  readonly loaded = output<void>();

  /** the pictures of the welcome band (jigsaws almost put together), and which one is shown: they follow each other, round and round, every few seconds */
  protected readonly art = WELCOME_ART;
  protected readonly artIndex = signal(0);

  /** the band is folded to its badge (kept on the device, so it stays as the person left it): only the heading is left, and a press on it opens the band again */
  protected readonly folded = signal(readPreference('jigsaw.roundsFolded', false, isBoolean));

  protected toggleFolded(): void {
    this.folded.update((now) => !now);
    writePreference('jigsaw.roundsFolded', this.folded());
  }

  protected readonly clock = clockOf;
  private readonly row = viewChild<ElementRef<HTMLElement>>('row');
  /** the text of the welcome (the title, the line and the three steps): the pictures of the almost finished jigsaws are as high as it, so their bottom edge is the bottom edge of the last step */
  private readonly welcomeText = viewChild<ElementRef<HTMLElement>>('welcomeText');
  protected readonly textHeight = signal<number | null>(null);
  protected readonly canBack = signal(false);
  protected readonly canForward = signal(false);

  constructor() {
    effect((onCleanup) => {
      const el = this.welcomeText()?.nativeElement;
      if (!el) return;
      const watch = new ResizeObserver(() => this.textHeight.set(Math.round(el.getBoundingClientRect().height)));
      watch.observe(el);
      onCleanup(() => watch.disconnect());
    });
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
    await this.users.load();
    await this.auth.ready; // a sign-in of an earlier visit is restored first
    const me = this.users.acting(); // nobody chosen, or one that needs a login and is not signed in: no rounds of one's own
    if (!me) return void this.going.set([]);
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

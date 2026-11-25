import { Component, DestroyRef, ElementRef, HostListener, OnDestroy, afterNextRender, effect, inject, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { isWideScreen, onAnyScroll } from '../../core/theme';
import { PlaySpec } from '../../models/shared/play';
import { JigsawHelper } from '../jigsaw-helper';
import { PuzzelBanner } from '../puzzel/puzzel-banner';
import { PuzzelBoard } from '../puzzel/puzzel-board';
import { PuzzelDetails } from '../puzzel/puzzel-details';
import { PuzzelRound } from '../puzzel/puzzel-round';

/**
 * Playing one round of a jigsaw, in the website: **`/jigsaw/jigsaw/:id`** (the round of the account that plays: the one going, else a new one; the same route as the app's `/play/jigsaw/:id`) or `/jigsaw/:id/play/:playId` (one given round). The page is
 * only the frame: the sidebar docked at the left edge on a wide screen (folded away on a narrow one until the Sidebar switch in the top menu opens it over the board) with `app-puzzel-details`, the board `app-puzzel-board`, and what the top menu
 * shows of the round (the clock, whose round it is). Everything about the round is in `PuzzelRound`, which this page provides, and which the app's puzzle page uses too.
 */
@Component({
  selector: 'app-jigsaw-play',
  imports: [RouterLink, PuzzelBanner, PuzzelBoard, PuzzelDetails, TranslocoDirective],
  providers: [PuzzelRound, provideTranslocoScope('jigsawPlay')],
  templateUrl: './jigsaw-play.html',
})
export class JigsawPlay implements OnDestroy {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly element = inject(ElementRef<HTMLElement>);
  protected readonly round = inject(PuzzelRound);
  /** the top menu: its Sidebar switch opens the folded sidebar of a narrow screen, and it shows the clock of the round */
  protected readonly tools = inject(JigsawHelper);
  private readonly destroyRef = inject(DestroyRef);

  /** the jigsaw that is open (it changes when another round is opened from here) */
  protected jigsawId = '';

  /** the height of the sidebar in pixels: from where the page starts (under the top menu) to the bottom of the window */
  readonly sidebarHeight = signal<number | null>(null);

  constructor() {
    afterNextRender(() => this.measureSidebar());
    onAnyScroll(this.destroyRef, () => this.measureSidebar());
    effect(() => this.tools.clock.set(this.round.status() === 'ready' && this.round.item()?.timed !== false ? this.round.clock() : null)); // the menu at the top shows it
    effect(() => this.tools.solved.set(this.round.status() === 'ready' && this.round.solved())); // a completed round: the switches of the helper are off
    effect(() => this.tools.viewing.set(this.round.status() === 'ready' && this.round.viewOnly() ? this.round.play()?.userName || tr('jigsawPlay.anotherPlayer', 'another player') : null)); // the menu at the top says whose round it is
    // another round can be opened from this page (a new round): the page is the same, the ids change
    this.route.paramMap.subscribe((params) => {
      this.jigsawId = params.get('id') ?? '';
      const playId = params.get('playId');
      this.tools.open(this.jigsawId); // the switches of the helper are as they were left on this jigsaw
      if (playId) this.round.open(this.jigsawId, playId);
      else void this.openOwn();
    });
  }

  /** `/jigsaw/jigsaw/:id`: the round of the account that plays. Nobody plays: the page where an account is chosen; a picture has no round yet: its page asks for the number of pieces. */
  private async openOwn(): Promise<void> {
    const opened = await this.round.openFor(this.jigsawId);
    if (opened === 'logon') await this.router.navigate(['/jigsaw/user'], { queryParams: { next: this.router.url } });
    else if (opened === 'choose') await this.router.navigate(['/jigsaw', this.jigsawId], { replaceUrl: true });
  }

  @HostListener('window:resize')
  measureSidebar(): void {
    if (!isWideScreen()) return this.sidebarHeight.set(null); // folded away on a narrow screen: it is as high as what is in it
    const top = (this.element.nativeElement as HTMLElement).getBoundingClientRect().top;
    this.sidebarHeight.set(Math.max(200, Math.floor(window.innerHeight - top)));
  }

  /** The round was deleted: the person goes to the page of the jigsaw. */
  protected onDeleted(): void {
    void this.router.navigate(['/jigsaw', this.jigsawId]);
  }

  /** The person asked for their own round while looking at another player's: they go to it (a picture is cut as the person chooses: the page of the picture asks). */
  protected onOwn(game: PlaySpec | null): void {
    void this.router.navigate(game ? ['/jigsaw', this.jigsawId, 'play', game.id] : ['/jigsaw', this.jigsawId]);
  }

  ngOnDestroy(): void {
    this.tools.clock.set(null);
    this.tools.viewing.set(null);
    this.tools.solved.set(false);
    this.tools.open(''); // no jigsaw: the switches are not saved for the next one
  }
}

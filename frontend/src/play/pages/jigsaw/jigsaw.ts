import { Component, HostListener, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PuzzelBanner } from '../../../app/jigsaw/puzzel/puzzel-banner';
import { PuzzelBoard } from '../../../app/jigsaw/puzzel/puzzel-board';
import { PuzzelDetails } from '../../../app/jigsaw/puzzel/puzzel-details';
import { PuzzelRound } from '../../../app/jigsaw/puzzel/puzzel-round';
import { RoundLook } from '../../../app/jigsaw/puzzel/round-look';
import { isWideScreen } from '../../../app/core/theme';
import { PlaySpec } from '../../../app/models/shared/play';
import { PuzzelView } from '../../puzzel-view';

/**
 * The page of the route `/play/jigsaw/:id`, where a card of the list (or of the rounds) leads: **the puzzle of one jigsaw**, the round of the account that plays (the one going, else a new one), the same route and the same components as the
 * website's `/jigsaw/jigsaw/:id`: the board (`app-puzzel-board`) and the details (`app-puzzel-details`), both of the round (`PuzzelRound`, provided here). There is no menu of its own on the page: the menu of the helper (`jigsawMenu`) has the
 * switches for the help picture, the border pieces and the two panels over the puzzle, Details and Table and sound (`PuzzelView`). A picture with no round yet, and a visitor who is not logged on, go to the page before the puzzle (`/play/round/:id`): one may look there without logging on, and a round is started there.
 */
@Component({
  selector: 'play-jigsaw',
  imports: [TranslocoDirective, RouterLink, PuzzelBanner, PuzzelBoard, PuzzelDetails, RoundLook],
  providers: [PuzzelRound, provideTranslocoScope('play'), provideTranslocoScope('jigsawPlay')],
  host: { class: 'd-block' },
  templateUrl: './jigsaw.html',
})
export class PlayJigsaw implements OnInit, OnDestroy {
  protected readonly round = inject(PuzzelRound);
  protected readonly view = inject(PuzzelView);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  /** whether the round of the puzzle is open yet (what came of it is `round.status`) */
  protected readonly opened = signal<'opening' | 'opened'>('opening');

  constructor() {
    effect(() => this.view.solved.set(this.round.status() === 'ready' && this.round.solved())); // a finished puzzle: the menu has no help picture and no border pieces
  }

  ngOnDestroy(): void {
    this.view.solved.set(false);
    this.view.details.set(false);
    this.view.look.set(false);
  }

  async ngOnInit(): Promise<void> {
    const started = this.route.snapshot.queryParamMap.get('round'); // a round that was just started (it has no moved piece, so it is in no list): this one is opened
    if (started) {
      this.round.open(this.id, started);
      return this.opened.set('opened');
    }
    const result = await this.round.openFor(this.id);
    // a picture has no round yet, or nobody is logged on: the page before the puzzle, where one looks, and a round is started
    if (result === 'choose' || result === 'logon') return void (await this.router.navigate(['/play/round', this.id], { replaceUrl: true }));
    this.opened.set('opened'); // a jigsaw that is not there is said by the round
  }

  /** On a small screen a panel covers much of the board: a click anywhere outside the panels (and not on the helper, whose switches open and close them) closes them. */
  @HostListener('document:click', ['$event'])
  protected closePanels(event: MouseEvent): void {
    if (isWideScreen() || (!this.view.details() && !this.view.look())) return;
    const target = event.target as Element | null;
    if (!target?.isConnected || target.closest('play-helper, .puzzle-panels')) return; // (what was pressed inside a panel may be drawn anew by the press itself)
    this.view.details.set(false);
    this.view.look.set(false);
  }

  /** The round was deleted: the person goes home. */
  protected onDeleted(): void {
    void this.router.navigateByUrl('/');
  }

  /** Another player's round was being looked at and the person asked for their own: it is opened here (a picture has no round yet). */
  protected onOwn(game: PlaySpec | null): void {
    if (game) this.round.open(this.id, game.id);
    else void this.router.navigate(['/play/round', this.id]);
  }
}

import { Component, HostListener, OnDestroy, OnInit, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PuzzelBanner } from '../../../app/jigsaw/puzzel/puzzel-banner';
import { PuzzelBoard } from '../../../app/jigsaw/puzzel/puzzel-board';
import { PuzzelDetails } from '../../../app/jigsaw/puzzel/puzzel-details';
import { PuzzelRound } from '../../../app/jigsaw/puzzel/puzzel-round';
import { isWideScreen } from '../../../app/core/theme';
import { PlaySpec } from '../../../app/models/shared/play';
import { PuzzelView } from '../../puzzel-view';

/**
 * The page of the route `/play/jigsaw/:id`, where a card of the list (or of the rounds) leads: **the puzzle of one jigsaw**, the round of the account that plays (the one going, else a new one), the same route and the same components as the
 * website's `/jigsaw/jigsaw/:id`: the board (`app-puzzel-board`) and the details (`app-puzzel-details`), both of the round (`PuzzelRound`, provided here). There is no menu of its own on the page: the menu of the helper (`jigsawMenu`) has the
 * switches for the help picture, the details and the border pieces (`PuzzelView`). Nobody plays: the account is asked for first. A picture has no round yet: it goes to the page where one is started (`/play/round/:id`).
 */
@Component({
  selector: 'play-jigsaw',
  imports: [TranslocoDirective, RouterLink, PuzzelBanner, PuzzelBoard, PuzzelDetails],
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

  /** what came of opening the puzzle: the round is open (see `round.status`), or an account is needed first */
  protected readonly opened = signal<'opening' | 'opened' | 'logon'>('opening');

  constructor() {
    effect(() => this.view.solved.set(this.round.status() === 'ready' && this.round.solved())); // a finished puzzle: the menu has no help picture and no border pieces
  }

  ngOnDestroy(): void {
    this.view.solved.set(false);
  }

  async ngOnInit(): Promise<void> {
    const started = this.route.snapshot.queryParamMap.get('round'); // a round that was just started (it has no moved piece, so it is in no list): this one is opened
    if (started) {
      this.round.open(this.id, started);
      return this.opened.set('opened');
    }
    const result = await this.round.openFor(this.id);
    if (result === 'choose') return void (await this.router.navigate(['/play/round', this.id], { replaceUrl: true })); // a picture has no round yet: where one is started
    this.opened.set(result === 'missing' ? 'opened' : result); // a jigsaw that is not there is said by the round
  }

  /**
   * On a small screen the details lie over the board: a click anywhere closes them again, also on the empty parts of them (the same as the website's). What is in them is used, so a click on a button, a field, a label or a link of
   * theirs does not close them, and neither does a click on the helper, whose switch Details opens and closes them itself.
   */
  @HostListener('document:click', ['$event'])
  protected closeDetails(event: MouseEvent): void {
    if (isWideScreen() || !this.view.details()) return;
    if ((event.target as Element | null)?.closest('play-helper, .jigsaw-sidebar input, .jigsaw-sidebar button, .jigsaw-sidebar label, .jigsaw-sidebar a, .jigsaw-sidebar select')) return;
    this.view.details.set(false);
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

import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { MyRounds } from '../../../app/jigsaw/my-rounds/my-rounds';
import { SolvedService } from '../../../app/jigsaw/solved.service';
import { PlayCards } from '../../components/play-cards/play-cards';
import { PlayHomePanel } from '../../components/home-panel/home-panel';
import { ListView } from '../../list-view';

/**
 * The page of the route `/list`, the home page: the picture list, as the cards of the jigsaws, newest first (the component `play-cards`), and, on the top, **the band of the rounds that are going** (`app-my-rounds`: only the rounds that are
 * going, each a picture that opens its puzzle). The preferences have the switch that shows the band and takes it away (`ListView`). A press on a card opens its puzzle
 * (`/play/jigsaw/:id`), or, for a picture, the start of a round.
 */
@Component({
  selector: 'play-list',
  imports: [TranslocoDirective, PlayCards, MyRounds, PlayHomePanel],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `
    @if (view.ongoing.value()) {
      <app-my-rounds />
    }
    <main class="container-fluid page-margin" *transloco="let t">
      <section class="mb-4" [attr.aria-label]="t('play.jigsaws') || 'Jigsaws'">
        <!-- everybody knows these are jigsaws: the heading is only for a screen reader -->
        <h2 class="visually-hidden">{{ t('play.jigsaws') || 'Jigsaws' }}</h2>
        <play-cards />
      </section>
    </main>
    <!-- the preferences of this page, over it (the menu entry Preferences) -->
    <play-home-panel />
  `,
})
export class PlayList {
  protected readonly view = inject(ListView);

  constructor() {
    inject(SolvedService).refresh(); // a round may have been solved since the cards were last shown
  }
}

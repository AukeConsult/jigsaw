import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { SolvedService } from '../../app/jigsaw/solved.service';
import { PlayPage } from '../core/play-page';
import { PlayCards } from '../play-cards/play-cards';

/** The front page of the app, a play page (`PlayPage`: shown by `PlayPages` from the main page), a fresh copy of the website's front page with only the cards of the jigsaws. The app is built here from scratch, beside the website in `app/`, which is not touched. */
@Component({
  selector: 'play-front',
  imports: [TranslocoDirective, PlayCards],
  host: { class: 'd-block' },
  providers: [provideTranslocoScope('play')],
  templateUrl: './play-front.html',
})
export class PlayFront extends PlayPage {
  constructor() {
    super();
    inject(SolvedService).refresh(); // a round may have been solved since the cards were last shown
  }
}

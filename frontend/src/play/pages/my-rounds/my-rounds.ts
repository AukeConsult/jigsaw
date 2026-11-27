import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { MyRoundList } from '../../../app/jigsaw/my-round-list/my-round-list';

/** The page of the route `/play/mine/rounds`: the rounds the user has played (the component `app-my-round-list`). */
@Component({
  selector: 'play-my-rounds',
  imports: [TranslocoDirective, MyRoundList],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <h1 class="page-title">{{ t('play.myRounds') || 'My rounds' }}</h1>
    <app-my-round-list />
  </main>`,
})
export class PlayMyRounds {}

import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { MyRoundList } from '../../../app/jigsaw/my-round-list/my-round-list';

/** The page of the route `/play/mine/rounds`: the rounds the user has played, in the list of the jigsaw app (the component `app-my-round-list`, in its mode `inApp`: a round opens the puzzle of the app, and there is no link to the pages of the website). */
@Component({
  selector: 'play-my-rounds',
  imports: [TranslocoDirective, MyRoundList],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <h1 class="page-title">{{ t('play.myRounds') || 'My rounds' }}</h1>
    <app-my-round-list [inApp]="true" />
  </main>`,
})
export class PlayMyRounds {}

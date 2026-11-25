import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { MyJigsaws } from '../../../app/jigsaw/my-jigsaws/my-jigsaws';

/** The page of the route `/play/mine/pictures`: the pictures the user has made, in the list of the jigsaw app (the component `app-my-jigsaws`, in its mode `inApp`: no adding here, since the app has its own Add picture, and no links to the pages of the website). */
@Component({
  selector: 'play-my-pictures',
  imports: [TranslocoDirective, MyJigsaws],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t">
    <h1 class="page-title">{{ t('play.myPictures') || 'My pictures' }}</h1>
    <app-my-jigsaws [inApp]="true" />
  </main>`,
})
export class PlayMyPictures {}

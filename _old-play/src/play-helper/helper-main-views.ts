import { NgComponentOutlet } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { HelperPanel } from './helper-panel';

/**
 * The frame in the main area of the main page: the views of a helper that shows them there (`Helper.show` is `main`), in the place of the page that is open (`play-main` hides that page while the frame is open, and shows it again,
 * as it was, when the frame is closed). It has a Close button, and the views are one under the other in a column; they can still be moved and resized (`HelperView`). Nothing is drawn while the helper's button has them closed.
 */
@Component({
  selector: 'helper-main-views',
  imports: [NgComponentOutlet, TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  templateUrl: './helper-main-views.html',
})
export class HelperMainViews {
  protected readonly panel = inject(HelperPanel);
}

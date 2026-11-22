import { Component, input, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** The choice of how jigsaws are shown, as cards or as a list (a switch of two, the standard `.segmented` of the toolbar). Bind it with `[(view)]`. */
@Component({
  selector: 'app-view-switch',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList')],
  host: { class: 'd-block' },
  templateUrl: './view-switch.html',
})
export class ViewSwitch {
  readonly view = model<'list' | 'cards'>('cards');
  /** makes the ids of the buttons different when there are two switches on a page */
  readonly idPrefix = input('view');
}

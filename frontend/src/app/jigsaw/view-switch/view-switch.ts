import { Component, inject, input, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { CardDetails } from '../card-details';

/** The choice of how jigsaws are shown, as cards or as a list (a switch of two, the standard `.segmented` of the toolbar), and beside it whether their details are shown (`CardDetails`). Bind the view with `[(view)]`. */
@Component({
  selector: 'app-view-switch',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawList')],
  host: { class: 'd-block' },
  templateUrl: './view-switch.html',
})
export class ViewSwitch {
  protected readonly details = inject(CardDetails);
  readonly view = model<'list' | 'cards'>('cards');
  /** makes the ids of the buttons different when there are two switches on a page */
  readonly idPrefix = input('view');
}

import { Component, input, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** Who sees a jigsaw: public, private or hidden, as a row of pills (the forms and the top of the page of a new jigsaw use it). Private and hidden need an owner. */
@Component({
  selector: 'app-visibility-choice',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawNew')],
  templateUrl: './visibility-choice.html',
})
export class VisibilityChoice {
  readonly visibility = model.required<'everyone' | 'owner' | 'hidden'>();
  /** the jigsaw has an owner (without one only Public can be chosen) */
  readonly ownerKnown = input(false);
}

import { Component, computed, inject, input, model } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { JigsawUserService } from '../jigsaw-user.service';

/** Who sees a jigsaw: public, private or hidden, as a row of pills (the forms and the top of the page of a new jigsaw use it). Private and hidden need an owner. */
@Component({
  selector: 'app-visibility-choice',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawNew'), provideTranslocoScope('userLevels')],
  templateUrl: './visibility-choice.html',
})
export class VisibilityChoice {
  readonly visibility = model.required<'everyone' | 'owner' | 'hidden'>();
  /** the jigsaw has an owner (without one only Public can be chosen) */
  readonly ownerKnown = input(false);
  private readonly users = inject(JigsawUserService);
  /** Public is for a publisher or an admin; a jigsaw that is public already may stay so, and then Public is the choice that is made (`UserLevels.publishError`) */
  protected readonly publicLocked = computed(() => !this.users.mayPublish() && this.visibility() !== 'everyone');
}

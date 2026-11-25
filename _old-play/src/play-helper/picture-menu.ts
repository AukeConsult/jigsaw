import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { HelperMenu } from '../core/helper-menu';

/** The menu point "Add picture" of the user helper. */
@Component({
  selector: 'picture-menu',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  template: `<span class="d-flex align-items-center gap-2 text-nowrap small" *transloco="let t"><i class="bi bi-image" aria-hidden="true"></i>{{ t('play.user.picture') || 'Add picture' }}</span>`,
})
export class PictureMenu extends HelperMenu {}

import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { HelperMenu } from '../core/helper-menu';

/** The menu point "Preferences" of the user helper. */
@Component({
  selector: 'preferences-menu',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  template: `<span class="d-flex align-items-center gap-2 text-nowrap small" *transloco="let t"><i class="bi bi-sliders" aria-hidden="true"></i>{{ t('play.user.preferences') || 'Preferences' }}</span>`,
})
export class PreferencesMenu extends HelperMenu {}

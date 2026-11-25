import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { HelperView } from '../core/helper-view';

/** The view of the point "Preferences" (a dummy for now): where the user will set preferences. */
@Component({
  selector: 'preferences-view',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  template: `<div *transloco="let t"><h2 class="fs-5 d-flex align-items-center gap-2"><i class="bi bi-sliders" aria-hidden="true"></i>{{ t('play.user.preferences') || 'Preferences' }}</h2><p class="mb-0">{{ t('play.user.preferencesDummy') || 'This is where you will set your preferences. It is only a dummy for now.' }}</p></div>`,
})
export class PreferencesView extends HelperView {
  override readonly storageKey = 'play.preferencesView';
}

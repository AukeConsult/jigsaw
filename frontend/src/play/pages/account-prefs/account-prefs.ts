import { Component } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** The page of the route `/play/account/preferences`: the preferences of the account (not the filter of the picture list, which is `/play/prefs`): a placeholder for now. */
@Component({
  selector: 'play-account-prefs',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max" *transloco="let t"><h1 class="page-title">{{ t('play.accountPreferences') || 'Account preferences' }}</h1></main>`,
})
export class PlayAccountPrefs {}

import { Component } from '@angular/core';
import { AccountLevels } from '../../../app/jigsaw/account-levels/account-levels';

/** The page of the route `/play/admin`, for an admin (or for every account that plays while there is no admin): it frames the component `app-account-levels`, the same as the website's `/jigsaw/admin`, in its mode `inApp`. */
@Component({
  selector: 'play-admin',
  imports: [AccountLevels],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max"><app-account-levels [inApp]="true" /></main>`,
})
export class PlayAdmin {}

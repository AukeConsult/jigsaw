import { Component } from '@angular/core';
import { AccountLevels } from '../account-levels/account-levels';

/** The levels of the accounts (`/jigsaw/admin`, for an admin): the page only frames the component `app-account-levels`, which the app's `/play/admin` frames too. */
@Component({
  selector: 'app-jigsaw-admin',
  imports: [AccountLevels],
  template: `<main class="container-fluid page-margin page-max"><app-account-levels /></main>`,
})
export class JigsawAdmin {}

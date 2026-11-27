import { Routes } from '@angular/router';
import { AccountLevels } from './account-levels/account-levels';
import { adminGuard, adminOnlyGuard } from './admin.guard';
import { AdminShell } from './admin-shell';
import { AiUse } from './ai-use/ai-use';

/**
 * **The admin of the system, `/jigsaw`**: nothing of playing is here (that is the app, `/play`).
 *  - `/jigsaw`: the levels of the accounts (user, publisher, admin), for an admin, and for every account that plays while there is no admin.
 *  - `/jigsaw/ai-use`: what the AI has used for the account, for an admin.
 */
export const ADMIN_ROUTES: Routes = [
  {
    path: '',
    component: AdminShell,
    children: [
      { path: '', pathMatch: 'full', component: AccountLevels, title: 'Account levels', canActivate: [adminGuard] },
      { path: 'ai-use', component: AiUse, title: 'AI use', canActivate: [adminOnlyGuard] },
    ],
  },
];

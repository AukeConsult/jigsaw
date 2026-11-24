import { Routes } from '@angular/router';
import { adminGuard, adminOnlyGuard } from './admin.guard';
import { AiUse } from './ai-use/ai-use';
import { JigsawAdmin } from './jigsaw-admin/jigsaw-admin';
import { JigsawBatch } from './jigsaw-batch/jigsaw-batch';
import { JigsawFind } from './jigsaw-find/jigsaw-find';
import { JigsawHome } from './jigsaw-home/jigsaw-home';
import { JigsawNew } from './jigsaw-new/jigsaw-new';
import { JigsawPackages } from './jigsaw-packages/jigsaw-packages';
import { MakePackages } from './make-packages/make-packages';
import { publisherGuard } from './publisher.guard';
import { JigsawPage } from './jigsaw-page/jigsaw-page';
import { JigsawPlay } from './jigsaw-play/jigsaw-play';
import { JigsawUser } from './jigsaw-user/jigsaw-user';
import { userGuard } from './user.guard';
import { GuidePage } from '../guide/guide-page';
import { JigsawShell } from './jigsaw-shell';

/**
 * The jigsaw module, `/jigsaw`: the module the app opens with.
 *  - `/jigsaw`: the front page: what Karins jigsaw is, where to start, and the newest jigsaws.
 *  - `/jigsaw/find`: find a jigsaw: choose what to look for (category, size, difficulty, owner), press Go, and the jigsaws that match are shown.
 *  - `/jigsaw/admin`: the levels of the accounts (user, publisher, admin), for an admin.
 *  - `/jigsaw/ai-use`: what the AI has used for the account, for an admin.
 *  - `/jigsaw/packages/make`: make a package (a dummy for now), for a publisher or an admin.
 *  - `/jigsaw/packages`: select packages: a dummy page for now.
 *  - `/jigsaw/list`: gone; the jigsaws are looked for on the front page (`/`), so an old address goes there.
 *  - `/jigsaw/new`: a new jigsaw: the settings are filled in in the main frame, then saved, and a game of it is started.
 *  - `/jigsaw/batch`: many jigsaws at once: how many pieces and how hard, many pictures chosen from the computer, each made into a jigsaw and classified by the AI.
 *  - `/jigsaw/user`: who plays: the accounts to choose from; `/jigsaw/user/new`: make an account of one's own (only a name).
 *  - `/jigsaw/guide`: the help (the user guide), and `/jigsaw/about`: the about page (the same component, another document).
 *  - `/jigsaw/:id`: a jigsaw: its picture, and the games of the user (continue one, or start a new one).
 *  - `/jigsaw/:id/edit`: edit the whole jigsaw (the form of a new one, filled in), while nobody has played it.
 *  - `/jigsaw/:id/play/:playId`: playing one game of a jigsaw.
 * The pages that need to know who plays are behind `userGuard`: making and editing a jigsaw and entering a round. A jigsaw (`/jigsaw/:id`) can be looked at with no account.
 */
export const JIGSAW_ROUTES: Routes = [
  {
    path: '',
    component: JigsawShell,
    children: [
      { path: '', component: JigsawHome, title: 'Karins jigsaw' },
      { path: 'find', component: JigsawFind, title: 'Filter pictures' }, // before ':id'
      { path: 'admin', component: JigsawAdmin, title: 'Account levels', canActivate: [adminGuard] }, // before ':id'
      { path: 'ai-use', component: AiUse, title: 'AI use', canActivate: [adminOnlyGuard] }, // before ':id'
      { path: 'packages/make', component: MakePackages, title: 'Make packages', canActivate: [publisherGuard] }, // before ':id'
      { path: 'packages', component: JigsawPackages, title: 'Select packages' }, // before ':id'
      { path: 'list', redirectTo: '/' }, // the list page is gone: what it did is done by the finder on the front page
      { path: 'new', component: JigsawNew, title: 'New jigsaw', canActivate: [userGuard] },
      { path: 'batch', component: JigsawBatch, title: 'Make many jigsaws', canActivate: [userGuard] }, // before ':id'
      { path: 'user', component: JigsawUser, title: 'Who plays?' },
      { path: 'user/new', component: JigsawUser, title: 'What is your name?' }, // the form of a new account: only here, never as the first thing on /jigsaw/user
      { path: 'guide', component: GuidePage, title: 'Help', data: { guide: 'jigsaw-guide.md' } }, // before ':id'
      { path: 'about', component: GuidePage, title: 'About', data: { guide: 'jigsaw-about.md' } }, // before ':id'
      { path: ':id/edit', component: JigsawNew, title: 'Edit jigsaw', canActivate: [userGuard] },
      { path: ':id/play/:playId', component: JigsawPlay, title: 'Karins jigsaw', canActivate: [userGuard] },
      { path: ':id', component: JigsawPage, title: 'Karins jigsaw' }, // anybody may look at a jigsaw; an account is asked for when a round is entered
    ],
  },
];

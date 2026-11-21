import { Routes } from '@angular/router';
import { JigsawHome } from './jigsaw-home/jigsaw-home';
import { JigsawList } from './jigsaw-list/jigsaw-list';
import { JigsawNew } from './jigsaw-new/jigsaw-new';
import { JigsawPage } from './jigsaw-page/jigsaw-page';
import { JigsawPlay } from './jigsaw-play/jigsaw-play';
import { JigsawUser } from './jigsaw-user/jigsaw-user';
import { userGuard } from './user.guard';
import { GuidePage } from '../guide/guide-page';
import { JigsawShell } from './jigsaw-shell';

/**
 * The jigsaw module, `/jigsaw`: the module the app opens with.
 *  - `/jigsaw`: the front page: what Karins jigsaw is, where to start, and the newest jigsaws.
 *  - `/jigsaw/list`: the saved jigsaws, to open, to delete, or to start a new one from.
 *  - `/jigsaw/new`: a new jigsaw: the settings are filled in in the main frame, then saved, and a game of it is started.
 *  - `/jigsaw/user`: who plays: make a user (a user name and a name) or say the user name you have.
 *  - `/jigsaw/guide`: the help (the user guide), and `/jigsaw/about`: the about page (the same component, another document).
 *  - `/jigsaw/:id`: a jigsaw: its picture, and the games of the user (continue one, or start a new one).
 *  - `/jigsaw/:id/edit`: edit the whole jigsaw (the form of a new one, filled in), while nobody has played it.
 *  - `/jigsaw/:id/play/:playId`: playing one game of a jigsaw.
 * The pages that need to know who plays are behind `userGuard`.
 */
export const JIGSAW_ROUTES: Routes = [
  {
    path: '',
    component: JigsawShell,
    children: [
      { path: '', component: JigsawHome, title: 'Karins jigsaw' },
      { path: 'list', component: JigsawList, title: 'All jigsaws' },
      { path: 'new', component: JigsawNew, title: 'New jigsaw', canActivate: [userGuard] },
      { path: 'user', component: JigsawUser, title: 'Who plays?' },
      { path: 'guide', component: GuidePage, title: 'Help', data: { guide: 'jigsaw-guide.md' } }, // before ':id'
      { path: 'about', component: GuidePage, title: 'About', data: { guide: 'jigsaw-about.md' } }, // before ':id'
      { path: ':id/edit', component: JigsawNew, title: 'Edit jigsaw', canActivate: [userGuard] },
      { path: ':id/play/:playId', component: JigsawPlay, title: 'Karins jigsaw', canActivate: [userGuard] },
      { path: ':id', component: JigsawPage, title: 'Karins jigsaw', canActivate: [userGuard] },
    ],
  },
];

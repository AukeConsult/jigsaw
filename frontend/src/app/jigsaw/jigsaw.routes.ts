import { Routes } from '@angular/router';
import { JigsawList } from './jigsaw-list/jigsaw-list';
import { JigsawNew } from './jigsaw-new/jigsaw-new';
import { JigsawPlay } from './jigsaw-play/jigsaw-play';
import { JigsawShell } from './jigsaw-shell';

/**
 * The jigsaw module, `/jigsaw`: the module the app opens with.
 *  - `/jigsaw`: the saved jigsaws, to open, to delete, or to start a new one from.
 *  - `/jigsaw/new`: a new jigsaw: the settings are filled in in the main frame, then saved, and the jigsaw is opened to play.
 *  - `/jigsaw/:id`: playing a jigsaw.
 */
export const JIGSAW_ROUTES: Routes = [
  {
    path: '',
    component: JigsawShell,
    children: [
      { path: '', component: JigsawList, title: 'Karins jigsaw' },
      { path: 'new', component: JigsawNew, title: 'New jigsaw' },
      { path: ':id', component: JigsawPlay, title: 'Karins jigsaw' },
    ],
  },
];

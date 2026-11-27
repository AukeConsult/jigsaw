import { inject } from '@angular/core';
import { Router, Routes } from '@angular/router';
import { publisherGuard } from '../app/jigsaw/publisher.guard';
import { accountMenu, infoMenu, pageMenu, jigsawMenu, listMenu, pictureMenu, roundMenu, mineMenu, packagesMenu, publishMenu } from './helper/menus';
import { PlayAccount } from './pages/account/account';
import { PlayAddPicture } from './pages/add-picture/add-picture';
import { PlayMany } from './pages/many/many';
import { PlayPackage } from './pages/package/package';
import { PlayPackages } from './pages/packages/packages';
import { PlayPackagePictures } from './pages/package-pictures/package-pictures';
import { PlayFeedEdit } from './pages/feed/feed-edit';
import { PlayFeedList } from './pages/feed/feed-list';
import { PlayPicture } from './pages/picture/picture';
import { PlayList } from './pages/list/list';
import { PlayMyPictures } from './pages/my-pictures/my-pictures';
import { PlayMyRounds } from './pages/my-rounds/my-rounds';
import { PlayInfo } from './pages/info/info';
import { PlayPrefs } from './pages/prefs/prefs';
import { PlayRound } from './pages/round/round';
import { PlayJigsaw } from './pages/jigsaw/jigsaw';
import { PlayAccountPrefs } from './pages/account-prefs/account-prefs';
import { PlayMain } from './play-main/play-main';
import { lastPage, pageBeforeInfo } from './last-page';

/**
 * The routes of the app, under `/play`: **the main page is the main route, and the pages are its sub routes**, each shown in the one router outlet of the main page: `/play/list` the picture list, `/play/account` the account (who is on, and all that has to
 * do with the account) with `/play/account/preferences` the preferences of the account, `/play/prefs` the picture preferences, `/play/jigsaw/:id` the puzzle of a jigsaw (where a card of a ready jigsaw leads) and `/play/round/:id` the start of a round (where a card of a picture leads), and **`/play/mine` (it goes to the user's pictures) with its sub pages: `/play/mine/addpicture`, `/play/mine/pictures` and `/play/mine/rounds`, which all show the user menu** (`/play` goes to the list). **Every route carries a page and the menu that goes with it** (`data.menu`, see `helper/menus.ts`), and the helper shows that menu
 * inside its button.
 */
export const PLAY_ROUTES: Routes = [
  {
    path: '',
    component: PlayMain,
    title: 'Play',
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'list' }, // /play goes to the list
      { path: 'list', component: PlayList, title: 'Pictures', data: { menu: listMenu } },
      {
        path: 'account', // the account and its preferences: both show the account menu
        data: { menu: accountMenu },
        children: [
          { path: '', pathMatch: 'full', component: PlayAccount, title: 'Account' },
          { path: 'preferences', component: PlayAccountPrefs, title: 'Preferences' },
        ],
      },
      { path: 'round/:id', component: PlayRound, title: 'Start a round', data: { menu: roundMenu } }, // where a picture leads: the choice of the pieces and the difficulty
      { path: 'jigsaw/:id', component: PlayJigsaw, title: 'Jigsaw', data: { menu: jigsawMenu } },
      {
        path: 'info', // the info about the app: the route is only the frame of its pages, so its menu (every page in it) is the menu of each
        data: { menu: infoMenu },
        children: [
          { path: '', pathMatch: 'full', redirectTo: () => lastPage('info') }, // /play/info has no page of its own: it opens the page of the info that was open last, the help to begin with
          { path: 'back', redirectTo: () => inject(Router).parseUrl(pageBeforeInfo()) }, // Back, in the menu and on the pages: to where the person was before the info
          { path: 'welcome', component: PlayInfo, title: 'Welcome', data: { doc: 'welcome' } },
          { path: 'help', component: PlayInfo, title: 'Help', data: { doc: 'help' } },
          { path: 'about', component: PlayInfo, title: 'About', data: { doc: 'about' } },
          { path: 'terms', component: PlayInfo, title: 'Terms of use', data: { doc: 'terms' } },
          { path: 'install', component: PlayInfo, title: 'Install', data: { doc: 'install' } },
        ],
      },
      { path: 'packages', component: PlayPackages, title: 'All packages', data: { menu: packagesMenu } }, // every package there is to get, as tiles
      { path: 'package/:id', component: PlayPackage, title: 'Package', data: { menu: packagesMenu } }, // where a package tile of the home page leads: the package and its pictures
      { path: 'prefs', component: PlayPrefs, title: 'Picture preferences', data: { menu: pageMenu } },
      {
        path: 'mine', // the user's own pages: the route is only the frame of them, so its menu is the menu of every sub page
        data: { menu: mineMenu },
        children: [
          { path: '', pathMatch: 'full', redirectTo: () => lastPage('mine') }, // /play/mine has no page of its own: it opens the user's page that was open last, their pictures to begin with
          { path: 'publish', pathMatch: 'full', redirectTo: () => lastPage('publish') }, // where Publish leads: the page of the publisher that was open last
          { path: 'addpicture', component: PlayAddPicture, title: 'Add picture' },
          { path: 'many', component: PlayMany, title: 'Many pictures', canActivate: [publisherGuard], data: { menu: publishMenu } }, // many pictures at once: for a publisher or an admin
          { path: 'info', component: PlayFeedList, title: 'Information', data: { kind: 'info', menu: publishMenu }, canActivate: [publisherGuard] }, // the information of the home page a publisher or an admin writes
          { path: 'info/new', component: PlayFeedEdit, title: 'New information', data: { kind: 'info', menu: publishMenu }, canActivate: [publisherGuard] },
          { path: 'info/:id', component: PlayFeedEdit, title: 'Information', data: { kind: 'info', menu: publishMenu }, canActivate: [publisherGuard] },
          { path: 'offers', component: PlayFeedList, title: 'Offers', data: { kind: 'offer', menu: publishMenu }, canActivate: [publisherGuard] }, // the offers of the home page
          { path: 'offers/new', component: PlayFeedEdit, title: 'New offer', data: { kind: 'offer', menu: publishMenu }, canActivate: [publisherGuard] },
          { path: 'offers/:id', component: PlayFeedEdit, title: 'Offer', data: { kind: 'offer', menu: publishMenu }, canActivate: [publisherGuard] },
          { path: 'packages', component: PlayFeedList, title: 'Packages', data: { kind: 'package', menu: publishMenu }, canActivate: [publisherGuard] }, // the packages of the home page a publisher or an admin writes
          { path: 'packages/new', component: PlayFeedEdit, title: 'New package', data: { kind: 'package', menu: publishMenu }, canActivate: [publisherGuard] },
          { path: 'packages/:id/pictures', component: PlayPackagePictures, title: 'Pictures of the package', canActivate: [publisherGuard], data: { menu: publishMenu } }, // the detail of a package: its pictures and the upload of more
          { path: 'packages/:id', component: PlayFeedEdit, title: 'Package', data: { kind: 'package', menu: publishMenu }, canActivate: [publisherGuard] },
          { path: 'picture/:id', component: PlayPicture, title: 'Picture', data: { menu: pictureMenu } }, // a picture that is there: the same form as Add picture, and its rounds
          { path: 'pictures', component: PlayMyPictures, title: 'My pictures' },
          { path: 'rounds', component: PlayMyRounds, title: 'My rounds' },
        ],
      },
    ],
  },
];

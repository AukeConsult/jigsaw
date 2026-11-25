import { ListToggle } from '../list-view';
import { PictureToggle } from '../picture-view';
import { PuzzelToggle } from '../puzzel-view';

/**
 * One entry of the menu of the helper: an icon, the words, and either the page a press goes to (a plain link: the pages are routes) or, with `toggle`, a switch of the page that is open (on or off: `PuzzelView`). The words are a text (an
 * account's name) or a key of the texts of the app with its English.
 */
export interface PlayMenuItem {
  readonly icon: string;
  /** the page a press goes to (an entry that is a switch has none) */
  readonly route?: string;
  /** the entry is a switch of the page that is open (the puzzle, or a picture), not a link */
  readonly toggle?: PuzzelToggle | PictureToggle | ListToggle;
  readonly text?: string;
  readonly key?: string;
  readonly english?: string;
  /** the entry is the choice of the language (the flag and name of the language in use, and the list one step down): it has no icon or words of its own */
  readonly language?: boolean;
  /** the entry is the name of the app, the logo with "Karins jigsaw" (the same as the website shows it), instead of an icon and words */
  readonly brand?: boolean;
}

/**
 * **The menu of a route**: every route of the app carries a page and the menu that goes with it (`data.menu` of the route), and the helper shows that menu inside its button. It is given who plays (nothing: nobody is logged on) and
 * says the menu for that case, or none (the helper is not shown then).
 */
export type PlayMenu = (user: { readonly name: string } | null, may: MenuMay) => readonly PlayMenuItem[] | null;

/** What the user may, besides what the menu knows from who plays: open the page of the levels of the accounts (an admin does, and every account that plays while there is no admin), and make many pictures at once (a publisher or an admin). */
export interface MenuMay {
  readonly levels: boolean;
  /** the user is a publisher or an admin: the menu has the page for many pictures at once */
  readonly publish: boolean;
}

/** The first entry of every menu: the name of the app, "Karins jigsaw" with the logo, and it goes home (`/`, the home of the mode). So the name is on every page, inside the helper. */
const BRAND: PlayMenuItem = { icon: 'bi-house', route: '/', brand: true };

/** The entry for nobody who is logged on: "Logon", to the account page. */
const LOGON: PlayMenuItem = { icon: 'bi-person-circle', route: '/play/account', key: 'play.logon', english: 'Logon' };

/** The entry that adds a picture: its page is one of the user's pages (`/play/mine/...`), so a press switches to the user menu. */
const ADD_PICTURE: PlayMenuItem = { icon: 'bi-image', route: '/play/mine/addpicture', key: 'play.addPicture', english: 'Add picture' };

/** The last row of the home page menu: the language, as the website's menu has it (the flag and name of the language in use, and the list of languages one step down). */
const LANGUAGE: PlayMenuItem = { icon: 'bi-translate', language: true };

/** The entry for the info page: the welcome, the help, the about page and how to install the app. For everybody, also for nobody who is logged on. */
const INFO: PlayMenuItem = { icon: 'bi-info-circle', route: '/play/info', key: 'play.info', english: 'Info' };

/** The entry for the preferences of the account (the page is under the account: `/play/account/preferences`, reached from the account page, whose menu has it: it is not in the page menu). */
const ACCOUNT_PREFERENCES: PlayMenuItem = { icon: 'bi-person-gear', route: '/play/account/preferences', key: 'play.accountPreferences', english: 'Account preferences' };

/** The entries of the page menu for a user who is logged on: the brand (home), the user (to the user's own pages, which have the user menu), adding a picture, the picture preferences and, always last, the account (its name, to the account page, the logon). */
const pageEntries = (user: { readonly name: string }, may: MenuMay): readonly PlayMenuItem[] => [
  BRAND,
  { icon: 'bi-person-lines-fill', route: '/play/mine', key: 'play.myUser', english: 'My pictures' },
  ADD_PICTURE,
  { icon: 'bi-sliders', route: '/play/prefs', key: 'play.picturePreferences', english: 'Picture preferences' },
  INFO,
  ...(may.levels ? [{ icon: 'bi-shield-lock', route: '/play/admin', key: 'play.admin', english: 'Admin' }] : []), // the levels of the accounts: for an admin, and for everybody while there is no admin
  { icon: 'bi-person-circle', route: '/play/account', text: user.name },
];

/** The menu of the pages outside `/play/mine` (the list, the preferences): the brand and the page entries, or the brand and "Logon" for nobody. */
export const pageMenu: PlayMenu = (user, may) => (user ? pageEntries(user, may) : [BRAND, INFO, LOGON]);

/** The menu of the home page (the list): the page menu with two switches: the rounds that are going on the top of the list, and only the user's favorites. Nobody plays: no rounds, so the page menu. */
export const listMenu: PlayMenu = (user, may) => {
  const entries = pageMenu(user, may) ?? [];
  if (!user) return [...entries, LANGUAGE]; // the language is the last row of the home page menu, also for nobody
  const at = entries.findIndex((item) => item.route === ADD_PICTURE.route) + 1;
  return [...entries.slice(0, at), { icon: 'bi-play-circle', toggle: 'ongoing', key: 'play.ongoingRounds', english: 'Ongoing rounds' }, { icon: 'bi-heart', toggle: 'favorites', key: 'play.myFavorites', english: 'My favorites' }, ...entries.slice(at), LANGUAGE];
};

/** The menu of the info pages (`/play/info/...`): the way home (the brand) and every page of the info, one entry each (the welcome, the help, the about page and how to install the app), the same for everybody. */
export const infoMenu: PlayMenu = () => [
  BRAND,
  { icon: 'bi-stars', route: '/play/info/welcome', key: 'play.infoWelcome', english: 'Welcome' },
  { icon: 'bi-book', route: '/play/info/help', key: 'play.infoHelp', english: 'Help' },
  { icon: 'bi-info-circle', route: '/play/info/about', key: 'play.infoAbout', english: 'About' },
  { icon: 'bi-download', route: '/play/info/install', key: 'play.infoInstall', english: 'Install' },
];

/** The menu of the account page and its sub page: the way home (the brand), the account itself and its preferences (so one goes between the two pages); for nobody only the way home, since the page is the way in. */
export const accountMenu: PlayMenu = (user) => (user ? [BRAND, { icon: 'bi-person-circle', route: '/play/account', key: 'play.accountEntry', english: 'Account' }, { ...ACCOUNT_PREFERENCES, key: 'play.preferences', english: 'Preferences' }] : [BRAND]); // inside the account the word account is not said again

/** The menu of the puzzle: the way home (the brand) and three switches, each on or off: the help picture, the details of the round, and the border pieces (only the corner and edge pieces in the store). No other entry: a puzzle is played, and nothing else is on the screen. */
export const jigsawMenu: PlayMenu = () => [
  BRAND,
  { icon: 'bi-image', toggle: 'help', key: 'play.puzzelHelp', english: 'Help picture' },
  { icon: 'bi-info-circle', toggle: 'details', key: 'play.puzzelDetails', english: 'Details' },
  { icon: 'bi-bounding-box', toggle: 'edges', key: 'play.puzzelEdges', english: 'Border pieces' },
];

/** The menu of the page of a picture (where it is changed, and its rounds are): the way home, the way back to the list of the user's pictures, and two switches, each on or off: the picture (its form) and the rounds of the picture. */
export const pictureMenu: PlayMenu = () => [
  BRAND,
  { icon: 'bi-images', route: '/play/mine/pictures', key: 'play.myPictures', english: 'My pictures' },
  { icon: 'bi-image', toggle: 'picture', key: 'play.pictureTab', english: 'Picture' },
  { icon: 'bi-play-circle', toggle: 'rounds', key: 'play.pictureRounds', english: 'Rounds' },
];

/** The menu of the page of the levels of the accounts: only the way home (the brand). */
export const adminMenu: PlayMenu = () => [BRAND];

/** The menu of the page where a round of a picture is started: only the way home (the brand); the page is the choice of the pieces and the difficulty. */
export const roundMenu: PlayMenu = () => [BRAND];

/** The user menu, shown under the route `/play/mine` and its sub pages: the brand, adding a picture, the pictures the user made and the rounds the user played (for nobody the same as the page menu: the user pages need an account). */
export const mineMenu: PlayMenu = (user, may) =>
  user
    ? [
        BRAND,
        ADD_PICTURE,
        ...(may.publish
          ? [
              { icon: 'bi-collection', route: '/play/mine/many', key: 'play.manyPictures', english: 'Many pictures' }, // a publisher or an admin uploads many at once
              { icon: 'bi-box-seam', route: '/play/mine/packages', key: 'play.makePackages', english: 'Make packages' },
            ]
          : []),
        { icon: 'bi-images', route: '/play/mine/pictures', key: 'play.myPictures', english: 'My pictures' },
        { icon: 'bi-play-circle', route: '/play/mine/rounds', key: 'play.myRounds', english: 'My rounds' },
      ]
    : [BRAND, LOGON];

import { ListToggle } from '../list-view';
import { PuzzelToggle } from '../puzzel-view';
import { isInApp } from '../../app/core/platform';

/**
 * One entry of the menu of the helper: an icon, the words, and either the page a press goes to (a plain link: the pages are routes) or, with `toggle`, a switch of the page that is open (on or off: `PuzzelView`). The words are a text (an
 * account's name) or a key of the texts of the app with its English.
 */
export interface PlayMenuItem {
  readonly icon: string;
  /** the page a press goes to (an entry that is a switch has none) */
  readonly route?: string;
  /** the press takes the place of the page that is open in the history of the browser, instead of coming after it */
  readonly replace?: boolean;
  /** the entry is a switch of the page that is open (the puzzle, or the home page), not a link */
  readonly toggle?: PuzzelToggle | ListToggle;
  /** the entry can carry a dot on its icon that says something about the app is on: `filter`, that the filter of the list has choices set */
  readonly mark?: 'filter';
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

/** What the user may, besides what the menu knows from who plays: open the page of the levels of the accounts (an admin does, and every account that plays while there is no admin), and publish (a publisher or an admin). */
export interface MenuMay {
  readonly levels: boolean;
  /** the user is a publisher or an admin: the user menu has the entry Publish */
  readonly publish: boolean;
}

// **A menu is kept small**: it takes room from the page, so it has what is used where it is shown, six entries or so besides the name of the app. What is chosen once (the language, what the home page shows) is a preference. **The
// last entry of every menu is Help** (the info pages have their own menu, of their pages).

/** The first entry of every menu: the name of the app, "Karins jigsaw" with the logo, and it goes home (`/`, the home of the mode). So the name is on every page, inside the helper. */
const BRAND: PlayMenuItem = { icon: 'bi-house', route: '/', brand: true };

/** The entry for nobody who is logged on: "Logon", to the account page. */
const LOGON: PlayMenuItem = { icon: 'bi-person-circle', route: '/play/account', key: 'play.logon', english: 'Logon' };

/** The entry that adds a picture: its page is one of the user's pages (`/play/mine/...`), so a press switches to the user menu. */
const ADD_PICTURE: PlayMenuItem = { icon: 'bi-plus-square', route: '/play/mine/addpicture', key: 'play.addPicture', english: 'Add picture' };

/** The entry to the user's own pages (their pictures, rounds and, for a publisher, what they publish), with the user menu. */
const MY_STUFF: PlayMenuItem = { icon: 'bi-folder', route: '/play/mine', key: 'play.myUser', english: 'My stuff' };

/** The entry that chooses which pictures are listed; it has a dot while any choice is made. */
const FILTER: PlayMenuItem = { icon: 'bi-funnel', route: '/play/prefs', key: 'play.picturePreferences', english: 'Filter', mark: 'filter' };

/** The language, for nobody on the home page (a user has it in the preferences): the flag is seen by somebody who can not read the words. */
const LANGUAGE: PlayMenuItem = { icon: 'bi-translate', language: true };

/** The entry for all the packages there are to get. For everybody. */
const PACKAGES: PlayMenuItem = { icon: 'bi-box-seam', route: '/play/packages', key: 'play.allPackages', english: 'Packages' };

/** The entry to the help and the other info pages (the welcome, the about page and how to install the app, in the menu there): the last of every menu. It opens the page that was open there last (`lastPage`), the help to begin with. */
const HELP: PlayMenuItem = { icon: 'bi-question-circle', route: '/play/info', key: 'play.infoHelp', english: 'Help' };

/** The entry for the levels of the accounts, in the account menu. */
const ADMIN: PlayMenuItem = { icon: 'bi-shield-lock', route: '/play/admin', key: 'play.admin', english: 'Admin' };

/** The entry for the preferences (the theme, the text, the sizes, the language, what the home page shows), for everybody: they are kept on the device, and with the account that plays. */
const PREFERENCES: PlayMenuItem = { icon: 'bi-palette', route: '/play/account/preferences', key: 'play.preferences', english: 'Preferences' };

/** The entries of the page menu for a user who is logged on, before Help: the brand (home), adding a picture, the user's own pages, the filter of the list, the packages, the preferences and the account (its name). */
const pageEntries = (user: { readonly name: string }): readonly PlayMenuItem[] => [BRAND, ADD_PICTURE, MY_STUFF, FILTER, PACKAGES, PREFERENCES, { icon: 'bi-person-circle', route: '/play/account', text: user.name }];

/** The entries of the pages outside `/play/mine` before Help: the page entries, or for nobody the brand, the packages, the preferences and "Logon". */
const pageStart = (user: { readonly name: string } | null): readonly PlayMenuItem[] => (user ? pageEntries(user) : [BRAND, PACKAGES, PREFERENCES, LOGON]);

/** The menu of the pages outside `/play/mine` (the list, the filter). */
export const pageMenu: PlayMenu = (user) => [...pageStart(user), HELP];

/** The menu of the pages of the packages (all of them, and one): the way home (the brand), the user's own pages, where their packages are too, and the packages; for nobody the way home, the packages and "Logon" (a package is got by an account). */
export const packagesMenu: PlayMenu = (user) => (user ? [BRAND, MY_STUFF, PACKAGES, HELP] : [BRAND, PACKAGES, LOGON, HELP]);

/** The menu of the home page (the list): the page menu, and for a user the switch My favorites after the filter (shown only while there are favorites); for nobody the language, before Help. */
export const listMenu: PlayMenu = (user) => {
  const entries = pageStart(user);
  if (!user) return [...entries, LANGUAGE, HELP];
  const at = entries.indexOf(FILTER) + 1;
  return [...entries.slice(0, at), { icon: 'bi-heart', toggle: 'favorites', key: 'play.myFavorites', english: 'My favorites' }, ...entries.slice(at), HELP];
};

/**
 * The menu of the info pages (`/play/info/...`): the way home (the brand), **Back** to the page the person came from (the whole menu changed when they pressed Help, and the logo alone does not say how to get back), and every page of the info,
 * one entry each (the welcome, the help, the about page and, when this is not the installed app already, how to install it). **They all take each other's place in the history** (`replace`), so the back button of the device also leaves the
 * info in one press, to where the person came from, however many of its pages were opened. (A link from one info page to another does the same.)
 */
export const infoMenu: PlayMenu = () => [
  BRAND,
  { icon: 'bi-arrow-left', route: '/play/info/back', replace: true, key: 'play.infoBack', english: 'Back' },
  { icon: 'bi-stars', route: '/play/info/welcome', replace: true, key: 'play.infoWelcome', english: 'Welcome' },
  { icon: 'bi-book', route: '/play/info/help', replace: true, key: 'play.infoHelp', english: 'Help' },
  { icon: 'bi-info-circle', route: '/play/info/about', replace: true, key: 'play.infoAbout', english: 'About' },
  ...(isInApp() ? [] : [{ icon: 'bi-download', route: '/play/info/install', replace: true, key: 'play.infoInstall', english: 'Install' }]),
];

/**
 * The menu of the account page, its sub page (the preferences) and the page of the levels: the way home (the brand), the account itself, the preferences and, **for an admin, Admin** (the levels of the accounts; also for every
 * account while there is no admin, so the first one can be made: `may.levels`); for nobody only the way home and Help, since the page is the way in.
 */
export const accountMenu: PlayMenu = (user, may) => (user ? [BRAND, { icon: 'bi-person-circle', route: '/play/account', key: 'play.accountEntry', english: 'Account' }, PREFERENCES, ...(may.levels ? [ADMIN] : []), HELP] : [BRAND, HELP]);

/** The menu of the puzzle: the way home (the brand) and four switches, each on or off: the help picture, the details of the round, the border pieces (only the corner and edge pieces in the store) and the table, and Help. */
export const jigsawMenu: PlayMenu = () => [
  BRAND,
  { icon: 'bi-image', toggle: 'help', key: 'play.puzzelHelp', english: 'Help picture' },
  { icon: 'bi-card-list', toggle: 'details', key: 'play.puzzelDetails', english: 'Details' },
  { icon: 'bi-bounding-box', toggle: 'edges', key: 'play.puzzelEdges', english: 'Border pieces' },
  { icon: 'bi-palette', toggle: 'look', key: 'play.puzzelTable', english: 'Table' },
  HELP,
];

/** The menu of the page of a picture (where it is changed, and its rounds are): the way home and the way back to the list of the user's pictures. */
export const pictureMenu: PlayMenu = () => [BRAND, { icon: 'bi-images', route: '/play/mine/pictures', key: 'play.myPictures', english: 'My pictures' }, HELP];

/** The menu of the page where a round of a picture is started: only the way home (the brand) and Help; the page is the choice of the pieces and the difficulty. */
export const roundMenu: PlayMenu = () => [BRAND, HELP];

/** The user menu, shown under the route `/play/mine`: the brand, the pictures the user made, the rounds the user played, adding a picture and, for a publisher or an admin, Publish (for nobody the user pages need an account). */
export const mineMenu: PlayMenu = (user, may) =>
  user
    ? [
        BRAND,
        { icon: 'bi-images', route: '/play/mine/pictures', key: 'play.myPictures', english: 'My pictures' },
        { icon: 'bi-play-circle', route: '/play/mine/rounds', key: 'play.myRounds', english: 'My rounds' },
        ADD_PICTURE,
        ...(may.publish ? [{ icon: 'bi-megaphone', route: '/play/mine/publish', key: 'play.publish', english: 'Publish' }] : []),
        HELP,
      ]
    : [BRAND, LOGON, HELP];

/** The menu of what a publisher or an admin publishes: the brand, back to the user's own pages, many pictures at once, the information and the offers of the home page, and their packages. */
export const publishMenu: PlayMenu = (user) =>
  user
    ? [
        BRAND,
        MY_STUFF,
        { icon: 'bi-collection', route: '/play/mine/many', key: 'play.manyPictures', english: 'Many pictures' },
        { icon: 'bi-card-text', route: '/play/mine/info', key: 'play.feedInfo', english: 'Information' },
        { icon: 'bi-tag', route: '/play/mine/offers', key: 'play.feedOffers', english: 'Offers' },
        { icon: 'bi-box-seam', route: '/play/mine/packages', key: 'play.makePackages', english: 'My packages' },
        HELP,
      ]
    : [BRAND, LOGON, HELP];

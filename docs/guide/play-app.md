# The play module (`/play`): the new app

Part of the project guide. Read this before changing anything in `frontend/src/play/`. The short version is in `CLAUDE.md` ("The app and its routes"); this file explains the module as a whole.

## What it is
`/play` is **the new app**, started over from nothing in `frontend/src/play/`. It lives beside the existing website (`/jigsaw/...`, `frontend/src/app/jigsaw/`), which stays and is refactored later. Both use the same backend, the same model (`functions/src/models/shared/`) and the same colour scheme, backgrounds and size scale. **The native wrappers (Android, iOS, Windows) always open `https://karins-jigsaw.web.app/play`**, never the website (`server.url` in `frontend/capacitor.config.json`, `AppUrl` in `client-wrappers/windows/MainWindow.xaml.cs`; change them together).

What a person does in it: look at the pictures, press one to put it together (a **round**), add pictures of their own, look at their pictures and rounds, change their account, and read the info about the app.

## Two modes
The device has a mode, `play` or `jigsaw` (`core/app-mode.ts`, kept as `app.mode`). Opening anything under `/play` sets `play`, anything under `/jigsaw` sets `jigsaw` (`modeGuard`). The top routes follow the mode: home (`/`) goes to `/play/list` in play mode, and a top route such as `/list` goes to `/play/list`. What is unknown under `/play` goes to the home of the mode.

## The rules of the module
1. **Components and services are shared with the website, pages never are.** The app frames the website's components (`app-puzzel-board`, `app-my-jigsaws`, `app-jigsaw-header`, `app-welcome`, `app-guide-document` and so on) in pages of its own. When a website page holds what the app needs, the content is first made a component, and the page of the website frames it too. Components have an `inApp` input where their links must lead into `/play/...`.
2. **One component, framed into different pages**, so the person sees the same layout each time: the form of a picture (`play-picture-form`) is framed by Add picture and by the page of a picture.
3. **Every route carries a page and the menu that goes with it** (`data.menu`, a function of who plays, in `helper/menus.ts`, read by `play-route.ts`).
4. **The look is `styles.scss` only**: the five text sizes (`--app-fs-*`), the button sizes, the colour tokens, the page width `--app-page-max` (75 rem). Nothing sets a size or a font of its own (see `look-and-texts.md`). Every page is at most `.page-max` wide, except the puzzle, which fills the screen.
5. **Texts** are the scope `play` (`frontend/public/i18n/<language>/play.json`), **English only for now** (`TODO.md`, "Translate the texts of the new app"); a dev build is always shown in English (`forcedLanguage`). Reused scopes (`jigsawNew`, `jigsawList`, `guide` ...) are translated.
6. **Every choice the person makes is kept on the device** (`readPreference`/`writePreference`, rule 12 of `CLAUDE.md`): the list filter, the switches of the menu, whether the menu is open, where it was put.

## The frame: main page, helper, Info button
- **`PlayMain`** (`play-main/`) is the main route. It fills the screen and is **the one thing that scrolls** (the window itself never does). It has one `<router-outlet>` (the page that is open), the admin band (`app-admin-banner`, when an admin is in another account) and the frame. It has the soft puzzle-piece pattern behind the pages, as the website has (not behind the puzzle).
- **`PlayFrame`** (`play-frame/`) lies fixed over the page and everything on it and takes no clicks itself. It holds the helper and the **Info button** (a round button in the bottom right corner, see-through with a white border, leading to `/play/info`; not shown on the info pages).
- **The helper** (`helper/helper.ts`) is **one movable menu on the main level**. It shows the menu of the open page: a list of entries, each an icon, words and the page a press goes to, or a **switch** (`toggle`) of the page that is open. A press is plain routing (`routerLink`): there are no helper views and no helper subclasses.
  - **The first entry of every menu is the name of the app** (the logo with the little house: it goes home, `/`). The first row has two small buttons at its right end: the arrow that folds the menu to that row and opens it again, and the little arrow into a corner, which folds the menu and puts it in the top right corner (a double click on the row does the same). The first row is the same in every menu, sized by one parent class (`.play-helper .brand-item`).
  - It is dragged with the pointer, kept inside the window, grows from the side nearest to the edge when it opens or its words change, and its place and whether it is open are kept on the device. Until it is moved it is in the bottom right corner, just above the Info button.
  - **The last row of every menu with more than the logo is the language** (`app-language-select`, shared with the website: a row with the flag and name of the language in use, which opens the list of languages one step down, each with its flag; the choice is kept on the device and as the account's language). Until a language is chosen the language of the browser is used when the app has it.
  - Switches that have nothing to switch are not offered (Ongoing rounds without rounds going, My favorites without favorites). A finished puzzle has no help picture and no border pieces to switch.

## The menus (`helper/menus.ts`)
| Menu | Where | Entries |
|---|---|---|
| `pageMenu` | the pages outside the user's own ones (preferences) | brand, My pictures, Add picture, Picture preferences, Info, (Admin), the account's name; for nobody: brand, Info, Logon |
| `listMenu` | the list (home) | the page menu with the switches Ongoing rounds and My favorites |
| `mineMenu` | `/play/mine/...` | brand, Add picture, (Many pictures and Make packages for a publisher or admin), My pictures, My rounds |
| `accountMenu` | `/play/account/...` | brand, Account, Preferences |
| `infoMenu` | `/play/info/...` | brand, Welcome, Help, About, Install |
| `jigsawMenu` | the puzzle | brand, switches Help picture, Details, Border pieces |
| `pictureMenu` | a picture | brand, My pictures, switches Picture and Rounds |
| `roundMenu`, `adminMenu` | start of a round, admin | only the brand (the way home) |

The switches live in small services shared by the page and the menu: `PuzzelView`, `PictureView`, `ListView`.

## The pages (routes)
| Route | Page | What it frames |
|---|---|---|
| `/play` | goes to `/play/list` | |
| `/play/list` | the pictures (cards, newest first), with the band of the rounds that are going on top | `play-cards`, `app-my-rounds` (`inApp`) |
| `/play/round/:id` | the start of a round of a picture: the number of pieces and the difficulty | `app-round-choice` |
| `/play/jigsaw/:id` | the puzzle (`?round=` opens a given round) | `app-puzzel-board`, `app-puzzel-details`, `app-puzzel-banner`, all of `PuzzelRound` |
| `/play/account`, `/play/account/preferences` | who is on and everything about the account; the preferences (a placeholder) | `app-my-logon-users`, `app-user-logins`, `app-account-avatar` |
| `/play/prefs` | Picture preferences (what the list is filtered by; also kept with the user in the database) | `app-jigsaw-filter` |
| `/play/info/welcome`, `help`, `about`, `install` | the info about the app (one page component, the route data `doc` says which document) | `app-welcome`, `app-guide-document`, `app-install-document` |
| `/play/mine/pictures`, `/play/mine/rounds` | the pictures the user made and the rounds the user played | `app-my-jigsaws`, `app-my-round-list` (`inApp`) |
| `/play/mine/addpicture` | add a picture or a ready jigsaw | `play-picture-form` |
| `/play/mine/picture/:id` | a picture that is there, looked at, with Edit and Delete outside the form and its rounds | `play-picture-form`, `play-picture-rounds` |
| `/play/mine/many` | many pictures at once (publisher or admin) | `app-jigsaw-batch` (`inApp`) |
| `/play/mine/packages` | making packages (publisher or admin; a placeholder until `TODO.md`, "Packages") | |
| `/play/admin` | the levels of the accounts (admin; open to every account while there is no admin) | `app-account-levels` (`inApp`) |

`/play/mine` has no page of its own: it goes to My pictures. Only the owner (or an admin) changes a picture, and not its picture, size or cut once rounds have been played of it.

## The home page is a list of tiles
The list at `/play/list` (and the website's finder on its front page) shows **tiles**, not only pictures. `FeedItem` (`functions/src/models/shared/feed-item.ts`) is the parent class; `PictureItem`, `InfoItem`, `OfferItem` and `PackageItem` override small hooks. Pictures come from the search (`play-cards` asks it, with the filters and the endless scroll as before). The other tiles are kept as documents (`jigsaw-feed`) and come from `GET /jigsaw-feed` (`FeedService`); for now the store is `dummyFeedStore`, four made-up tiles. `HomeFeed.merge` puts them among the pictures, by their place counted in pictures from the first one, so a page of pictures loaded later never moves a tile that is already there; a tile whose place is not loaded yet waits. The app and the website use the same service, the same rule and the same tile component (`app-feed-tile`). What is still to decide and build is in `TODO.md`, "The home page: tiles".

## The puzzle page
The puzzle page does not scroll: it is as big as the screen. The details lie beside the board on a wide screen and over it on a small one (a click anywhere but on their own controls closes them). The working area reaches the top of the screen and the picture lies in from its top and left edge by `areaMargin` (a twentieth of the shorter side of the picture area, at least 20 px). A finished puzzle has the band on top with the time. The rules of the board are in `board-layout.md`, `rules-of-a-round.md` and `pieces-and-play.md`.

## Testing and running
There are no unit tests for the frontend: check pages in the browser (`npm run dev`, the frontend on http://localhost:4210/play). The model and the API have the real tests (`npm test`). After a change run `npx tsc -p tsconfig.app.json --noEmit --noUnusedLocals` in `frontend/`.

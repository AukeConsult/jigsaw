# TODO

Things that are decided but not done yet. Each chapter says what is there now and what is left.

## Future account settings

The settings of how a round looks are not chosen in a round any more: they will be in the account settings (the preferences, `/play/account/preferences`, `frontend/src/play/pages/account-prefs/`), where the person chooses them once, for every round.

What was taken out of the page of a round (a row of three fields):

- **Line**: how thick the line round each piece and round the picture area is (none, hairline 1 px, thin 2, medium 3, thick 5: the file that listed them, `line-level.ts`, is gone and is in the history).
- **Colour**: the colour of that line.
- **Background**: the background colour of the picture area, inside the frame.

What is still in the code, kept on purpose for the account settings (they have no screen now):

- `PuzzelRound` (`app/jigsaw/puzzel/puzzel-round.ts`): the signals `lineWidth`, `lineColor` and `backColor` (the board is drawn with them; they are read from what the round is played with, `detail.settings`, and nothing on the page changes them).
- The texts in the nine languages: `jigsawPlay.line`, `lineTitle`, `colour`, `colourTitle`, `back`, `backTitle`, and `jigsawLevels.line.*`.
- The model: `lineWidth`, `lineColor` and `backColor` on the jigsaw, and a round's `overrides` of them (`PlayOverrides`, read by `Plays.effective`; nothing writes them).

What was taken out because it had no way in from the screen: the choices `chooseLine`, `chooseLineColor` and `chooseBackColor`, the autosave of a round's choice, `PlaysService.saveSettings`, the route `PATCH /:playId/settings` and `Plays.overridesError` / `Plays.changed` (with the banner and texts `notSaved` and `couldNotSave`). Write them again for the account if a round-level choice is wanted.

To do:

- [ ] Add the three fields to the account settings, with the same texts, kept per account.
- [ ] Decide what an account's choice means for a round that has chosen for itself (the round's own choice, the account's, or the jigsaw's), and write it in `docs/guide/rounds-and-plays.md`.
- [ ] Use the account's choice when a round is drawn (`puzzel-round.ts`), and remove what is left of the round-level choice (`overrides`, `PlayOverrides`, `Plays.effective`) if it is not needed.
- [ ] Remember the choice on the device too (`readPreference`/`writePreference`, rule 12 in `CLAUDE.md`), so it is there before the account is read.

## Style sheets

The app will get style sheets (a way to choose how it looks: colours, fonts, shapes), set per account (see "Future account settings"). Everything that is a format is already a class or a token in `styles.scss`, so a style sheet only has to set the tokens and the classes; the formats named here are part of it.

What is ready for it:

- **The choices** (`.choice-group`, `.choice-block`, `.choice-count`, the colours `--app-choice-1` … `--app-choice-6`): the row of small buttons of the filter of pictures (what it is, category, language, size, difficulty, motive difficulty, made by) and of the forms (the categories, the motive difficulty, who sees it). Each choice has the next colour of six in its row: a soft tint when it is not chosen, the full colour when it is. One format for every page that has choices.
- **The menu** (`.menu-font` for the app's menu, `.menu-style` for the bars of the admin and of signing in): the text size of what is written in them.
- **The layers** (`--app-z-*`, rule 13), **the sizes of the text** (`--app-fs-*`) and **the colours** (`--app-primary` and the others in `:root`).

To do:

- [ ] Decide what a style sheet is (a name and a set of tokens and class settings, stored per account) and where it is chosen (the account settings).
- [ ] Move the colours and shapes that are still written in `styles.scss` outside `:root` (a few gradients, the shadows, the outlines of the Cheat lines) into tokens, so a style sheet can set them.
- [ ] Give a style sheet a preview in the account settings, and a plain default that is what the app looks like now.
- [ ] Check every page with each style sheet in a light and a dark look (`prefers-color-scheme`).

## The home page: tiles

Built: the home page is a list of **tiles** (`FeedItem`, `PictureItem`, `KeptItem` with `InfoItem`, `OfferItem` and `PackageItem` in `functions/src/models/shared/feed-item.ts`; `HomeFeed.merge`). **Information, offers and packages have their own collections (`jigsaw-info`, `jigsaw-offers`, `jigsaw-packages`), routes and pages** (`/play/mine/info`, `/play/mine/offers`, `/play/mine/packages`: a publisher or an admin adds, changes and deletes their own, an admin any; a search, a status filter, a date it is shown from and a date it expires). **The words are in every language: the author writes the master language and the AI makes the other eight when the tile is saved.** **Every tile is public, private or hidden; a private one is shown to its owner only with a banner, and a new one is private to begin with.** **A package has a price or is free and holds ordinary pictures** (the collection `jigsaw`, linked by `packageId`, not in the general list), uploaded many at once on the detail page of the package; its tile shows a random picture of the collection and opens the page of the package (`/play/package/:id`). `GET /jigsaw-feed` reads the collections and gives the active tiles to the app's list.

To do:

- [ ] **Payment for a package**: a priced package can be bought, but nothing is charged (`paid: false` is kept with the price in `bought-packages`); decide how it is paid and build it.
- [ ] The **picture files** of a package are readable by anybody who has their address (the tile and the package page show them as a preview): the search, opening and playing are kept for those who have the package, the image itself is not. Give them a key, or a smaller preview, if that matters.
- [ ] A way to take a package out of one's pictures again, and what happens to it when its owner deletes its pictures.
- [ ] A package has categories and the home page shows it only when it matches the person's search (`FeedItem.matchesFilter`), but **the filter offers only the categories some picture has** (the counts come from `/jigsaw-search/facets`), so a category only a package is in cannot be ticked: count the packages there too if that matters.
- [ ] A package as a choice in the filter (only the pictures of the chosen packages, `JigsawFilters`), and how many pictures a package shows in the list of packages (`pictureCount`).
- [ ] Say who a tile is for (language, level, signed in or not) and use it in `GET /jigsaw-feed` (the `Viewer`), and a limit on how many offers are shown.
- [ ] Let an author correct a translation by hand in the form (the entry then counts as `by: 'author'` and is not overwritten).
- [ ] Tiles made in the frontend (`source: 'local'`, for example "add your first picture") added to `FeedService.others`.
- [ ] Let a person close an information or an offer (kept on the device, then with the user).
- [ ] `firestore.rules` for the emulator and `npm run sync:firestore` for the live project: the collections `jigsaw-info`, `jigsaw-offers` and `jigsaw-packages` are only read and written by the function (the admin SDK), so no rule is needed unless a client reads them; the picture query by `packageId` is one equality on one field (no composite index). Check before the first deploy.
- [ ] Texts of the pages (`play.feed.*`) are translated by the assistant and not read by native speakers.

## Limits for an account that is not verified

Built (the rule is in `docs/guide/users-and-logon.md`). What is left:

- [ ] An upload that names no account at all (no owner and no `X-Jigsaw-User`) is not counted: the pages never do that, but the API still takes it.

## Levels (user, publisher, admin)

Built: the level on the account, who may make a jigsaw public, what an admin may do with jigsaws and rounds, the admin page `/jigsaw` and `PUT /jigsaw-levels/:id` (see `docs/guide/users-and-logon.md`).

To do:

- [ ] While there is no admin, any account that exists can make itself (or another account that has a verified login) the first admin: decide if that is safe enough, or if the first admin should be started another way (a one-time key, or an environment setting).
- [ ] Say in the guide (`jigsaw-guide.md`, nine languages) what a publisher and an admin may do.
- [ ] Restrict the AI use route (`/jigsaw-users/:id/token-usage`) to the account itself and to admins: only the page (`/jigsaw/ai-use`) is kept from others now.
- [ ] **A second mark for an admin, on the user (the login) itself** (decided: later, not now; decided where: a field owned by the jigsaw in `user-account/<uid>`, e.g. `jigsawAdmin: true`; Seven Friends' own fields are not used and not changed). An admin is then on two places: the **account** (the level here, set on the admin page `/jigsaw`) and the **user itself** (the login's record), and a login is an admin only when **both** say so; one without the other is refused (never let through). **The mark on the user is added by hand, directly in the document, for now** (Seven Friends has no user admin page yet; when it gets one, that page sets it). So the jigsaw only **reads** it and never writes it. Design notes, so it is not worked out twice:
  - `isAdminLogin` (`functions/src/logons/gate.ts`) keeps asking the database fresh at every call (never kept, see `users-and-logon.md`, "Why it cannot leak"): it asks `linkedTo(uid)` for a real admin account, **and** reads `user-account/<uid>`; the mark counts only when it is exactly `true`, and a login with no document, or a database that cannot answer, is refused (503 for the latter). The mark is read only when the first answer is yes.
  - A small read-only store of its own (`AdminMarks.has(uid)`), injected like the other stores so tests give memory. Nothing is written to `user-account` for this, so the rule in `CLAUDE.md` (the jigsaw writes only the sign-in fields of `user-account`) stays as it is, and there is nothing to keep in sync when a level or a login changes.
  - **The first admin changes**: while no admin exists any account may make itself one (`GET /jigsaw-levels/open`), but with the mark required that is not enough: the level is given on the page, and the mark is added by hand, so the open rule and the page text "There is no admin yet" must say so (or the open rule is dropped); until the mark is there the login is refused.
  - Tests (`user-levels.test.ts` and the real Firestore in `test-emulator/`): level without mark is refused; mark without level is refused; both is accepted; a mark that is not exactly `true` (`"true"`, `1`) is refused; a login with no `user-account` document is refused and none is made; a mark taken away by hand is refused at the next call (nothing is kept).


## Scores

Playing a round will later give a **score**. Now a round has only the pieces matched and, for a timed jigsaw, the time played (`play.ts`: `Plays`, `PlaySpec`). What is left: decide how a score is worked out (the number of pieces, the snap level, the time), keep it with the round, and show it in the lists of rounds. The help says "Scores will come later" in the section about playing (`frontend/public/i18n/<language>/jigsaw-guide.md`): change it when scores are built.

## Translate the texts of the new app (`play`)

Done: `play.json` is made in all nine languages (en, nb, sv, da, fi, de, fr, es, nl; the words are the same as in the older scopes: round, account, sign-in, locked), `npm run check:i18n` says "Translations are in order.", and the dev build is no longer forced to English (`forcedLanguage()` is gone). The translations of the new app were written by the assistant and have not been read by native speakers.

To do:

- [ ] Let native speakers read the eight new `play.json` files (and `jigsawPage.startTitle`, which was changed in all languages).
- [ ] The titles of the pages (the browser tab: `title:` of the routes in `play.routes.ts`) are English; give the app a title strategy that translates them (`titles.*` keys are already left out of `check:i18n`).
- [ ] The texts of the tiles of the home page come from the backend and are English (`TODO.md`, "The home page: tiles").
- [ ] Delete `_old-play/` when nothing more is needed from the first try (it is not built; it imports `jigsaw/jigsaw-fields`, which is gone).

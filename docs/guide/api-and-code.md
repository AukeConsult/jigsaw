# API, code layout and running

## API
One Express app as a Cloud Function (europe-west1, codebase `jigsaw`): `jigsawApi`, served under `/jigsaw/api` (`functions/src/jigsaw/`); what its routes share is in `functions/src/common/`. JSON bodies up to 600 kB (the pieces of a jigsaw with their graphics: up to 30 MB). Errors are `400 {error}` with the model's message.

| route | |
|---|---|
| `GET /jigsaw/api/health` | health check |
| `/jigsaw/api/jigsaw` | the list of jigsaws, newest first: `GET`, `POST`, `PUT /:id`, `DELETE /:id` (collection `jigsaw`) |
| `GET /jigsaw/api/jigsaw-popular` | up to ten jigsaws the person may see, the best first: ranked by the rounds played and by being new (`Popularity`) |
| `PUT/GET/HEAD/DELETE /jigsaw/api/jigsaw-image/:id` | the background picture of a jigsaw: a file in Storage (`jigsaw/<id>/picture`), the raw bytes as the body, at most about 5 MB, jpeg, png or webp |
| `/jigsaw/api/jigsaw-pieces/:id` | the pieces of a jigsaw: `GET` the list, `PUT` all the pieces with their graphics (a cut), `PATCH` where pieces are now, `GET /graphic/:pieceId`, `DELETE`. Each piece is a document under the jigsaw (`jigsaw/<id>/pieces/<piece id>`) and its graphic a file in Storage |
| `/jigsaw/api/jigsaw/:id/plays` | the plays of a jigsaw (one game of one user each; documents under the jigsaw, `jigsaw/<id>/plays/<play id>`, with the positions of the pieces in one document, `state/positions`). `GET ?userId=` the plays, newest first; `POST {userId}` starts one for the user with that UID (the play keeps `userId`, the UID, and `userName`, the user's name when it started: both are put there by the server; pieces scattered); `GET /:playId` the play, its settings and its pieces; `PATCH /:playId/settings {overrides}` (everyone's rounds can be read, but changing or deleting a round needs the header `X-Jigsaw-User` to be the UID of its player, else 403; a user with no verified Firebase login has no sign-in, so this is not a lock for it; see `users-and-logon.md`) the look a play chooses (the line and the colours; the difficulty is the jigsaw's, and anything about size, picture or pieces is refused with 400 too); `PATCH /:playId/positions {moves}` where pieces are now (matched and solved follow from that); `DELETE /:playId`. A jigsaw that has plays can not change its width, height or grid (`PUT /jigsaw/api/jigsaw/:id` gives 409); deleting a jigsaw deletes its plays. The user id is the UID of a user in `/jigsaw/api/jigsaw-users`; a play can only be started for a user that exists. `PATCH /:playId/positions` also takes `storeWidth` |
| `/jigsaw/api/jigsaw` (owner) | A jigsaw has an optional `ownerUid`: the UID of a user, who is its author. `POST` and `PUT` refuse (400) an `ownerUid` that is not a user that exists, and put that user's name in `author` themselves (the request's `author` is overwritten). A jigsaw from before owners has no `ownerUid` and keeps its `author` text |
| `/jigsaw/api/jigsaw-users/:id/plays` | the games of a user (by UID) over all the jigsaws, newest first: `[{play, jigsaw: {id, name}}]` (each jigsaw is asked for the user's games, so no index is needed; at most 100) |
| `/jigsaw/api/jigsaw-users` | the users of the jigsaws (no sign-in, no password). Each user is a document in the collection `jigsaw-users` with a UID made by the database (the `id`; plays are kept by it), the `username` the person chose (3-30 of a-z, 0-9, _ and -, in small letters, unique: it is only for looking a user up) and a `name`. `POST {username, name, email?}` makes a user and returns it with its `id` (the optional `email` is kept in small letters for a later connection to a registered user; it is private: returned only by this call, never by a lookup or a rename) (409 when the user name is taken; checked and made in one transaction); `GET /by-username/:username` finds one by the user name (404 when none); `GET /:id` reads one by its UID; `PUT /:id {name?, username?, email?}` changes only what is sent (an empty `email` takes it away; 409 when the new `username` is another user's; the UID and the plays stay). `GET /` lists the users by name (id, user name and name; never the e-mail addresses), to choose who plays from. A user an earlier version made (the user name was its id) is still read, with its id as its user name |

Firestore collections: `jigsaw` (limit 100, with the subcollection `pieces` under each document). Files (the picture of a jigsaw and the graphics of its pieces) are in Storage under `jigsaw/<id>/`, written by the backend only; the page never sends a file to Storage itself. Routes only call `error()`, `stored()` and the store (`functions/src/common/document-store.ts`).

## Code layout
- `functions/src/`: `index.ts` (the function `jigsawApi`), `jigsaw/` (`app.ts` and the routes: jigsaws, pieces, pictures, users, plays), `common/` (`jigsaw-list.ts`, `document-store.ts`, `cors.ts`), `models/` (the shared model).
- `functions/test/`: Vitest tests of every rule on the classes. `functions/test-emulator/`: the real stores on a Firestore emulator.
- `frontend/src/app/`: `jigsaw/` (the pages, `puzzle-piece/`, `picture-cropper/`, `fit-picture.ts`, `piece-graphics.ts`, `piece-sync.ts` and the API services), `board/` (the board the pieces are played on: `jigsaw-board/`), `guide/`, `core/` (`autosave.ts`, `api-collection.ts`, the Transloco files).
- Autosave: saves 800 ms after the last change, creates then updates, retries after 5 s, flushes when the page closes.

## Running
```
npm run install:all
npm run dev            # functions watch + emulators + frontend, http://localhost:4210
npm test               # backend tests
npm run test:emulator  # real Firestore emulator tests
npm run build
```
Emulator ports: UI 4010, Functions 5011, Firestore 8090, Auth 9109, Storage 9209, Hosting 5010. If the emulator runs old code after a model change, run `npm --prefix functions run build`.

## Deploying
Shared Firebase project `sevenfriends`: deploy only `hosting:jigsaw` and `functions:jigsaw` (`npm run deploy`; `npm run deploy:jigsaw` for the jigsaw site alone). Never deploy rules or indexes from here; change the live ones in the Seven Friends repo.

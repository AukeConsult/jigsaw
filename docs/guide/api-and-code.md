# API, code layout and running

## API
Two services, each an Express app and its own Cloud Function (europe-west1, codebase `canvas`): `jigsawApi` served under `/jigsaw/api` (`functions/src/jigsaw/`) and `canvasApi` served under `/canvas/api` (`functions/src/canvas/`); what both use is in `functions/src/common/`. JSON bodies up to 600 kB (the pieces of a jigsaw with their graphics: up to 30 MB). Errors are `400 {error}` with the model's message.

| route | |
|---|---|
| `GET /canvas/api/health` and `GET /jigsaw/api/health` | health check of each service |
| `GET /canvas/api/canvas-list` | saved canvases, newest first |
| `POST /canvas/api/canvas-list` | make one (`name, width, height, gridSize, gridVisible, placed`), 201 |
| `PUT /canvas/api/canvas-list/:id` | replace it (404 if missing) |
| `DELETE /canvas/api/canvas-list/:id` | delete (204, 404 if missing) |
| `/jigsaw/api/jigsaw` | the same four routes for jigsaw canvases (collection `jigsaw`) |
| `PUT/GET/HEAD/DELETE /jigsaw/api/jigsaw-image/:id` | the background picture of a jigsaw canvas: a file in Storage (`jigsaw/<id>/picture`), the raw bytes as the body, at most about 5 MB, jpeg, png or webp |
| `/jigsaw/api/jigsaw-pieces/:id` | the pieces of a jigsaw: `GET` the list, `PUT` all the pieces with their graphics (a cut), `PATCH` where pieces are now, `GET /graphic/:pieceId`, `DELETE`. Each piece is a document under the jigsaw (`jigsaw/<id>/pieces/<piece id>`) and its graphic a file in Storage |
| `/jigsaw/api/jigsaw/:id/plays` | the plays of a jigsaw (one game of one user each; documents under the jigsaw, `jigsaw/<id>/plays/<play id>`, with the positions of the pieces in one document, `state/positions`). `GET ?userId=` the plays, newest first; `POST {userId}` starts one for the user with that UID (the play keeps `userId`, the UID, and `userName`, the user's name when it started: both are put there by the server; pieces scattered); `GET /:playId` the play, its settings and its pieces; `PATCH /:playId/settings {overrides}` (everyone's rounds can be read, but changing or deleting a round needs the header `X-Jigsaw-User` to be the UID of its player, else 403; there is no sign-in yet, so this is not a lock) the look a play chooses (the line and the colours; the difficulty is the jigsaw's, and anything about size, picture or pieces is refused with 400 too); `PATCH /:playId/positions {moves}` where pieces are now (matched and solved follow from that); `DELETE /:playId`. A jigsaw that has plays can not change its width, height or grid (`PUT /jigsaw/api/jigsaw/:id` gives 409); deleting a jigsaw deletes its plays. The user id is the UID of a user in `/jigsaw/api/jigsaw-users`; a play can only be started for a user that exists. `PATCH /:playId/positions` also takes `storeWidth` |
| `/jigsaw/api/jigsaw` (owner) | A jigsaw has an optional `ownerUid`: the UID of a user, who is its author. `POST` and `PUT` refuse (400) an `ownerUid` that is not a user that exists, and put that user's name in `author` themselves (the request's `author` is overwritten). A jigsaw from before owners has no `ownerUid` and keeps its `author` text |
| `/jigsaw/api/jigsaw-users/:id/plays` | the games of a user (by UID) over all the jigsaws, newest first: `[{play, jigsaw: {id, name}}]` (each jigsaw is asked for the user's games, so no index is needed; at most 100) |
| `/jigsaw/api/jigsaw-users` | the users of the jigsaws (no sign-in, no password). Each user is a document in the collection `jigsaw-users` with a UID made by the database (the `id`; plays are kept by it), the `username` the person chose (3-30 of a-z, 0-9, _ and -, in small letters, unique: it is only for looking a user up) and a `name`. `POST {username, name, email?}` makes a user and returns it with its `id` (the optional `email` is kept in small letters for a later connection to a registered user; it is private: returned only by this call, never by a lookup or a rename) (409 when the user name is taken; checked and made in one transaction); `GET /by-username/:username` finds one by the user name (404 when none); `GET /:id` reads one by its UID; `PUT /:id {name?, username?, email?}` changes only what is sent (an empty `email` takes it away; 409 when the new `username` is another user's; the UID and the plays stay). `GET /` lists the users by name (id, user name and name; never the e-mail addresses), to choose who plays from. A user an earlier version made (the user name was its id) is still read, with its id as its user name |
| `/canvas/api/canvas-objects` | the same four routes for canvas objects |

Firestore collections: `canvas-list` (limit 100), `canvas-objects` (limit 200) and `jigsaw` (limit 100, with the subcollection `pieces` under each document). Files (the picture of a jigsaw and the graphics of its pieces) are in Storage under `jigsaw/<id>/`, written by the backend only; the page never sends a file to Storage itself. Routes only call `error()`, `stored()` and the store (`functions/src/document-store.ts`).

## Code layout
- `functions/src/`: `app.ts`, `canvas-list.ts`, `canvas-objects.ts`, `document-store.ts`, `models/` (the shared model).
- `functions/test/`: Vitest tests of every rule on the classes. `functions/test-emulator/`: the real stores on a Firestore emulator.
- `frontend/src/app/`: `canvas/` (the canvas module: its shell and routes, `home/` the canvas page, `canvas-board/`, `canvas-panel/`, `canvas-shape/`, `object-palette/`, `objects/`, `object-panel/`, the canvas API services and `drag.ts`), `jigsaw/` (the jigsaw module: its shell and routes, `puzzle-piece/`, `picture-cropper/`, `fit-picture.ts`, `piece-graphics.ts`, `piece-sync.ts` and the jigsaw API services), `core/` (what both use: `autosave.ts`, `api-collection.ts`, the Transloco files).
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
Shared Firebase project `sevenfriends`: deploy only `hosting:canvas`, `hosting:jigsaw` and `functions:canvas` (`npm run deploy`; `npm run deploy:jigsaw` for the jigsaw site alone). Never deploy rules or indexes from here; change the live ones in the Seven Friends repo.

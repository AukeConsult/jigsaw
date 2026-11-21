# API, code layout and running

## API
Express app, Cloud Function `canvasApi` (europe-west1, codebase `canvas`), served under `/api`. JSON bodies up to 600 kB (the pieces of a jigsaw with their graphics: up to 30 MB). Errors are `400 {error}` with the model's message.

| route | |
|---|---|
| `GET /api/health` | health check |
| `GET /api/canvas-list` | saved canvases, newest first |
| `POST /api/canvas-list` | make one (`name, width, height, gridSize, gridVisible, placed`), 201 |
| `PUT /api/canvas-list/:id` | replace it (404 if missing) |
| `DELETE /api/canvas-list/:id` | delete (204, 404 if missing) |
| `/api/jigsaw` | the same four routes for jigsaw canvases (collection `jigsaw`) |
| `PUT/GET/HEAD/DELETE /api/jigsaw-image/:id` | the background picture of a jigsaw canvas: a file in Storage (`jigsaw/<id>/picture`), the raw bytes as the body, at most about 5 MB, jpeg, png or webp |
| `/api/jigsaw-pieces/:id` | the pieces of a jigsaw: `GET` the list, `PUT` all the pieces with their graphics (a cut), `PATCH` where pieces are now, `GET /graphic/:pieceId`, `DELETE`. Each piece is a document under the jigsaw (`jigsaw/<id>/pieces/<piece id>`) and its graphic a file in Storage |
| `/api/canvas-objects` | the same four routes for canvas objects |

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
Shared Firebase project `sevenfriends`: deploy only `hosting:canvas` and `functions:canvas` (`npm run deploy`). Never deploy rules or indexes from here; change the live ones in the Seven Friends repo.

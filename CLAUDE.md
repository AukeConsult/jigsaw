# Canvas – project guide

Canvas lets a person make a canvas area of a chosen size in pixels (with a grid), make **canvas objects** (figures and arrow connectors) with their own
size, border, colours and font, and put copies of them on a canvas: move them, resize them, fasten arrows to figures, group them. Everything saves by
itself. Built on the same structure as Seven Friends.

## Structure
- `frontend/` – Angular 20 (standalone components, signals, Bootstrap 5 + SCSS, Transloco), hosted on Firebase Hosting site `canvas-auke` (target `canvas`).
- `functions/` – Node 22 + TypeScript Express backend, deployed as the Cloud Function `canvasApi` (served at `/api/**`), codebase `canvas`.
- `functions/src/models/shared/` – **the model, the ONE place to edit shared code.** `scripts/sync-models.mjs` copies it to `frontend/src/app/models/shared/` (generated, gitignored, never edit that copy). Shared files may only import from each other.
- `client-wrappers/android` – Capacitor Android shell, generated with `npm --prefix frontend run cap -- add android` (not generated yet).

### The model (`functions/src/models/shared/`)
| file | what is in it |
|---|---|
| `canvas-object.ts` | a canvas object's settings and the classes `CanvasBaseObject` (parent) → `CanvasFigure` → `CanvasArrow` |
| `geometry.ts` | `Point`, `Box`, resize handles and `resizedBox`, and `SmoothCurve` (the curve of a bent arrow; used by the model and by the drawing). No knowledge of objects |
| `placed.ts` | an object placed on a canvas: `PlacedBase` → `PlacedFigure`, `PlacedArrow` |
| `diagram.ts` | `CanvasDiagram`: what the placed objects do together (snap, follow, resize as a group, layers) |
| `canvas.ts` | a saved canvas (`CanvasSpec`) and `CanvasArea`, which checks one |

### The frontend (`frontend/src/app/`)
- `home/` – the canvas page: holds the open canvas, autosaves, opens/starts/deletes saved canvases. Three parts: `canvas-panel/` (settings + saved list), `canvas-board/` (the canvas, its objects and all pointer tools), `object-palette/` (objects to drag in).
- `objects/` – the Objects page, with `object-panel/` (the form) and `canvas-shape/` (draws an object as SVG).
- `core/` – `autosave.ts` (saves a change a pause after it), `api-collection.ts` + the two API services, `drag.ts`.
- Backend: `canvas-list.ts` / `canvas-objects.ts` (the routes: they only check, call `stored()` and the store), `document-store.ts` (the Firestore code both use: list, add, replace, delete).

## Rules for the code
1. **Classes work on their own object.** A rule belongs on the class that owns the data, at the right level of the parent/child hierarchy: what every object has is on `CanvasBaseObject`, what a figure adds on `CanvasFigure`, what an arrow adds on `CanvasArrow` (an arrow *is a* figure, a figure *is a* base object). Children override small hooks instead of `if (kind === …)` branches. Placed objects know their own geometry; the diagram does what they do together.
2. **Model objects never change.** Moving, resizing or any other change gives a new object (or a new diagram, or the same one when nothing changed). Components keep the plain stored data in a signal and make the classes from it when they need them (`CanvasDiagram.from(...)`).
3. **Components are thin.** A component turns what the person does into calls on the model classes and shows the result. Business rules do not live in components or in the routes.
4. **What is stored is decided by the model.** `X.stored(...)` says which fields are saved (only the known ones); `X.fromStored(...)` reads a document that an older version saved and gives it what it lacked. Routes only call them. Never save a field that is not known.
5. **One validation, used everywhere.** `error()` on the classes (`CanvasBaseObject.of(data).error()`, `CanvasArea(...).error()`) is used by the forms, the page and the API, so they cannot disagree.
6. Keep files small and about one thing; no unused code (check with `tsc --noUnusedLocals`); comments say *why* in plain words.
7. Always use Bootstrap in pages; custom CSS only if absolutely necessary (inline styles only where a value is computed or Bootstrap has no class).
8. Never edit anything in a `lib/` or `dist/` directory (compiled output): edit the `.ts` source and rebuild.
9. Do not guess when debugging: establish the mechanism (exact line/condition) before fixing; if it is not found, ask for evidence.

## Rules for what the app does
- **Canvas:** a name, width and height (whole pixels), a grid (pixels between points, 0 = off, shown or hidden). The canvas itself is layer 0.
- **Objects** (collection `canvas-objects`): a *figure* (square, circle, triangle, histogram) with a default size, border, corner radius, colours and font; or a *connector* (an arrow, one way or both ways, solid or hollow). A square and a circle have equal sides.
- **Placed objects** are independent copies stored inside the canvas document (`placed`), so changing or deleting the original does not change a canvas.
- **Position:** a placed object's *centre* is what sticks to a grid point. Everything stays inside the canvas.
- **Connection points:** a figure has 8 on its border (a triangle 6); an arrow has 2, one at each end (`start`, `end`). An arrow has three more points that shape it (not connection points): a quarter, half and three quarters of the way along. Drag each sideways on its own to curve the arrow, even into an S (`bendStart`, `bend`, `bendEnd`, in pixels from the straight line; all three 3 px or less is straight; a plain `bend` makes the other two follow at three quarters of it); drag back to the line to straighten. An arrow end within 24 px of a figure point snaps to it exactly and is fastened (and the other way: a figure near a free arrow end). Fastened points are drawn as a point in a point.
- **Arrows follow:** a fastened arrow follows its figure when it moves or is resized; the other end stays. Removing a figure frees its arrows. Grabbing an arrow near an end moves that end alone; the two handles on its sides change its width across.
- **Layers:** the canvas is layer 0; objects are on layers 1–1000, the first on 10; a new object goes on the last (highest) layer in use; a higher layer is in front.
- **Resizing:** one figure by its 8 handles (opposite edge stays, edge on the grid, square/circle stay equal-sided, at least 4 px). A group (drag a rectangle on the empty canvas): positions scale by the group box on each axis, every figure keeps its shape and scales by the factor that changed more; an arrow is stretched by its ends and its thickness scales the same way.
- **Delete** (or Backspace, when not typing in a field) removes the picked objects.
- **Saving:** every change saves by itself a pause later (autosave); nothing is saved while the settings are not allowed. A saved change **replaces the whole document** (only the creation time is kept), so nothing removed or stale is left in the database.

## Shared Firebase project (IMPORTANT)
The Firebase project `sevenfriends` is shared with Seven Friends. Therefore:
- Deploy only `hosting:canvas` and `functions:canvas` (the npm `deploy*` scripts do). Never `firebase deploy` everything, and never deploy `firestore`/`storage` rules or indexes from here: that would overwrite Seven Friends' live ones. `firestore.rules` and `storage.rules` here are for the emulator only. Change live rules/indexes from the Seven Friends repo.
- The functions codebase is `canvas`, not `default`, so a deploy here never deletes Seven Friends' functions.
- Collections and Storage paths start with `canvas` so they cannot collide with Seven Friends' data.
- Do not run any `firebase` command that changes the shared project, and do not deploy, commit or push, unless asked.

## Running and testing
- `npm run install:all`, then `npm run dev` (functions watch + emulators + frontend). The frontend is on **http://localhost:4210**; emulator ports are offset from Seven Friends (UI 4010, Functions 5011, Firestore 8090, Auth 9109, Storage 9209, Hosting 5010) so both can run together.
- `npm test` runs the backend tests (Vitest). `npm run test:emulator` starts a Firestore emulator (test ports, not the dev ones) and runs the real stores against it (`functions/test-emulator/`). The model has the real tests: every rule above is tested on the classes (`functions/test/`), the Firestore code with a small fake collection. A rule is not done until it has a test.
- `npm run build` builds both. The frontend build also copies the model (`sync:models`).
- The frontend has no unit tests: check pages in the browser (the dev server must be the current one; restart it if the page shows old code).

Longer documentation is in `docs/guide/` (user guide, model, API and running).

# Canvas – project guide

(Fill in what Canvas is.) Built on the same structure as Seven Friends.

## Structure
- `frontend/` – Angular 20 (standalone components, signals, Bootstrap 5 + SCSS, Transloco), hosted on Firebase Hosting site `canvas`.
- `functions/` – Node 22 + TypeScript Express backend, deployed as the Cloud Function `canvasApi` (served at `/api/**`), codebase `canvas`.
- `functions/src/models/shared/` – the ONE place to edit shared types; `scripts/sync-models.mjs` copies them to `frontend/src/app/models/shared/` (generated, gitignored, never edit).
- `client-wrappers/android` – Capacitor Android shell, generated with `npm --prefix frontend run cap -- add android` (not yet generated).

## Shared Firebase project (IMPORTANT)
The Firebase project `sevenfriends` is shared with Seven Friends. Therefore:
- Deploy only `hosting:canvas` and `functions:canvas` (the npm `deploy*` scripts do). Never `firebase deploy` everything, and never deploy `firestore`/`storage` rules or indexes from here: that would overwrite Seven Friends' live ones. `firestore.rules` and `storage.rules` here are for the emulator only. Change live rules/indexes from the Seven Friends repo.
- The functions codebase is `canvas`, not `default`, so a deploy here never deletes Seven Friends' functions.
- Prefix Firestore collections and Storage paths with `canvas` so they cannot collide with Seven Friends' data.
- Emulator ports are offset from Seven Friends so both can run together.

## Rules
- Always use Bootstrap in pages; custom CSS only if absolutely necessary.
- Never edit anything in a `lib/` or `dist/` directory (compiled output): edit the `.ts` source and rebuild.
- Do not guess when debugging: establish the mechanism (exact line/condition) before fixing; if not found, ask for evidence.

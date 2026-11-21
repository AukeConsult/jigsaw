# Karins jigsaw

Make a jigsaw puzzle from any picture and put it together on the screen, alone or with others. Texts and the user guide are in English, Norwegian, Swedish, Danish, Finnish, German, French, Spanish and Dutch.

The project has two services in one repository, with the same layout as Seven Friends: an Angular web app (`frontend/`), an Express backend as Firebase Cloud Functions (`functions/`), and an Android shell (Capacitor, `client-wrappers/android`).

| | Karins jigsaw | Canvas |
|---|---|---|
| What | the jigsaws, their rounds, users, timing | a canvas designer (objects, shapes, diagrams) |
| Pages | `/jigsaw` | `/canvas` |
| API | Cloud Function `jigsawApi`, served at `/jigsaw/api` (`functions/src/jigsaw`) | Cloud Function `canvasApi`, served at `/canvas/api` (`functions/src/canvas`) |
| Hosting site | `karins-jigsaw` (target `jigsaw`) | `canvas-auke` (target `canvas`) |

It shares the Firebase project `sevenfriends`; both functions are in the codebase `canvas`, and what they share is in `functions/src/common`.

```
npm run install:all
npm run dev               # everything: functions watch + emulators + frontend (Ctrl+C stops all)
npm run dev:emulators     # backend: Auth, Functions, Firestore, Storage (ports offset from Seven Friends)
npm run dev:frontend      # http://localhost:4210
npm test
npm run check:i18n        # the translations are complete
```

## Documentation
See [docs/guide](docs/guide/README.md): [Karins jigsaw](frontend/public/i18n/en/jigsaw-guide.md) (one file for each language in `frontend/public/i18n/<language>/jigsaw-guide.md`), [using Canvas](docs/guide/user-guide.md), [the model](docs/guide/model.md), [API, code and running](docs/guide/api-and-code.md). Rules for working on the code are in [CLAUDE.md](CLAUDE.md).

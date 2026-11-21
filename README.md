# Canvas

Same layout as Seven Friends: an Angular web app (`frontend/`), an Express API as a Firebase Cloud Function (`functions/`), and an Android shell (Capacitor, `client-wrappers/android`).

Shares the Firebase project `sevenfriends` but has its own Hosting sites (`canvas-auke`, target `canvas`, and `karins-jigsaw`, target `jigsaw`) and its own function (`canvasApi`, codebase `canvas`).

```
npm run install:all
npm run dev               # everything: functions watch + emulators + frontend (Ctrl+C stops all)
npm run dev:emulators     # backend: Auth, Functions, Firestore, Storage (ports offset from Seven Friends)
npm run dev:frontend      # http://localhost:4210
npm test
```

## Documentation
See [docs/guide](docs/guide/README.md): [Karins jigsaw](docs/guide/jigsaw-guide.md), [using Canvas](docs/guide/user-guide.md), [the model](docs/guide/model.md), [API, code and running](docs/guide/api-and-code.md). Rules for working on the code are in [CLAUDE.md](CLAUDE.md).

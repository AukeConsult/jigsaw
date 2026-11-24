# Karins jigsaw

Make a jigsaw puzzle from any picture and put it together on the screen, alone or with others: users, rounds, timing. Texts and the user guide are in English, Norwegian, Swedish, Danish, Finnish, German, French, Spanish and Dutch.

The project has the same layout as Seven Friends: an Angular web app (`frontend/`), an Express backend as a Firebase Cloud Function (`functions/`), and the native apps that wrap the site (`client-wrappers/`: Android and iPhone with Capacitor, Windows with WebView2; app id `io.karinsjigsaw.app`, see `client-wrappers/README.md`).

It shares the Firebase project `sevenfriends` but has its own Hosting site (`karins-jigsaw`, target `jigsaw`) and its own function (`jigsawApi`, served at `/jigsaw/api`, codebase `jigsaw`).

```
npm run install:all
npm run dev               # everything: functions watch + emulators + frontend (Ctrl+C stops all)
npm run dev:emulators     # backend: Auth, Functions, Firestore, Storage (ports offset from Seven Friends)
npm run dev:frontend      # http://localhost:4210
npm test
npm run check:i18n        # the translations are complete
```

## Documentation
See [docs/guide](docs/guide/README.md): [the user guide](frontend/public/i18n/en/jigsaw-guide.md) (one file for each language in `frontend/public/i18n/<language>/jigsaw-guide.md`), [the model](docs/guide/model.md), [API, code and running](docs/guide/api-and-code.md). Rules for working on the code are in [CLAUDE.md](CLAUDE.md).

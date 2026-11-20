# Canvas

Same layout as Seven Friends: an Angular web app (`frontend/`), an Express API as a Firebase Cloud Function (`functions/`), and an Android shell (Capacitor, `client-wrappers/android`).

Shares the Firebase project `sevenfriends` but has its own Hosting site (`canvas`, target `canvas`) and its own function (`canvasApi`, codebase `canvas`).

```
npm run install:all
npm run dev:emulators     # backend: Auth, Functions, Firestore, Storage (ports offset from Seven Friends)
npm run dev:frontend      # http://localhost:4200
npm test
```

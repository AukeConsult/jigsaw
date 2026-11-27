# client-wrappers

The native apps that wrap the live web app (`frontend/`). The web app stays the one code base; these folders only hold the shell of each platform. They were copied from Seven Friends (`client-wrappers/` there) and renamed: app id / bundle id `io.karinsjigsaw.app`, name "Karins jigsaw", address `https://karins-jigsaw.web.app` (`server.url` in `frontend/capacitor.config.json`).

| Folder | What | More |
|---|---|---|
| `android/` | Capacitor wrapper (Gradle, Java) | `android/README.md` |
| `ios/` | Capacitor wrapper (Xcode, Swift Package Manager) | `ios/README.md` |
| `windows/` | .NET 8 WPF app with a WebView2 window, plus an Inno Setup installer and an MSIX package | `windows/README.md` |

Run everything from the project root with the npm scripts (`android:sync`, `android:open`, `android:config`, `ios:sync`, `ios:open`, `ios:config`, `windows:run`, `windows:release`, `windows:msix`). The scripts are in `scripts/`. Capacitor finds the two folders through `frontend/capacitor.config.json` (`android.path`, `ios.path`).

## Always the play module
Every wrapper opens `https://karins-jigsaw.web.app/play` (the app, `frontend/src/play/`, where everything a player does is; `/jigsaw` is only the admin): `server.url` in `frontend/capacitor.config.json` (Android and iOS; `android:sync` and `ios:sync` copy it into the apps) and `AppUrl` in `windows/MainWindow.xaml.cs`. Change them together.

## What was changed from the Seven Friends copy
- **The pictures** are made from `frontend/public/logo.svg` by `npm run icons` (`scripts/make-icons.mjs`; run `npm i --no-save sharp` first): launcher icons, splash screens, `windows/app.ico`, `windows/msix/Assets/` and the web icons. Change the logo or the constants in the script and run it again.
- **No alarms, no sounds, no push**: the poke alarm, the notification sound channels, the sound files and push notifications (Firebase Messaging, APNs, `@capacitor/push-notifications`) are removed on purpose (Android, iPhone, Windows); do not bring them back until push is wanted. The apps ask for no permission at all except the internet (no camera, microphone, location or notifications; a picture is chosen from the gallery or the files). The Windows app has no tray icon, no toasts and no start with Windows: closing the window ends it.
- **Firebase**: the app is not yet in the Firebase project (`io.karinsjigsaw.app` is new there, so `google-services.json` and `GoogleService-Info.plist` do not exist: `npm run android:config` / `ios:config` make them). Android Firebase sign-in is the plugin `@capacitor-firebase/authentication`, as in Seven Friends.
- Not built or tried on a phone yet.

# Karins jigsaw for iPhone

A thin iPhone app (Capacitor, Swift Package Manager) that loads the web app from `server.url` in `frontend/capacitor.config.json`
(https://karins-jigsaw.web.app). Same idea as `client-wrappers/android/`: deploy the web app and the iPhone app shows the new version.

- Bundle id: `io.karinsjigsaw.app` · plugin: `@capacitor-firebase/authentication` (Google sign-in)
- `npm run ios:sync` builds the frontend and copies config and plugins here; `npm run ios:open` opens Xcode (macOS only).
- `GoogleService-Info.plist`: put the service account key in `.env` and run `npm run ios:config` (it finds or creates the iOS app in
  Firebase and writes `client-wrappers/ios/App/App/GoogleService-Info.plist`, which is in `.gitignore`). Add the file to the App target in Xcode.

Needs a Mac with Xcode and an Apple Developer account (99 USD a year) to build, run on a phone and publish. Not tried on a Mac yet
(written on Windows). What is built:
- Google sign-in: `@capacitor-firebase/authentication` (run `npm run ios:sync` to add it to `Package.swift`) and the reversed client id
  as a URL scheme in `Info.plist`.

Still to do by hand:
- `GoogleService-Info.plist` must be in `client-wrappers/ios/App/App/` and in the App target (a copy now sits in `client-wrappers/ios/App/`: move it).
- The Team in Xcode (Signing & Capabilities).


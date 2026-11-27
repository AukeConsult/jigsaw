# Karins jigsaw for Windows

A native Windows app (.NET 8, WPF) with the Microsoft Edge WebView2 control that shows the live web app, the same idea as
`client-wrappers/android/` and `client-wrappers/ios/`. The web app stays the one code base: deploy it and this app shows the new version, nothing to rebuild or reinstall.

- App id `io.karinsjigsaw.app` · the address shown is `AppUrl` in `MainWindow.xaml.cs`, always the play module (`/play`) (the same as `server.url` in
  `frontend/capacitor.config.json`; change both when https://karins-jigsaw.web.app works).
- **Needs:** the .NET SDK 8 or newer on the computer that builds it. The people who install the app need nothing extra
  except the WebView2 Runtime, which is part of Windows 11 and of Microsoft Edge (the app says so if it is missing).
- `client-wrappers/windows/nuget.config` makes the restore use nuget.org only (a missing offline source from Visual Studio, `NU1301`, no longer stops it).
- **Try it:** `npm run windows:run` (builds and opens a window with the app).
- **Build, pack and publish, in one command:** `npm run windows:release` (`scripts/windows-release.mjs`): it builds the self-contained `client-wrappers/windows/publish/KarinsJigsaw.exe`, packs the installer with Inno Setup 6 (https://jrsoftware.org/isdl.php; found in its usual folders) and copies it to `frontend/public/installs/KarinsJigsawSetup.exe`. The last step runs `npm run deploy:hosting`, so the new installer is on the website (the installer is not committed: the release has to run on this computer). `npm run windows:release -- --no-deploy` stops before the deploy.
- The installer (`client-wrappers/windows/installer/output/KarinsJigsawSetup.exe`) installs for the current person only (no administrator needed), with a Start menu entry and an optional desktop icon, and has an uninstaller in Windows Settings → Apps. To publish a new version, change the version in `KarinsJigsaw.csproj` and in `installer/KarinsJigsaw.iss`, then run `npm run windows:release`.
- Only the app's own pages and the sign-in popup open inside the window; every other link opens in the browser. The one permission it may ask for is the camera, for Take a photo on Add picture, only for the app's own pages and after the person says yes; the microphone, location and notifications are refused. The sign-in is kept in `%LOCALAPPDATA%\KarinsJigsaw`.
- The window opens at 1280 x 800 and cannot be made smaller than 1000 x 600 (`MainWindow.xaml`); on a screen with less room (a laptop with scaling) it starts as big as the screen allows and its smallest size gives way. It can be maximised to the whole screen.
- The icon is `app.ico` (made from `frontend/public/icons/icon-512.png`).

**MSIX package:** `npm run windows:release` also makes `client-wrappers/windows/msix/output/KarinsJigsaw.msix` (after the installer; it is not put on the website, and a problem there only prints a warning; leave it out with `-- --no-msix`). `npm run windows:msix` makes only the package (`-- --unsigned`: no signing, only for checks; `-- --skip-publish`: use the files already in `publish/`). Needs the Windows 10/11 SDK (`makeappx.exe`, `signtool.exe`). The manifest is `msix/AppxManifest.xml` (logos in `msix/Assets/`, made from `icon-512.png`); the version comes from `KarinsJigsaw.csproj`. **Signing:** Windows installs only a signed MSIX. With `SF_MSIX_PFX`, `SF_MSIX_PFX_PASSWORD` and `SF_MSIX_PUBLISHER` (the certificate's Subject) in `.env` that certificate signs it; without them a self-signed TEST certificate "Karins jigsaw MSIX test" is made in your Current User store (public part: `msix/output/KarinsJigsaw-test.cer`, which a computer must trust under Local Machine > Trusted People before it installs the package). For the Microsoft Store the Store signs the package. Known differences of the packaged app: Windows redirects its writes to `%LOCALAPPDATA%` into a folder of the package, so it starts with its own empty sign-in (not the one of the installer version); the "Start with Windows" switch writes the registry Run key, which does not start a packaged app (a manifest start-up task is needed, not done yet).

Not done yet:
- **Google sign-in** in an embedded window may be refused by Google. Email and phone sign-in do not depend on it.
- **Signing** the installer with a code-signing certificate (without it Windows SmartScreen warns on the first start) and **automatic updates**.
- The app compiles; it has not been run or installed on a computer yet.

## Offering it for download on the website
`npm run windows:release` copies `client-wrappers/windows/installer/output/KarinsJigsawSetup.exe` to `frontend/public/installs/KarinsJigsawSetup.exe` (not committed); `windows:release` then runs `npm run deploy:hosting` (skip it with `-- --no-deploy`), which
publishes it at `https://karins-jigsaw.web.app/installs/KarinsJigsawSetup.exe` (no page links to it yet). A new version is a new
build, `windows:release` and a deploy: people download the installer again (no automatic updates yet).

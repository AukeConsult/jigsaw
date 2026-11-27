/** The kind of device the web app is open on, as far as installing it goes. */
export type Platform = 'android' | 'ios' | 'windows' | 'other';

/** Which device a browser is on, from its user agent (`touchPoints`: an iPad in desktop mode says it is a Mac, but it has a touch screen). */
export function platformOf(userAgent: string, touchPoints = 0): Platform {
  if (/android/i.test(userAgent)) return 'android';
  if (/iphone|ipad|ipod/i.test(userAgent) || (/macintosh/i.test(userAgent) && touchPoints > 1)) return 'ios';
  if (/windows/i.test(userAgent)) return 'windows';
  return 'other';
}

interface AppHost {
  Capacitor?: { isNativePlatform?: () => boolean };
  chrome?: { webview?: unknown };
}

/**
 * How a photo is taken on this device: `field`, a file field with `capture`, which opens the camera app of a phone or tablet (also in the Android and iPhone apps); `live`, the camera shown in a window of the
 * page (`app-camera-capture`: a computer, also in the Windows app, where such a field only opens the files); nothing when the browser can show no camera.
 */
export function cameraWay(win: Window = window): 'field' | 'live' | null {
  const platform = platformOf(win.navigator.userAgent, win.navigator.maxTouchPoints);
  if (platform === 'android' || platform === 'ios') return 'field';
  return typeof win.navigator.mediaDevices?.getUserMedia === 'function' ? 'live' : null;
}

/** The web app runs inside one of the native apps (the Android or iPhone app, any Android web view, the Windows app): a web view of theirs, which does not do all that a browser does. */
export function isInWrapper(win: Window = window): boolean {
  const host = win as unknown as AppHost;
  return !!host.Capacitor?.isNativePlatform?.() || !!host.chrome?.webview || /; wv\)/.test(win.navigator.userAgent);
}

/**
 * The web app is already running as an app: the Android app (Capacitor, or any Android web view), the Windows app (WebView2), or a web app put on the home screen or
 * installed from the browser (standalone). Then there is nothing to install, so the install page and its hint have nothing to offer.
 */
export function isInApp(win: Window = window): boolean {
  const standalone = (win.navigator as Navigator & { standalone?: boolean }).standalone === true || !!win.matchMedia?.('(display-mode: standalone)').matches;
  return isInWrapper(win) || standalone;
}

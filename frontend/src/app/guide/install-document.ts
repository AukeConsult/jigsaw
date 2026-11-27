import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isInApp, Platform, platformOf } from '../core/platform';
import { ShareButton } from '../jigsaw/share-button/share-button';

/** The apps that can be downloaded from the site, in `public/installs` (made by `gradlew publishApk` and `npm run windows:release`). */
const DOWNLOADS = { android: 'installs/KarinsJigsaw.apk', windows: 'installs/KarinsJigsawSetup.exe' } as const;
type Download = keyof typeof DOWNLOADS;

/**
 * **How to get Karins jigsaw as an app** (the document, with no page round it: the app's info page frames it, at `/play/info/install`; `/install` leads there): the Android app and the Windows app to download, how to put the site on the
 * home screen of an iPhone or iPad, and how to install it from Chrome or Edge. The device of the visitor comes first. It has a Share button, so it can be sent to somebody who wants the app. A download is offered only when its file is on
 * the site.
 */
@Component({
  selector: 'app-install-document',
  imports: [TranslocoDirective, NgTemplateOutlet, ShareButton],
  providers: [provideTranslocoScope('install')],
  template: `
    <ng-container *transloco="let t">
      <article class="guide mx-auto" [attr.aria-label]="t('install.title') || 'Get the app'">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <h1 class="mb-0 me-auto">{{ t('install.title') || 'Get the app' }}</h1>
          <app-share-button />
        </div>
        <p>{{ t('install.intro') || 'Karins jigsaw works in any browser. You can also have it as an app on your phone, tablet or computer.' }}</p>
        @if (inApp) {
          <div class="alert alert-success py-2 small" role="status"><i class="bi bi-check-circle me-1" aria-hidden="true"></i>{{ t('install.alreadyInApp') || 'You are already using the app.' }}</div>
        }
        @for (kind of order(); track kind) {
          <section class="mb-4" [attr.aria-labelledby]="'install-' + kind">
            @switch (kind) {
              @case ('android') {
                <h2 id="install-android"><i class="bi bi-android2 me-2" aria-hidden="true"></i>{{ t('install.android.title') || 'Android phone or tablet' }}</h2>
                <ol>
                  <li>{{ t('install.android.step1') || 'Open the downloaded file KarinsJigsaw.apk.' }}</li>
                  <li>{{ t('install.android.step2') || 'If Android asks, allow installing from this source (it asks once).' }}</li>
                  <li>{{ t('install.android.step3') || 'Press Install, then open Karins jigsaw.' }}</li>
                </ol>
                <ng-container *ngTemplateOutlet="download; context: { $implicit: 'android', label: t('install.android.download') || 'Download for Android', notReady: t('install.notReady') || 'This download is not ready yet.' }" />
                <p class="text-body-secondary small mt-2">{{ t('install.android.note') || 'The app is not from Google Play, so Android may warn you. That is expected: choose to install anyway.' }}</p>
              }
              @case ('windows') {
                <h2 id="install-windows"><i class="bi bi-windows me-2" aria-hidden="true"></i>{{ t('install.windows.title') || 'Windows computer' }}</h2>
                <ol>
                  <li>{{ t('install.windows.step1') || 'Run the downloaded file KarinsJigsawSetup.exe.' }}</li>
                  <li>{{ t('install.windows.step2') || 'If Windows says it protected your PC, press More info and then Run anyway.' }}</li>
                  <li>{{ t('install.windows.step3') || 'Open Karins jigsaw from the Start menu.' }}</li>
                </ol>
                <ng-container *ngTemplateOutlet="download; context: { $implicit: 'windows', label: t('install.windows.download') || 'Download for Windows', notReady: t('install.notReady') || 'This download is not ready yet.' }" />
                <p class="text-body-secondary small mt-2">{{ t('install.windows.note') || 'Needs Windows 10 or 11.' }}</p>
              }
              @case ('ios') {
                <h2 id="install-ios"><i class="bi bi-apple me-2" aria-hidden="true"></i>{{ t('install.ios.title') || 'iPhone and iPad' }}</h2>
                <ol>
                  <li>{{ t('install.ios.step1') || 'Open this page in Safari (not inside another app).' }}</li>
                  <li>{{ t('install.ios.step2') || 'Press the Share button (the square with an arrow pointing up).' }} <i class="bi bi-box-arrow-up" aria-hidden="true"></i></li>
                  <li>{{ t('install.ios.step3') || 'Scroll down and choose Add to Home Screen.' }} <i class="bi bi-plus-square" aria-hidden="true"></i></li>
                  <li>{{ t('install.ios.step4') || 'Press Add. The Karins jigsaw icon is now on your home screen.' }}</li>
                </ol>
                <p class="text-body-secondary small">{{ t('install.ios.note') || 'On an iPhone or iPad only Safari can add a website to the home screen.' }}</p>
              }
              @case ('browser') {
                <h2 id="install-browser"><i class="bi bi-browser-chrome me-2" aria-hidden="true"></i>{{ t('install.browser.title') || 'Install from the browser (Chrome and Edge)' }}</h2>
                <ul>
                  <li>{{ t('install.browser.chrome') || 'Chrome: press the install icon at the right end of the address bar, or open the menu (three dots) and choose Install Karins jigsaw (on Android: Install app).' }}</li>
                  <li>{{ t('install.browser.edge') || 'Edge: press the install icon at the right end of the address bar, or open the menu (three dots) and choose Apps, then Install this site as an app.' }}</li>
                </ul>
                <p class="text-body-secondary small">{{ t('install.browser.note') || 'The menus differ a little between versions. Look for Install.' }}</p>
              }
            }
          </section>
        }
        <section class="mb-4">
          <h2>{{ t('install.share.title') || 'Tell others' }}</h2>
          <p>{{ t('install.share.text') || 'Share this page with friends who would like the app.' }}</p>
          <app-share-button />
        </section>
      </article>

      <!-- a download button: only when the file is on the site -->
      <ng-template #download let-kind let-label="label" let-notReady="notReady">
        @if (fileOf(kind); as file) {
          <a class="btn btn-primary" [href]="file.url" download><i class="bi bi-download me-1" aria-hidden="true"></i>{{ label }}@if (file.mb) { <span class="ms-1 opacity-75">({{ file.mb }} MB)</span> }</a>
        } @else {
          <p class="text-body-secondary small mb-0">{{ notReady }}</p>
        }
      </ng-template>
    </ng-container>
  `,
})
export class InstallDocument {
  protected readonly inApp = isInApp();
  private readonly platform: Platform = platformOf(navigator.userAgent, navigator.maxTouchPoints);
  /** the downloads that are on the site, with their size in MB (null: not there) */
  protected readonly files = signal<Record<Download, { url: string; mb: string } | null>>({ android: null, windows: null });
  /** the parts of the page, the one for this device first */
  protected readonly order = computed<string[]>(() => {
    const all = ['android', 'windows', 'ios', 'browser'];
    const first = this.platform === 'other' ? null : this.platform;
    return first ? [first, ...all.filter((p) => p !== first)] : all;
  });

  /** the download of this kind, when it is on the site */
  protected fileOf(kind: string): { url: string; mb: string } | null {
    return this.files()[kind as Download] ?? null;
  }

  constructor() {
    for (const kind of Object.keys(DOWNLOADS) as Download[]) void this.look(kind);
  }

  /** Asks if the file is on the site: a missing file is answered with the page of the app (a page, not a file), so a page is "not there". */
  private async look(kind: Download): Promise<void> {
    const url = new URL(DOWNLOADS[kind], document.baseURI).href;
    try {
      const answer = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!answer.ok || (answer.headers.get('content-type') ?? '').includes('text/html')) return;
      const bytes = Number(answer.headers.get('content-length'));
      this.files.update((all) => ({ ...all, [kind]: { url, mb: bytes > 0 ? (bytes / 1024 / 1024).toFixed(1) : '' } }));
    } catch {
      /* no answer: the download is not offered */
    }
  }
}

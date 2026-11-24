import { Component, effect, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { isInApp, platformOf } from '../../core/platform';
import { isBoolean, readPreference, writePreference } from '../../core/preferences';

/** Whether the person has closed the hint (kept on the device, as the other choices of a page). */
const CLOSED_KEY = 'jigsaw.installHint';

/**
 * A small line on the front page for a person on Android, Windows or an iPhone or iPad who has not got the app: "Get Karins jigsaw as an Android app", with a link to the
 * install page (`/install`). It is not shown inside the app (nothing to install), on other devices, or after the person has closed it.
 */
@Component({
  selector: 'app-install-hint',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('install')],
  template: `
    @if (platform; as kind) {
      @if (!closed()) {
        <div class="alert alert-info py-1 px-2 small d-flex align-items-center gap-2 mb-3" role="note" *transloco="let t">
          <i class="bi bi-download" aria-hidden="true"></i>
          <a class="alert-link" routerLink="/install">{{ t('install.hint.' + kind) || 'Get Karins jigsaw as an app' }}</a>
          <button type="button" class="btn-close ms-auto" [attr.aria-label]="t('install.hint.close') || 'Close'" (click)="closed.set(true)"></button>
        </div>
      }
    }
  `,
})
export class InstallHint {
  /** the device that has an app or a home screen to offer, or null (another device, or the app is already in use) */
  protected readonly platform = this.offer();
  protected readonly closed = signal(readPreference(CLOSED_KEY, false, isBoolean));

  constructor() {
    effect(() => writePreference(CLOSED_KEY, this.closed()));
  }

  private offer(): 'android' | 'windows' | 'ios' | null {
    if (isInApp()) return null;
    const kind = platformOf(navigator.userAgent, navigator.maxTouchPoints);
    return kind === 'other' ? null : kind;
  }
}

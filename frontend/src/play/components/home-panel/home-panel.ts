import { Component, HostListener, OnDestroy, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { PlayLook } from '../../../app/jigsaw/play-look';
import { PlayLookChoice } from '../../../app/jigsaw/play-look-choice/play-look-choice';
import { isWideScreen } from '../../../app/core/theme';
import { ListView } from '../../list-view';
import { PlayHomeChoices } from '../home-choices/home-choices';

/**
 * **The preferences of the home page**, a panel over its upper right corner (the menu entry Preferences there): only how that page looks, the theme and the choices of the page itself (`play-home-choices`), so what is
 * chosen is seen at once, and a button to all the preferences. It begins closed, and is closed again when the page is left (what covers a page is not kept, rule 12 of `CLAUDE.md`).
 */
@Component({
  selector: 'play-home-panel',
  imports: [TranslocoDirective, RouterLink, PlayLookChoice, PlayHomeChoices],
  providers: [provideTranslocoScope('play')],
  template: `
    @if (view.prefs()) {
      <div class="puzzle-panels over-page" *transloco="let t">
        <section class="card shadow" [attr.aria-label]="t('play.homePage') || 'Home page'">
          <div class="card-header d-flex align-items-center gap-2 py-2">
            <h2 class="subsection-title m-0"><i class="bi bi-house me-2" aria-hidden="true"></i>{{ t('play.homePage') || 'Home page' }}</h2>
            <button type="button" class="btn-close ms-auto" [attr.aria-label]="t('play.close') || 'Close'" (click)="view.prefs.set(false)"></button>
          </div>
          <div class="card-body">
            <app-play-look-choice idPrefix="home" [label]="t('play.theme') || 'Theme'" [showPieces]="false" [showSound]="false" [value]="look.value()" (changed)="look.set($event)" />
            <play-home-choices />
            <a class="btn btn-sm btn-outline-primary w-100 mt-3" routerLink="/play/account/preferences"><i class="bi bi-palette me-1" aria-hidden="true"></i>{{ t('play.allPreferences') || 'All preferences' }}</a>
          </div>
        </section>
      </div>
    }
  `,
})
export class PlayHomePanel implements OnDestroy {
  protected readonly view = inject(ListView);
  protected readonly look = inject(PlayLook);

  ngOnDestroy(): void {
    this.view.prefs.set(false);
  }

  /** On a small screen the panel covers much of the page: a click anywhere outside it (and not on the menu, whose switch opens and closes it) closes it. */
  @HostListener('document:click', ['$event'])
  protected closeOutside(event: MouseEvent): void {
    if (!this.view.prefs() || isWideScreen()) return;
    const target = event.target as Element | null;
    if (!target?.isConnected || target.closest('play-helper, .puzzle-panels')) return; // (what was pressed inside the panel may be drawn anew by the press itself)
    this.view.prefs.set(false);
  }
}

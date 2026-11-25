import { Component, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { map, startWith } from 'rxjs';
import { Helper } from '../helper/helper';
import { PlayMenuItem } from '../helper/menus';

/**
 * The frame that lies over the page (and over everything on it), so what is in it is on every page: the helper, which is always there and shows the menu it is given (the name of the app is the first entry of that menu), and **the Info button,
 * a round button fixed in the bottom right corner (the helper's own place is just above it) that leads to the info about the app** (`/play/info`; not shown on the info pages themselves). It takes no clicks itself: only what it holds does (`.play-frame` in `styles.scss`).
 */
@Component({
  selector: 'play-frame',
  imports: [Helper, RouterLink],
  host: { class: 'play-frame' },
  template: `
    <play-helper [menu]="menu()" />
    @if (!onInfo()) {
      <a class="play-info-button btn btn-outline-dark rounded-circle d-flex align-items-center justify-content-center p-0 position-absolute bottom-0 end-0 m-3" routerLink="/play/info" title="Info" aria-label="Info">
        <i class="bi bi-info-lg" aria-hidden="true"></i>
      </a>
    }
  `,
})
export class PlayFrame {
  /** the menu of the helper (nothing: it is not shown) */
  readonly menu = input<readonly PlayMenuItem[] | null>(null);

  private readonly router = inject(Router);
  /** an info page is open: the button that leads there is not needed */
  protected readonly onInfo = toSignal(this.router.events.pipe(map(() => this.router.url.startsWith('/play/info')), startWith(this.router.url.startsWith('/play/info'))), { initialValue: false });
}

import { Component, HostListener, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { ShareLinks } from '../share-link';

/**
 * The Share button of the menu: it shares the page the person is on (a round as the page of its jigsaw, see `ShareLinks`). It opens the share dialog of the device, the one each system has
 * (Android, iPhone and iPad, Mac, Windows), where the browser has it; a browser without it gets a short list: copy the link, Facebook, X, WhatsApp, e-mail. Nothing is sent anywhere until the person chooses.
 */
@Component({
  selector: 'app-share-button',
  imports: [TranslocoDirective],
  providers: [provideTranslocoScope('jigsawShell')],
  templateUrl: './share-button.html',
  host: { class: 'position-relative' },
})
export class ShareButton {
  private readonly router = inject(Router);

  /** `menu`: a link of the menu; `button`: a button of a page (the page of a jigsaw), the same sharing */
  readonly variant = input<'menu' | 'button'>('menu');

  protected readonly open = signal(false);
  protected readonly copied = signal(false);
  /** where the list starts: just under the button, or just over it when the menu is at the bottom of the screen (fixed to the window, so always in view) */
  protected readonly listTop = signal<number | null>(48);
  protected readonly listBottom = signal<number | null>(null);
  protected services: ReturnType<typeof ShareLinks.services> = [];

  private page(): { url: string; title: string } {
    return { url: window.location.origin + ShareLinks.pathOf(this.router.url.split(/[?#]/)[0]), title: document.title || 'Karins jigsaw' };
  }

  protected async press(event: MouseEvent): Promise<void> {
    const { url, title } = this.page();
    // the share dialog of the device is used wherever the browser has one (Android, iPhone and iPad, Mac with Safari, Windows with Edge or Chrome): the apps and the people the person
    // already shares with. Only a browser without it (for example Firefox on a computer) gets the short list below.
    const data = { title, url };
    if (typeof navigator.share === 'function' && (typeof navigator.canShare !== 'function' || navigator.canShare(data))) {
      try {
        await navigator.share(data);
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return; // the person closed the dialog
        // the dialog could not be opened: the list is the way left
      }
    }
    const button = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const below = button.top < window.innerHeight / 2;
    this.listTop.set(below ? Math.round(button.bottom) + 4 : null);
    this.listBottom.set(below ? null : Math.round(window.innerHeight - button.top) + 4);
    this.services = ShareLinks.services(url, title);
    this.copied.set(false);
    this.open.update((now) => !now);
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.page().url);
      this.copied.set(true);
    } catch {
      /* no clipboard: the address is in the address bar */
    }
  }

  /** a click anywhere else closes the list */
  @HostListener('document:click', ['$event'])
  closeList(event: MouseEvent): void {
    if (this.open() && !(event.target as Element | null)?.closest?.('.share-trigger, .share-menu')) this.open.set(false);
  }
}

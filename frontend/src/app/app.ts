import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppUpdate } from './core/app-update';

/**
 * The root of Karins jigsaw: it only holds the page that is open (the app, the admin or signing in: each brings its own frame, see `app.routes.ts`).
 * The browser's own menu (right click, or a long press on a touch screen) is never opened, on any page and any device: only a field to type in keeps it, for copy and paste.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  host: { '(document:contextmenu)': 'noBrowserMenu($event)' },
})
export class App {
  /** starts to look for a newer version of the web app */
  constructor() {
    inject(AppUpdate);
  }

  protected noBrowserMenu(event: Event): void {
    if (!(event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) event.preventDefault();
  }
}

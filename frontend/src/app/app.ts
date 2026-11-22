import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * The app: Karins jigsaw, with its own header menu (see `jigsaw/`); this holds the page that is open.
 * The browser's own menu (right click, or a long press on a touch screen) is never opened, on any page and any device: only a field to type in keeps it, for copy and paste.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
  host: { '(document:contextmenu)': 'noBrowserMenu($event)' },
})
export class App {
  protected noBrowserMenu(event: Event): void {
    if (!(event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable="true"]')) event.preventDefault();
  }
}

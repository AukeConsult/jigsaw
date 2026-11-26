import { Component, input } from '@angular/core';
import { Helper } from '../helper/helper';
import { PlayMenuItem } from '../helper/menus';

/**
 * The frame that lies over the page (and over everything on it), so what is in it is on every page: the helper, which is always there and shows the menu it is given (the name of the app is the first entry of that menu). It takes no
 * clicks itself: only what it holds does (`.play-frame` in `styles.scss`).
 */
@Component({
  selector: 'play-frame',
  imports: [Helper],
  host: { class: 'play-frame' },
  template: '<play-helper [menu]="menu()" />',
})
export class PlayFrame {
  /** the menu of the helper (nothing: it is not shown) */
  readonly menu = input<readonly PlayMenuItem[] | null>(null);
}

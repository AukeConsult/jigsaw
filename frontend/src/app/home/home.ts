import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * **Home**: the logo with the little house on its corner, and **always** the name of the app beside it ("Karins" and under it "jigsaw"). All of it is the way home, `/`. Every place that shows the logo uses this one: the
 * menu of the app (floating and as a bar), the welcome, the admin and the pages of signing in. How big it is comes from the classes the place puts on it (`scaled`: the logo follows the size of the headings; `.brand-lockup` in
 * `styles.scss`).
 */
@Component({
  selector: 'app-home',
  imports: [RouterLink],
  host: { class: 'brand-lockup d-inline-flex' },
  template: `
    <a class="d-flex flex-grow-1 align-items-center gap-2 text-reset text-decoration-none" routerLink="/" draggable="false" [attr.aria-label]="label()">
      <span class="brand-mark"><img class="brand-logo" src="logo.svg" alt="" width="32" height="32"><i class="bi bi-house-fill brand-home" aria-hidden="true"></i></span>
      <span class="brand-text"><span class="brand-name">Karins</span><span class="brand-sub">jigsaw</span></span>
    </a>
  `,
})
export class Home {
  /** what the link is called for who cannot see it */
  readonly label = input('Karins jigsaw');
}

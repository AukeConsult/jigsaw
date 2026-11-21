import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** The app: Karins jigsaw, with its own header menu (see `jigsaw/`); this only holds the page that is open. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}

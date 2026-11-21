import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/** The app: two modules, each with its own header menu (see `jigsaw/` and `canvas/`); this only holds the page of the module that is open. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet />`,
})
export class App {}

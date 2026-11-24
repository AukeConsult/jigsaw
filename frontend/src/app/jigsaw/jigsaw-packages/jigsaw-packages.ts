import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** Select packages (`/jigsaw/packages`): a dummy page for now. The packages are collections of pictures that a person can choose to play from; what they are, and how they are chosen, is not decided yet (see `TODO.md`). */
@Component({
  selector: 'app-jigsaw-packages',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPackages')],
  templateUrl: './jigsaw-packages.html',
})
export class JigsawPackages {}

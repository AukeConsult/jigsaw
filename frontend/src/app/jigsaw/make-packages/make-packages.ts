import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/** Making a package (`/jigsaw/packages/make`, a page of its own, opened from the user page; for a publisher or an admin): a dummy for now. What a package is, who makes it and how a picture gets into it is not decided yet (see `TODO.md`, "Packages"). */
@Component({
  selector: 'app-make-packages',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPackages')],
  templateUrl: './make-packages.html',
})
export class MakePackages {}

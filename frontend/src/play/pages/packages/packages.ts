import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';

/**
 * The page of the route `/play/mine/packages`: **making a package**, for a publisher or an admin (`publisherGuard`). A dummy for now, like the website's `/jigsaw/packages/make`, with the same texts (the scope `jigsawPackages`): what a
 * package is, who makes it and how a picture gets into it is not decided yet (`TODO.md`, "Packages"). The menu of the user has the entry (`mineMenu`), only for a publisher or an admin.
 */
@Component({
  selector: 'play-packages',
  imports: [RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPackages')],
  host: { class: 'd-block' },
  template: `
    <main class="container-fluid page-margin page-max" *transloco="let t">
      <h1 class="page-title mb-2"><i class="bi bi-box-seam me-2" aria-hidden="true"></i>{{ t('jigsawPackages.make.title') || 'Make a package' }}</h1>
      <p class="text-body-secondary">{{ t('jigsawPackages.make.intro') || 'A package is a collection of pictures that others can choose to play from. Here a publisher puts one together.' }}</p>
      <div class="alert alert-info" role="status"><i class="bi bi-hourglass-split me-2" aria-hidden="true"></i>{{ t('jigsawPackages.make.soon') || 'This is not ready yet. Making packages will be here soon.' }}</div>
      <a class="btn btn-outline-primary" routerLink="/play/mine/pictures"><i class="bi bi-arrow-left" aria-hidden="true"></i>{{ t('play.myPictures') || 'My pictures' }}</a>
    </main>
  `,
})
export class PlayPackages {}

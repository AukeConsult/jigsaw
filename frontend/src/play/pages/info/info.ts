import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { GuideDocument } from '../../../app/guide/guide-document';
import { InstallDocument } from '../../../app/guide/install-document';
import { Welcome } from '../../../app/jigsaw/welcome/welcome';

/** The documents of the info, one for each page (the route data `doc`). */
type InfoDoc = 'welcome' | 'help' | 'about' | 'install';

/**
 * The page of the routes `/play/info/welcome`, `help`, `about` and `install`, **the info about the app**: one page component, and which document it frames is in the route data (as the website's `GuidePage` does). The documents are
 * components of the website, which it only frames: the welcome (`app-welcome`), the help and the about page (`app-guide-document`) and how to install the app (`app-install-document`). The pages are in the menu of the helper
 * (`infoMenu`, every page one entry), so there is no strip of tabs on the page; **a Back button stays at the top of the page however far it is scrolled** (and is in the menu too); every page is at most 1200 px wide like the others (`page-max`, and `guide-full` lets the documents use it); the entry Info of the page menu opens the welcome.
 */
@Component({
  selector: 'play-info',
  imports: [Welcome, GuideDocument, InstallDocument, RouterLink, TranslocoDirective],
  providers: [provideTranslocoScope('play')],
  host: { class: 'd-block' },
  template: `
    <main class="container-fluid page-margin page-max guide-full">
      <!-- it takes no clicks beside the button, so it covers nothing of the text it stays over -->
      <div class="sticky-top py-2 pe-none" *transloco="let t">
        <a class="btn btn-primary btn-sm rounded-pill shadow pe-auto" routerLink="/play/info/back" [replaceUrl]="true"><i class="bi bi-arrow-left me-1" aria-hidden="true"></i>{{ t('play.infoBack') || 'Back' }}</a>
      </div>
      @switch (doc) {
        @case ('welcome') {
          <app-welcome />
        }
        @case ('help') {
          <app-guide-document name="jigsaw-guide.md" />
        }
        @case ('about') {
          <app-guide-document name="jigsaw-about.md" />
        }
        @case ('install') {
          <app-install-document />
        }
      }
    </main>
  `,
})
export class PlayInfo {
  protected readonly doc: InfoDoc = inject(ActivatedRoute).snapshot.data['doc'];
}

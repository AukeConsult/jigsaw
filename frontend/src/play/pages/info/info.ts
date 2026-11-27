import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { GuideDocument } from '../../../app/guide/guide-document';
import { InstallDocument } from '../../../app/guide/install-document';
import { Welcome } from '../../../app/jigsaw/welcome/welcome';

/** The documents of the info, one for each page (the route data `doc`). */
type InfoDoc = 'welcome' | 'help' | 'about' | 'terms' | 'install';

/**
 * The page of the routes `/play/info/welcome`, `help`, `about`, `terms` and `install`, **the info about the app**: one page component, and which document it frames is in the route data. The documents are
 * shared components, which it only frames: the welcome (`app-welcome`), the help, the about page and the terms of use (`app-guide-document`) and how to install the app (`app-install-document`). The pages are in the menu of the helper
 * (`infoMenu`, every page one entry), so there is no strip of tabs on the page, and Back is in that menu only (no button of its own on the page); every page is at most 1200 px wide like the others (`page-max`, and `guide-full` lets the documents use it); the entry Info of the page menu opens the welcome.
 */
@Component({
  selector: 'play-info',
  imports: [Welcome, GuideDocument, InstallDocument],
  host: { class: 'd-block' },
  template: `
    <main class="container-fluid page-margin page-max guide-full">
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
        @case ('terms') {
          <app-guide-document name="jigsaw-terms.md" />
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

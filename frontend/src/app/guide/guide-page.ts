import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DocumentTabs } from './document-tabs';
import { GuideDocument } from './guide-document';

/** The help (`/jigsaw/guide`) and the about page (`/jigsaw/about`): the strip of the documents and the document itself (`app-guide-document`). Which guide is in the route data (`jigsaw-guide.md`). */
@Component({
  selector: 'app-guide-page',
  imports: [DocumentTabs, GuideDocument],
  template: `
    <main class="container-fluid page-margin">
      <app-document-tabs />
      <app-guide-document [name]="name" />
    </main>
  `,
})
export class GuidePage {
  protected readonly name: string = inject(ActivatedRoute).snapshot.data['guide'] ?? 'jigsaw-guide.md';
}

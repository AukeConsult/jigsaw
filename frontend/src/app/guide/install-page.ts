import { Component } from '@angular/core';
import { DocumentTabs } from './document-tabs';
import { InstallDocument } from './install-document';

/** How to get Karins jigsaw as an app, at `/install` (a short address that is easy to share): the strip of the documents and the document itself (`app-install-document`). */
@Component({
  selector: 'app-install-page',
  imports: [DocumentTabs, InstallDocument],
  template: `
    <main class="container-fluid page-margin">
      <app-document-tabs />
      <app-install-document />
    </main>
  `,
})
export class InstallPage {}

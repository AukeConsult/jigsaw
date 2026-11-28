import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PictureForm } from '../../components/picture-form/picture-form';

/** The page of the route `/play/mine/addpicture`: a new picture. It only frames the form of a picture (`play-picture-form`), the same form as the page of a picture that is there; when the picture is saved the person goes on to the page of that picture, to look at what was saved and what the AI filled in, and to change it (in place of this page in the history, so Back does not return to an empty form). */
@Component({
  selector: 'play-add-picture',
  imports: [PictureForm],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max"><play-picture-form (saved)="onSaved($event)" /></main>`,
})
export class PlayAddPicture {
  private readonly router = inject(Router);

  protected onSaved({ id, ai }: { id: string; ai: boolean }): void {
    void this.router.navigate(['/play/mine/picture', id], { replaceUrl: true, state: { saved: { ai } } });
  }
}

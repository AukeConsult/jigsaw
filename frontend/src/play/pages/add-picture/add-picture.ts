import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { PictureForm } from '../../components/picture-form/picture-form';

/** The page of the route `/play/mine/addpicture`: a new picture. It only frames the form of a picture (`play-picture-form`), the same form as the page of a picture that is there; when the picture is saved the person goes home, where it is first in the list. */
@Component({
  selector: 'play-add-picture',
  imports: [PictureForm],
  host: { class: 'd-block' },
  template: `<main class="container-fluid page-margin page-max"><play-picture-form (saved)="onSaved()" /></main>`,
})
export class PlayAddPicture {
  private readonly router = inject(Router);

  protected onSaved(): void {
    void this.router.navigateByUrl('/');
  }
}

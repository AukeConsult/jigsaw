import { Component, OnDestroy, OnInit, effect, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { LANGUAGES } from '../../../app/core/language.service';
import { isBoolean, readPreference, writePreference } from '../../../app/core/preferences';
import { CategoryPicker } from '../../../app/jigsaw/category-picker/category-picker';
import { JigsawExample } from '../../../app/jigsaw/jigsaw-example/jigsaw-example';
import { JigsawHeader } from '../../../app/jigsaw/jigsaw-header/jigsaw-header';
import { PictureCropper } from '../../../app/jigsaw/picture-cropper/picture-cropper';
import { VisibilityChoice } from '../../../app/jigsaw/visibility-choice/visibility-choice';
import { JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME, JigsawSettings } from '../../../app/models/shared/jigsaw-settings';
import { MOTIVES } from '../../../app/models/shared/motive';
import { NewPicture } from './new-picture';

/**
 * **The form of a picture, a component that is framed into different pages**: `/play/mine/addpicture` (a new picture) and `/play/mine/picture/:id` (a picture that is there, with `pictureId`), so the person sees the same layout each time. It is made
 * of the same shared components as the jigsaw app's form (`app-jigsaw-header`, the picture card with the name and the description edited in place, `app-category-picker`, `app-visibility-choice`, the cropper), and its logic is `NewPicture`,
 * which it provides: a picture or a ready jigsaw (the kind, the size and the cut, and for a ready jigsaw the pieces, the difficulty and the clock), a name, a description, a language, the categories and the motive difficulty (folded under "Advanced"),
 * who sees it, then Save (or Save and analyse, for a new picture). **A picture that is changed has restrictions: only its owner changes it (an admin too), and its picture, size and cut can not be changed once rounds have been played of it**; the
 * name, the description, the categories and who sees it can. Its texts are the scopes `jigsawNew` and `jigsawLevels` of the jigsaw app, in every language.
 */
@Component({
  selector: 'play-picture-form',
  imports: [TranslocoDirective, RouterLink, JigsawHeader, JigsawExample, PictureCropper, CategoryPicker, VisibilityChoice],
  providers: [provideTranslocoScope('jigsawNew'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('play'), NewPicture],
  host: { class: 'd-block' },
  templateUrl: './picture-form.html',
})
export class PictureForm implements OnInit, OnDestroy {
  protected readonly n = inject(NewPicture);

  /** the picture that is changed (nothing: a new picture is made); the same form either way */
  readonly pictureId = input<string | null>(null);
  /** a picture that is there is changed (the default); false: it is only looked at, with no Save, and the page that frames the form has the button that changes it */
  readonly editing = input(true);
  /** the picture was saved: its id (the page that frames the form decides where to go) */
  readonly saved = output<string>();
  /** the changes were let go (Cancel): the form has the picture as it is saved again */
  readonly cancelled = output<void>();
  /** whether the person may change the picture (its owner, or an admin): said once the picture is read, so the page can offer Edit and Delete only to them */
  readonly access = output<boolean>();

  protected readonly languages = LANGUAGES;
  protected readonly motives = MOTIVES;
  /** the line and the colours of the pieces of a ready jigsaw: the model's own (nothing to choose here) */
  protected readonly lineWidth = JigsawSettings.DEFAULT_LINE_WIDTH;
  protected readonly lineColor = JigsawSettings.DEFAULT_LINE_COLOR;
  protected readonly backColor = JigsawSettings.DEFAULT_BACK_COLOR;
  protected readonly maxName = JIGSAW_MAX_NAME;
  protected readonly maxDescription = JIGSAW_MAX_DESCRIPTION;
  /** the name or the description is being edited in place in the card (the others show the text with a pencil) */
  protected readonly editingName = signal(false);
  protected readonly editingDescription = signal(false);
  /** "Advanced" (the categories and the motive difficulty) is open: kept on the device (rule 12 of `CLAUDE.md`), closed to begin with */
  protected readonly advancedOpen = signal(readPreference('play.addPictureAdvanced', false, isBoolean));

  constructor() {
    effect(() => writePreference('play.addPictureAdvanced', this.advancedOpen()));
    effect(() => this.n.viewing.set(!!this.pictureId() && !this.editing()));
    effect(() => {
      if (this.n.editId() && !this.n.loading() && !this.n.missing()) this.access.emit(this.n.mayChange());
    });
  }

  /** Cancel, for a picture that is changed: what was changed is let go, the picture is read again, and the page is told. */
  protected cancel(): void {
    const id = this.pictureId();
    if (id) void this.n.load(id);
    this.cancelled.emit();
  }

  ngOnInit(): void {
    const id = this.pictureId();
    if (id) void this.n.load(id);
  }

  /** opens the editor of the name or of the description in the card and puts the cursor in it */
  protected edit(which: 'name' | 'description'): void {
    (which === 'name' ? this.editingName : this.editingDescription).set(true);
    setTimeout(() => document.getElementById(which === 'name' ? 'play-picture-name' : 'play-picture-description')?.focus());
  }

  /** Save (with `analyse`, the AI sets the name, the description, the categories and the motive difficulty): when the picture is saved the form says so (`saved`) and the page that frames it goes on. */
  protected async save(analyse = false): Promise<void> {
    await this.n.save(analyse);
    const id = this.n.savedId();
    if (id) this.saved.emit(id);
  }

  ngOnDestroy(): void {
    this.n.release();
  }
}

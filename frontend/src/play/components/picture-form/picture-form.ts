import { Component, ElementRef, OnDestroy, OnInit, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { UploadLimit } from '../../../app/jigsaw/upload-limit/upload-limit';
import { cameraWay } from '../../../app/core/platform';
import { isBoolean, preferenceSignal } from '../../../app/core/preferences';
import { CameraCapture } from '../../../app/jigsaw/camera-capture/camera-capture';
import { CategoryPicker } from '../../../app/jigsaw/category-picker/category-picker';
import { CutShapeChoice } from '../../../app/jigsaw/cut-shape-choice/cut-shape-choice';
import { JigsawExample } from '../../../app/jigsaw/jigsaw-example/jigsaw-example';
import { JigsawHeader } from '../../../app/jigsaw/jigsaw-header/jigsaw-header';
import { PictureCropper } from '../../../app/jigsaw/picture-cropper/picture-cropper';
import { VisibilityChoice } from '../../../app/jigsaw/visibility-choice/visibility-choice';
import { JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME, JigsawSettings } from '../../../app/models/shared/jigsaw-settings';
import { MOTIVES } from '../../../app/models/shared/motive';
import { NewPicture } from './new-picture';
import { PhotoShot } from '../../photo-shot';

/**
 * **The form of a picture, a component that is framed into different pages**: `/play/mine/addpicture` (a new picture) and `/play/mine/picture/:id` (a picture that is there, with `pictureId`), so the person sees the same layout each time. It is made
 * of shared components (`app-jigsaw-header`, the picture card with the name and the description edited in place, `app-category-picker`, `app-visibility-choice`, the cropper), and its logic is `NewPicture`,
 * which it provides: a picture file or a photo taken there and then; a picture or a ready jigsaw (the kind, the size and the cut, and for a ready jigsaw the pieces, the difficulty and the clock), a name, a description, the categories and the motive difficulty (folded under "Advanced"),
 * who sees it, then Save (the AI then fills what is empty of a new picture, and of one whose picture file was replaced: a thin moving line shows it). **After Save the person stays on the picture** to look at what the AI filled in and change it: a note on top says it is saved, "Advanced" is opened when the AI filled something, **Save changes is there only when something differs from what is saved** (`NewPicture.changed`); while nothing does, Cancel reads Close. **There is no looking-only mode for the user's own picture: the form is open for changes at once.** **A picture that is changed has restrictions: only its owner changes it (an admin too), and its picture, size and cut can not be changed once rounds have been played of it**; the
 * name, the description, the categories and who sees it can, and **its owner can take all the rounds away** (asked first) to change the rest. Its texts are the scopes `jigsawNew` and `jigsawLevels`, in every language.
 */
@Component({
  selector: 'play-picture-form',
  imports: [TranslocoDirective, RouterLink, UploadLimit, JigsawHeader, JigsawExample, PictureCropper, CameraCapture, CategoryPicker, VisibilityChoice, CutShapeChoice],
  providers: [provideTranslocoScope('jigsawNew'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawPage'), provideTranslocoScope('play'), NewPicture],
  host: { class: 'd-block' },
  templateUrl: './picture-form.html',
})
export class PictureForm implements OnInit, OnDestroy {
  protected readonly n = inject(NewPicture);

  /** the picture that is changed (nothing: a new picture is made); the same form either way */
  readonly pictureId = input<string | null>(null);
  /** the picture was saved a moment ago on the page of a new one, and this form is where the person looks it over (`ai`: the AI filled something in) */
  readonly cameSaved = input<{ ai: boolean } | null>(null);
  /** the picture was saved: its id, and whether the AI filled something in. The person stays on the picture: a new one has to be opened by the page that frames the form */
  readonly saved = output<{ id: string; ai: boolean }>();
  /** Cancel, for a picture that is there: the changes are let go and the page that frames the form leaves */
  readonly cancelled = output<void>();
  /** all the rounds of the picture were taken away */
  readonly roundsRemoved = output<void>();
  /** whether the person may change the picture (its owner, or an admin): said once the picture is read, so the page can offer Delete only to them */
  readonly access = output<boolean>();

  protected readonly motives = MOTIVES;
  /** how a photo is taken here (`cameraWay`), and whether the window with the camera of a computer is open */
  protected readonly camera = cameraWay();
  protected readonly filming = signal(false);
  /** the line round the pieces of a ready jigsaw: the model's own (nothing to choose here) */
  protected readonly lineWidth = JigsawSettings.DEFAULT_LINE_WIDTH;
  protected readonly lineColor = JigsawSettings.DEFAULT_LINE_COLOR;
  protected readonly maxName = JIGSAW_MAX_NAME;
  protected readonly maxDescription = JIGSAW_MAX_DESCRIPTION;
  /** the name or the description is being edited in place in the card (the others show the text with a pencil) */
  protected readonly editingName = signal(false);
  protected readonly editingDescription = signal(false);
  /** "Advanced" (the categories and the motive difficulty) is open: kept on the device (rule 12 of `CLAUDE.md`), closed to begin with */
  protected readonly advancedOpen = preferenceSignal('play.addPictureAdvanced', false, isBoolean);

  constructor() {
    // a photo taken from the menu is taken by the form of a new picture, whether it was open already or has just been opened
    const shots = inject(PhotoShot);
    effect(() => {
      const photo = shots.taken();
      if (!photo || this.pictureId()) return;
      untracked(() => {
        shots.taken.set(null);
        void this.n.use(photo);
      });
    });
    effect(() => {
      if (this.n.editId() && !this.n.loading() && !this.n.missing()) this.access.emit(this.n.mayChange());
    });
  }

  async ngOnInit(): Promise<void> {
    const id = this.pictureId();
    if (!id) return;
    await this.n.load(id);
    const came = this.cameSaved();
    if (came) {
      this.n.markSaved(came.ai);
      this.showFound.set(came.ai);
    }
  }

  /** what the AI filled in is under Advanced: it is opened for it, without changing how the person keeps it */
  protected readonly showFound = signal(false);

  protected toggleAdvanced(): void {
    const open = !(this.advancedOpen() || this.showFound());
    this.showFound.set(false);
    this.advancedOpen.set(open);
  }

  /** opens the editor of the name or of the description in the card and puts the cursor in it */
  protected edit(which: 'name' | 'description'): void {
    (which === 'name' ? this.editingName : this.editingDescription).set(true);
    setTimeout(() => document.getElementById(which === 'name' ? 'play-picture-name' : 'play-picture-description')?.focus());
  }

  /** Save: the person stays and looks at what was saved, from the top (the name, the picture, what the AI filled in); the form says so (`saved`). */
  protected async save(): Promise<void> {
    await this.n.save();
    const id = this.n.savedId();
    if (!id) return;
    this.showFound.set(this.n.filledByAi());
    this.saved.emit({ id, ai: this.n.filledByAi() });
    setTimeout(() => this.element.nativeElement.scrollIntoView({ block: 'start' }));
  }

  private readonly element = inject<ElementRef<HTMLElement>>(ElementRef);

  protected async resetRounds(): Promise<void> {
    if (await this.n.resetRounds()) this.roundsRemoved.emit();
  }

  ngOnDestroy(): void {
    this.n.release();
  }
}

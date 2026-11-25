import { Injectable, computed, inject, signal } from '@angular/core';
import { LanguageService } from '../../app/core/language.service';
import { MAX_PICTURE_BYTES, fitPicture } from '../../app/jigsaw/fit-picture';
import { JigsawImageService } from '../../app/jigsaw/jigsaw-image.service';
import { JigsawUserService } from '../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../app/jigsaw/jigsaw.service';
import { SourceRect } from '../../app/models/shared/geometry';
import { JigsawKinds } from '../../app/models/shared/jigsaw-kind';
import { JIGSAW_MAX_NAME, JIGSAW_MAX_PICTURE_NAME, JigsawInput, JigsawSettings } from '../../app/models/shared/jigsaw-settings';
import { JigsawMotives, MotiveLevel } from '../../app/models/shared/motive';
import { tr } from '../../app/core/i18n';
import { PicturesAdded } from '../core/pictures-added';

/** The preview of the picture is small. */
const PREVIEW_BYTES = 300 * 1024;

/**
 * Adding a picture, in the app (the picture part of what the website's page of a new jigsaw does, as its own class: **the pages of the website are not shared with the app, only components and services are**): a picture file
 * is chosen and kept whole at its own size (`JigsawKinds.pictureSize`; the pieces and the difficulty are chosen in each round), it gets a name, a description, a language, categories, a motive difficulty and who sees it, and it is
 * saved: the jigsaw document, then its picture. "Save and analyse" also has the AI set the categories, the motive difficulty, the name and the description; saving with no name does that too. If a step fails what was made
 * is taken away again: nothing half made is left. The form (the view `picture-view`) provides a new one of these, so it starts empty each time.
 */
@Injectable()
export class NewPicture {
  private readonly jigsaws = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly users = inject(JigsawUserService);
  private readonly added = inject(PicturesAdded);

  /** the picture file that was chosen, and a small picture of it to look at (null: none yet) */
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  /** the size the picture is kept at, and the part of the file that is used (all of it): signals, so what depends on them is worked out again when the picture is read */
  private readonly size = signal({ width: 0, height: 0 });
  private readonly cut = signal<SourceRect | null>(null);

  readonly name = signal('');
  readonly description = signal('');
  /** the language the name and description are written in: the language the app is shown in, to begin with */
  readonly language = signal(inject(LanguageService).lang());
  readonly categories = signal<string[]>([]);
  readonly motive = signal('');
  /** who sees it: a new one is private to begin with (only its owner) until its owner makes it hidden, or public (a publisher) */
  readonly visibility = signal<'everyone' | 'owner' | 'hidden'>('owner');
  /** the account that plays owns it */
  readonly ownerUid = signal(this.users.user()?.id ?? '');

  readonly saving = signal(false);
  readonly analysing = signal(false);
  readonly error = signal('');
  /** the id of the picture that was saved (null: nothing yet) */
  readonly savedId = signal<string | null>(null);

  /** the name is missing: not a reason to turn Save away (the AI sets it), but it is said under its field */
  readonly nameMissing = computed(() => !this.name().trim());

  /** why the settings are not allowed besides a missing name ('' when they are): the rules of the model (`JigsawSettings`), the same as the page's */
  readonly problem = computed(() => (this.file() ? new JigsawSettings(this.settings(this.name().trim() || this.nameForAi())).error() : ''));
  /** a picture is there and nothing is wrong */
  readonly canAnalyse = computed(() => !!this.file() && !!this.ownerUid() && !this.saving() && !this.problem());
  /** Save needs a picture and, to keep it, a name (when there is none, Save runs the AI, which sets one) */
  readonly canSave = computed(() => this.canAnalyse());

  /** A picture file was chosen: it is kept whole at its own size, and a small picture of it is shown. */
  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (!file) return;
    this.error.set('');
    const bitmap = await createImageBitmap(file);
    const size = JigsawKinds.pictureSize(bitmap.width, bitmap.height);
    const cut = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    bitmap.close();
    this.size.set(size);
    this.cut.set(cut);
    this.file.set(file); // last: the picture counts as chosen when its size is known
    try {
      this.setPreview(URL.createObjectURL(await fitPicture(file, size.width, size.height, PREVIEW_BYTES, cut)));
    } catch {
      this.setPreview(null);
    }
  }

  private setPreview(address: string | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(address);
  }

  /** the name the AI replaces: the name of the picture file without its ending (a picture to analyse needs no name of its own yet) */
  private nameForAi(): string {
    return (this.name().trim() || this.pictureName().replace(/\.[^.]*$/, '') || 'Picture').slice(0, JIGSAW_MAX_NAME);
  }

  private pictureName(): string {
    return (this.file()?.name ?? '').trim().slice(0, JIGSAW_MAX_PICTURE_NAME);
  }

  /** the settings as the API takes them: a picture has no grid, store or difficulty of its own, each round has them */
  private settings(name: string): JigsawInput {
    const owner = this.users.user();
    return {
      name,
      ...(owner ? { author: owner.name, ownerUid: owner.id } : {}),
      ...(this.visibility() !== 'everyone' && owner ? { visibility: this.visibility() as 'owner' | 'hidden' } : {}),
      ...(this.pictureName() ? { pictureName: this.pictureName() } : {}), // kept with the jigsaw as information
      ...(this.description().trim() ? { description: this.description().trim() } : {}),
      language: this.language(),
      ...(this.categories().length ? { categories: this.categories() } : {}),
      ...(JigsawMotives.is(this.motive()) ? { motive: this.motive() as MotiveLevel } : {}),
      width: this.size().width,
      height: this.size().height,
      kind: 'picture',
      gridSize: 0,
      gridVisible: false,
      placed: [],
      lineWidth: JigsawSettings.DEFAULT_LINE_WIDTH,
      lineColor: JigsawSettings.DEFAULT_LINE_COLOR,
      backColor: JigsawSettings.DEFAULT_BACK_COLOR,
    };
  }

  /**
   * Save: the picture is made and kept. With `analyse` (and when there is no name) the AI looks at it first and sets the categories, the motive difficulty, the name and the description; when the AI cannot, the
   * name of the picture file stands in and the person can ask again later on the page of the picture.
   */
  async save(analyse = false): Promise<void> {
    const file = this.file();
    const cut = this.cut();
    if (!file || !cut || !this.canSave()) return;
    const withAi = analyse || this.nameMissing();
    this.error.set('');
    this.saving.set(true);
    let madeId: string | null = null;
    try {
      const picture = await fitPicture(file, this.size().width, this.size().height, MAX_PICTURE_BYTES, cut);
      const made = await this.jigsaws.create(this.settings(withAi ? this.nameForAi() : this.name().trim()));
      madeId = made.id;
      await this.images.upload(made.id, picture);
      if (withAi) {
        this.analysing.set(true);
        await this.jigsaws.classify(made.id, true).catch(() => null);
      }
      this.savedId.set(made.id);
      this.added.added();
    } catch {
      if (madeId) await this.jigsaws.remove(madeId).catch(() => undefined); // nothing half made is left
      this.error.set(tr('play.picture.couldNotMake', 'Could not make the jigsaw. Nothing was saved: check the picture and try again.'));
    } finally {
      this.saving.set(false);
      this.analysing.set(false);
    }
  }

  /** The form is made empty again, for the next picture. */
  reset(): void {
    this.setPreview(null);
    this.file.set(null);
    this.cut.set(null);
    this.name.set('');
    this.description.set('');
    this.categories.set([]);
    this.motive.set('');
    this.error.set('');
    this.savedId.set(null);
  }
}

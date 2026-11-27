import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { LanguageService } from '../../../app/core/language.service';
import { MAX_PICTURE_BYTES, fitPicture } from '../../../app/jigsaw/fit-picture';
import { JigsawImageService } from '../../../app/jigsaw/jigsaw-image.service';
import { JigsawMaker } from '../../../app/jigsaw/jigsaw-maker';
import { readPreference, writePreference } from '../../../app/core/preferences';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PlaysService } from '../../../app/jigsaw/plays.service';
import { Classifications } from '../../../app/models/shared/classification';
import { JigsawLanguages } from '../../../app/models/shared/language';
import { PictureCrop, SourceRect } from '../../../app/models/shared/geometry';
import { JigsawCut } from '../../../app/models/shared/jigsaw';
import { JigsawKind, JigsawKinds } from '../../../app/models/shared/jigsaw-kind';
import { JIGSAW_MAX_NAME, JIGSAW_MAX_PICTURE_NAME, JigsawInput, JigsawSettings, JigsawSpec } from '../../../app/models/shared/jigsaw-settings';
import { JigsawMotives, MotiveLevel } from '../../../app/models/shared/motive';
import { tr } from '../../../app/core/i18n';
import { apiError } from '../../../app/core/api-error';
import { RECOMMENDED_FULL, RECOMMENDED_PICTURES_MAX } from '../../../app/models/shared/account-limits';
import { PlayListFilter } from '../../play-list-filter';
import { CutChoice } from './cut-choice';
import { SIZE_PRESETS, nearestSize } from '../../../app/jigsaw/size-presets';

/** The preview of the picture is small. */
const PREVIEW_BYTES = 300 * 1024;

/** What was chosen for the last picture (rule 12 of `CLAUDE.md`): what is made, its size, and for a ready jigsaw its pieces, difficulty and clock; the name, picture and description belong to that picture and are not kept. */
interface NewPictureDefaults {
  kind: JigsawKind;
  pieces: string;
  snapPercent: number;
  timed: boolean;
  /** the size: 'whole' or a standard size (a form kept before it was kept has none) */
  shape?: string;
}
const DEFAULTS_KEY = 'play.newPicture';
const isDefaults = (v: unknown): v is NewPictureDefaults | null => {
  const d = v as Partial<NewPictureDefaults> | null;
  return v === null || (!!d && typeof d === 'object' && JigsawKinds.is(d.kind) && typeof d.pieces === 'string' && typeof d.snapPercent === 'number' && Number.isFinite(d.snapPercent) && typeof d.timed === 'boolean' && (d.shape === undefined || typeof d.shape === 'string'));
};

/**
 * The logic of the form of a picture (`play-picture-form`), for adding one and for changing one: **a picture, or a ready jigsaw.** A picture file
 * is chosen, and **one size for both** (`sizeKey`: the whole picture at its own size, `JigsawKinds.pictureSize`, or a standard size it is cut to), with one cut that the person may adjust, which stays when they change what is made.
 * For a picture the pieces and the difficulty are chosen in each round; a ready jigsaw has them here (`CutChoice`: pieces, difficulty, clock) and is cut into pieces that are kept. It gets a name, a description, a language, categories, a motive difficulty and who sees it, and it is
 * saved: the jigsaw document, then its picture. If a step fails what was made
 * is taken away again: nothing half made is left. **The AI looks at a new picture, and at one whose picture file was replaced, as it is saved** (there is nothing to press), and fills what is empty of the name, the description, the categories and the motive difficulty (`fillByAi`). **A picture that is there**: when rounds have been played of it, its owner can take them all away to change what the rounds share; a new size or number of pieces cuts the saved picture again. When it is saved its categories and who sees it (private to begin with) are added to the filter of the picture list (`PlayListFilter`), so the new picture is not left out of the list. The page (`add-picture`) provides a new one of these, so it starts empty each time.
 */
@Injectable()
export class NewPicture {
  private readonly jigsaws = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly maker = inject(JigsawMaker);
  private readonly users = inject(JigsawUserService);
  private readonly plays = inject(PlaysService);
  private readonly listFilter = inject(PlayListFilter);

  /** the picture file that was chosen, and a small picture of it to look at (null: none yet) */
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  /** what is made: a picture (the pieces and the difficulty are chosen in each round) or a ready jigsaw (chosen here) */
  readonly kind = signal<JigsawKind>('picture');
  readonly isPicture = computed(() => this.kind() === 'picture');
  /** how a ready jigsaw is cut into pieces */
  readonly choice = new CutChoice();
  /** the size of the whole picture (its own), and the part of the file that is used: signals, so what depends on them is worked out again when the picture is read */
  private readonly size = signal({ width: 800, height: 600 });
  private readonly cut = signal<SourceRect | null>(null);
  /** the shape (width / height) the cut was found for */
  private readonly cutShape = signal(0);
  /** the cropper is open: the person adjusts the part of the picture that is used (the same cropper for a picture and for a ready jigsaw); it opens only when they ask for it */
  readonly cropping = signal(false);
  readonly sizePresets = SIZE_PRESETS;
  /** the size chosen in the list, the same for a picture and for a ready jigsaw: 'whole' (the picture as it is) or a standard size that it is cut to */
  readonly sizeKey = signal<string>('whole');
  /** the size that is asked for: the standard size, else the whole picture's own */
  private readonly asked = computed(() => this.sizePresets.find((p) => p.key === this.sizeKey()) ?? this.size());
  /** the size of the picture area: for a picture the one asked for, for a ready jigsaw the one that comes out of the pieces */
  readonly width = computed(() => (this.isPicture() ? this.asked().width : this.choice.width()));
  readonly height = computed(() => (this.isPicture() ? this.asked().height : this.choice.height()));

  readonly name = signal('');
  readonly description = signal('');
  /** the language the name and description are written in: the language the app is shown in, to begin with */
  readonly language = signal(inject(LanguageService).lang());
  readonly categories = signal<string[]>([]);
  readonly motive = signal('');
  /** who sees it: a new one is private to begin with (only its owner) until its owner makes it hidden, or public (a publisher) */
  readonly visibility = signal<'everyone' | 'owner' | 'hidden'>('owner');
  /** the account that plays owns it (it follows the account: when the page is opened afresh the account is read a moment after the page is made) */
  readonly ownerUid = computed(() => this.users.user()?.id ?? '');

  /** the picture that is changed (null: a new one is made), as it was when the page opened, and whether it is being read */
  readonly editId = signal<string | null>(null);
  private original: JigsawSpec | null = null;
  readonly loading = signal(false);
  /** there is no such picture */
  readonly missing = signal(false);
  /** rounds have been played of it: the picture, its size and its cut can not be changed any more */
  readonly played = signal(false);
  private readonly ownerOfPicture = signal<string | undefined>(undefined);
  /** **only the owner of a picture changes it** (an admin too): a picture that is somebody else's can be looked at here, never changed; a new picture is always the user's own */
  readonly mayChange = computed(() => !this.editId() || (!!this.users.user() && this.users.user()!.id === this.ownerOfPicture()) || this.users.isAdmin());
  /** the picture is another player's: nothing can be changed */
  readonly readOnly = computed(() => !!this.editId() && !this.loading() && !this.mayChange());
  /** nothing in the form can be changed: the picture is another player's */
  readonly inert = this.readOnly;
  /** **rounds have been played of the picture: the picture itself can not be changed** (the name, the description, the categories and who sees it can) */
  readonly locked = computed(() => !!this.editId() && !this.readOnly() && this.played());
  /** the picture file, the size and the cut can be changed: a new picture, or one of the user's own that nobody has played */
  readonly canChangePicture = computed(() => !this.editId() || (this.mayChange() && !this.played()));

  readonly saving = signal(false);
  /** the AI is looking at the picture that was just saved */
  readonly analysing = signal(false);
  /** a picture file was chosen here (not the saved picture read to be cut again) */
  private replaced = false;
  readonly error = signal('');
  /** the id of the picture that was saved (null: nothing yet) */
  readonly savedId = signal<string | null>(null);

  /** the jigsaw as it will look at the top of the page (`app-jigsaw-header`): what the form says so far */
  readonly draft = computed(() => ({ id: this.editId() ?? '', ...this.settings(this.name().trim()) }) as JigsawSpec);

  /** why the settings are not allowed besides a missing name ('' when they are): the rules of the model (`JigsawSettings`), the same as the page's */
  readonly problem = computed(() => (this.file() || this.editId() ? new JigsawSettings(this.settings(this.nameOrFile())).error() : ''));
  /** a picture is there (with its cut, for a ready jigsaw) and nothing is wrong */
  private readonly canAdd = computed(() => !!this.file() && !!this.cut() && !!this.ownerUid() && !this.saving() && !this.problem());
  /** Save needs a picture; a picture that is there also needs a name (a new one with none gets it from the AI) */
  readonly canSave = computed(() =>
    this.editId()
      ? this.mayChange() && !this.loading() && !this.saving() && !this.analysing() && !!this.name().trim() && !this.problem() && (!this.file() || !!this.cut())
      : this.canAdd(),
  );

  constructor() {
    // the form starts with what was chosen for the last picture, and what is chosen now is kept for the next
    const saved = readPreference<NewPictureDefaults | null>(DEFAULTS_KEY, null, isDefaults);
    if (saved) {
      this.kind.set(saved.kind);
      this.sizeKey.set(this.sizePresets.some((p) => p.key === saved.shape) ? saved.shape! : 'whole');
      this.choice.fitTo(this.asked());
      this.choice.choosePieces(saved.pieces);
      this.choice.snapPercent.set(saved.snapPercent);
      this.choice.timed.set(saved.timed);
    }
    effect(() => {
      if (this.editId()) return; // what a saved picture has is not what was chosen for a new one
      writePreference(DEFAULTS_KEY, { kind: this.kind(), pieces: this.choice.pieceChoice(), snapPercent: this.choice.snapPercent(), timed: this.choice.timed(), shape: this.sizeKey() } satisfies NewPictureDefaults);
    });
  }

  /**
   * The picture that is changed is read: its settings fill the form, and its picture is shown. It can be looked at by anybody who may see it; **only its owner can change it**, and not its picture, size or cut when rounds
   * have been played of it.
   */
  async load(id: string): Promise<void> {
    this.editId.set(id);
    this.loading.set(true);
    try {
      const jigsaw = await this.jigsaws.get(id);
      if (!jigsaw) return void this.missing.set(true);
      this.original = jigsaw;
      this.ownerOfPicture.set(jigsaw.ownerUid);
      this.kind.set(JigsawKinds.of(jigsaw));
      this.name.set(jigsaw.name);
      this.description.set(jigsaw.description ?? '');
      this.language.set(JigsawLanguages.of(jigsaw));
      this.categories.set(jigsaw.categories ?? []);
      this.motive.set(jigsaw.motive ?? '');
      this.visibility.set(jigsaw.visibility ?? 'everyone');
      this.size.set({ width: jigsaw.width, height: jigsaw.height });
      // a saved picture is whole at the size it has; a saved ready jigsaw shows the standard size nearest to its own
      this.sizeKey.set(JigsawKinds.isPicture(jigsaw) ? 'whole' : nearestSize(jigsaw.width, jigsaw.height));
      if (!JigsawKinds.isPicture(jigsaw)) this.choice.show(jigsaw);
      this.played.set(await this.plays.played(id).catch(() => false));
      this.setPreview(this.images.url(jigsaw, 1));
    } catch {
      this.error.set(tr('play.picture.couldNotRead', 'Could not read the picture: try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** A picture file was chosen in a file field (or taken with the camera of a phone). */
  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (file) await this.use(file);
  }

  /** This is the picture file, chosen or just taken: it is fitted to the size that is chosen, by itself. */
  async use(file: File): Promise<void> {
    if (!this.canChangePicture()) return;
    this.error.set('');
    this.replaced = true;
    this.cut.set(null); // the cut of another picture says nothing about this one
    this.file.set(file);
    await this.fit(file);
  }

  /** What is made was chosen: the size and the cut stay (a ready jigsaw, a whole number of pieces, can have a slightly different shape: the cut follows it). */
  async chooseKind(kind: JigsawKind): Promise<void> {
    if (kind === this.kind() || this.editId()) return; // what a picture is made as is not changed afterwards
    this.kind.set(kind);
    const file = this.file();
    if (file) await this.fit(file);
  }

  /** A size was chosen (the same for both kinds): the picture is fitted to the shape. */
  async chooseSize(key: string): Promise<void> {
    if (!this.canChangePicture() || !(await this.useSaved())) return;
    this.sizeKey.set(key);
    this.choice.fitTo(this.asked());
    const file = this.file();
    if (file) await this.fit(file);
  }

  /** A number of pieces was chosen. A saved jigsaw is cut again; when the shape comes out a little different, the picture is fitted to it. */
  async choosePieces(key: string): Promise<void> {
    if (!this.canChangePicture() || !(await this.useSaved())) return;
    this.choice.choosePieces(key);
    const file = this.file();
    if (file) await this.fit(file);
  }

  /** To cut a saved picture again when no new file is chosen, the saved picture is read and stands as the chosen file, whole (it is cut to its shape already). False when it could not be read. */
  private async useSaved(): Promise<boolean> {
    const saved = this.original;
    if (!saved || this.file()) return true;
    try {
      const response = await fetch(this.images.url(saved, 1));
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      this.cut.set({ x: 0, y: 0, w: bitmap.width, h: bitmap.height });
      bitmap.close();
      this.cutShape.set(saved.width / saved.height);
      this.file.set(new File([blob], saved.pictureName ?? '', { type: blob.type }));
      return true;
    } catch {
      this.error.set(tr('play.picture.couldNotRead', 'Could not read the picture: try again.'));
      return false;
    }
  }

  /** "Delete all rounds" was pressed and waits for "Yes" */
  readonly confirmingReset = signal(false);

  /** All the rounds of the picture are taken away (also other players'), so its picture, size and cut can be changed. True when it was done. */
  async resetRounds(): Promise<boolean> {
    const id = this.editId();
    if (!id || !this.mayChange() || this.saving()) return false;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.plays.removeAll(id);
      this.played.set(false);
      return true;
    } catch {
      this.error.set(tr('jigsawPage.couldNotResetRounds', 'Could not take away the rounds: only its owner can.'));
      return false;
    } finally {
      this.saving.set(false);
      this.confirmingReset.set(false);
    }
  }

  /**
   * The AI looks at the picture that was just kept and fills what is empty (`Classifications.fill`): the name, the description, the categories and the motive difficulty, the texts in the language of the picture; what the
   * person typed or chose stays, and when nothing is empty the AI is not asked. The picture is saved already, so when the AI (or keeping what it said) fails, nothing is said and the picture stays as it was saved.
   */
  private async fillByAi(id: string, storeWidth?: number): Promise<void> {
    const motive = this.motive();
    const has = { name: this.name(), description: this.description(), categories: this.categories(), motive: JigsawMotives.is(motive) ? (motive as MotiveLevel) : undefined };
    if (!Classifications.lacks(has)) return;
    this.analysing.set(true);
    try {
      const fill = Classifications.fill(has, await this.jigsaws.classify(id, false, this.language()));
      if (!Object.keys(fill).length) return;
      if (fill.name) this.name.set(fill.name);
      if (fill.description) this.description.set(fill.description);
      if (fill.categories) this.categories.set(fill.categories);
      if (fill.motive) this.motive.set(fill.motive);
      await this.jigsaws.update(id, new JigsawSettings(this.settings(this.nameOrFile(), storeWidth)).stored());
    } catch {
      /* the picture is saved: only what the AI would have said is missing */
    } finally {
      this.analysing.set(false);
    }
  }

  /**
   * The picture is fitted to the size that is chosen, by itself (there is nothing the person has to do): the same for a picture and for a ready jigsaw. The whole picture gets its own size (`JigsawKinds.pictureSize`)
   * and the cut that covers it; a standard size gets the cut that covers its shape (`PictureCrop.covering`), and a cut the person had stays: as it is when the shape is the same, else round the same middle and zoomed in as much.
   */
  private async fit(file: File): Promise<void> {
    try {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      const whole = this.sizeKey() === 'whole';
      if (whole) {
        this.size.set(JigsawKinds.pictureSize(width, height));
        this.choice.fitTo(this.size());
      }
      const shape = this.width() / this.height();
      const old = whole ? null : this.cut();
      if (old && Math.abs(this.cutShape() - shape) <= 0.002) return;
      const cut = old
        ? PictureCrop.covering(width, height, shape, { x: old.x + old.w / 2, y: old.y + old.h / 2 }, PictureCrop.covering(width, height, this.cutShape()).w / old.w)
        : PictureCrop.covering(width, height, shape);
      await this.useCut(cut);
    } catch {
      this.file.set(null);
      this.setPreview(null);
      this.error.set(tr('play.picture.couldNotRead', 'Could not read the picture: try again.'));
    }
  }

  /** This is the cut: the one the picture got by itself, or the one the person adjusted in the cropper. */
  async useCut(rect: SourceRect): Promise<void> {
    this.cropping.set(false);
    this.cut.set(rect);
    this.cutShape.set(this.width() / this.height());
    const file = this.file();
    if (file) await this.showPreview(file, this.width(), this.height(), rect);
  }

  private async showPreview(file: File, width: number, height: number, cut: SourceRect): Promise<void> {
    try {
      this.setPreview(URL.createObjectURL(await fitPicture(file, width, height, PREVIEW_BYTES, cut)));
    } catch {
      this.setPreview(null);
    }
  }

  private setPreview(address: string | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(address);
  }

  /** the name that was typed, else the name of the picture file without its ending (a new picture has it until the AI says one) */
  private nameOrFile(): string {
    return (this.name().trim() || this.pictureName().replace(/\.[^.]*$/, '') || 'Picture').slice(0, JIGSAW_MAX_NAME);
  }

  private pictureName(): string {
    return (this.file()?.name ?? '').trim().slice(0, JIGSAW_MAX_PICTURE_NAME);
  }

  /** the settings as the API takes them: a picture has no grid, store or difficulty of its own, each round has them; a ready jigsaw has them from the choices (the store is added when it is cut) */
  private settings(name: string, storeWidth?: number): JigsawInput {
    const owner = this.users.user();
    const ownerId = this.original?.ownerUid ?? owner?.id;
    // a picture that is changed keeps its picture, size and cut unless a new picture file was chosen (what the rounds share is sent back as it is)
    const fixed = this.original && !this.file() ? this.fixedFields(this.original) : null;
    const cutting = this.isPicture()
      ? { kind: 'picture' as const, gridSize: 0, gridVisible: false }
      : { gridSize: this.choice.gridSize(), gridVisible: false, snapPercent: this.choice.snapPercent(), ...(storeWidth ? { storeWidth } : {}) };
    return {
      name,
      ...(this.original ? { ...(this.original.author ? { author: this.original.author } : {}), ...(ownerId ? { ownerUid: ownerId } : {}) } : owner ? { author: owner.name, ownerUid: owner.id } : {}),
      ...(this.visibility() !== 'everyone' && ownerId ? { visibility: this.visibility() as 'owner' | 'hidden' } : {}),
      ...(!this.isPicture() && !this.choice.timed() ? { timed: false } : {}), // timed is what none says
      ...(this.pictureName() || this.original?.pictureName ? { pictureName: this.pictureName() || this.original?.pictureName } : {}), // kept with the jigsaw as information
      ...(this.description().trim() ? { description: this.description().trim() } : {}),
      language: this.language(),
      ...(this.categories().length ? { categories: this.categories() } : {}),
      ...(JigsawMotives.is(this.motive()) ? { motive: this.motive() as MotiveLevel } : {}),
      ...(fixed ?? { width: this.width(), height: this.height(), ...cutting, placed: [] }),
      // the difficulty of a ready jigsaw nobody has played is changed without cutting it again
      ...(fixed && !this.isPicture() && !this.played() ? { snapPercent: this.choice.snapPercent() } : {}),
      lineWidth: this.original?.lineWidth ?? JigsawSettings.DEFAULT_LINE_WIDTH,
      lineColor: this.original?.lineColor ?? JigsawSettings.DEFAULT_LINE_COLOR,
      backColor: this.original?.backColor ?? JigsawSettings.DEFAULT_BACK_COLOR,
    };
  }

  /** what a picture that is changed keeps when no new picture file is chosen: its size, its cut and what is placed on it (the API refuses a change of them when rounds have been played) */
  private fixedFields(item: JigsawSpec) {
    return {
      width: item.width,
      height: item.height,
      gridSize: item.gridSize,
      gridVisible: item.gridVisible,
      placed: item.placed,
      ...(JigsawKinds.isPicture(item) ? { kind: 'picture' as const } : {}),
      ...(item.storeWidth ? { storeWidth: item.storeWidth } : {}),
      ...(item.snapPercent !== undefined ? { snapPercent: item.snapPercent } : {}),
    };
  }

  /**
   * Save a picture that is changed: its settings are saved (the whole document, so the picture is read first and sent with what changed); when a new picture file was chosen the picture is kept again and, for a ready jigsaw,
   * it is cut again and the pieces are kept again. Only for the owner, and the picture file only when nobody has played the picture.
   */
  private async saveEdit(): Promise<void> {
    const id = this.editId();
    const file = this.file();
    const cut = this.cut();
    if (!id || !this.canSave()) return;
    const cutting = file && cut && !this.isPicture() ? JigsawCut.cut(this.width(), this.height(), this.choice.gridSize()) : null;
    if (cutting && 'error' in cutting) {
      this.error.set(cutting.error);
      return;
    }
    this.error.set('');
    this.saving.set(true);
    try {
      await this.jigsaws.update(id, new JigsawSettings(this.settings(this.name().trim(), cutting?.storeWidth)).stored());
      if (file && cut) {
        const picture = await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut);
        await this.images.upload(id, picture);
        if (cutting) await this.maker.keepPieces(id, cutting);
        if (this.replaced) await this.fillByAi(id, cutting?.storeWidth);
      }
      this.savedId.set(id);
    } catch (err) {
      this.error.set(this.recommendedFull(err) || tr('play.picture.couldNotChange', 'Could not save the changes: only the owner can change a picture, and not its picture once rounds have been played.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** Save: the picture is made and kept, and then the AI fills what is empty (`fillByAi`); when it cannot, the name of the picture file stands in for a missing name. */
  async save(): Promise<void> {
    if (this.editId()) return this.saveEdit();
    const file = this.file();
    const cut = this.cut();
    if (!file || !cut || !this.canSave()) return;
    // a picture is not cut here (each round cuts it as chosen): only a ready jigsaw is cut into pieces
    const cutting = this.isPicture() ? null : JigsawCut.cut(this.width(), this.height(), this.choice.gridSize());
    if (cutting && 'error' in cutting) {
      this.error.set(cutting.error);
      return;
    }
    this.error.set('');
    this.saving.set(true);
    try {
      const picture = await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut);
      const made = await this.maker.createWithPicture(this.settings(this.nameOrFile(), cutting?.storeWidth), picture, async (saved) => {
        if (cutting) await this.maker.keepPieces(saved.id, cutting);
      });
      await this.fillByAi(made.id, cutting?.storeWidth);
      this.savedId.set(made.id);
      this.listFilter.addPicture(this.categories(), this.visibility() === 'hidden' ? null : this.visibility() === 'owner' ? 'private' : 'public');
    } catch (err) {
      this.error.set(this.recommendedFull(err) || tr('play.picture.couldNotMake', 'Could not save the picture. Nothing was saved: check the picture and try again.'));
    } finally {
      this.saving.set(false);
    }
  }

  /** what to say when the picture was refused because it is marked Recommended and there is no room ('' for anything else) */
  private recommendedFull(err: unknown): string {
    return apiError(err) === RECOMMENDED_FULL ? tr('jigsawNew.recommendedFull', 'You can have {{ max }} recommended pictures: take the mark off one first.', { max: RECOMMENDED_PICTURES_MAX }) : '';
  }

  /** The small picture of the chosen file is let go (the page is left). */
  release(): void {
    this.setPreview(null);
  }
}

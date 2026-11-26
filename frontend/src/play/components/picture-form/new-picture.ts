import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { LanguageService } from '../../../app/core/language.service';
import { MAX_PICTURE_BYTES, fitPicture } from '../../../app/jigsaw/fit-picture';
import { JigsawImageService } from '../../../app/jigsaw/jigsaw-image.service';
import { JigsawPiecesService } from '../../../app/jigsaw/jigsaw-pieces.service';
import { renderPieceGraphics } from '../../../app/jigsaw/piece-graphics';
import { readPreference, writePreference } from '../../../app/core/preferences';
import { JigsawUserService } from '../../../app/jigsaw/jigsaw-user.service';
import { JigsawService } from '../../../app/jigsaw/jigsaw.service';
import { PlaysService } from '../../../app/jigsaw/plays.service';
import { JigsawLanguages } from '../../../app/models/shared/language';
import { SourceRect } from '../../../app/models/shared/geometry';
import { JigsawCut, JigsawPieces } from '../../../app/models/shared/jigsaw';
import { JigsawKind, JigsawKinds } from '../../../app/models/shared/jigsaw-kind';
import { JIGSAW_MAX_NAME, JIGSAW_MAX_PICTURE_NAME, JigsawInput, JigsawSettings, JigsawSpec } from '../../../app/models/shared/jigsaw-settings';
import { JigsawMotives, MotiveLevel } from '../../../app/models/shared/motive';
import { tr } from '../../../app/core/i18n';
import { PlayListFilter } from '../../play-list-filter';
import { CutChoice } from './cut-choice';

/** The preview of the picture is small. */
const PREVIEW_BYTES = 300 * 1024;

/** What was chosen for the last picture (rule 12 of `CLAUDE.md`): what is made, and for a ready jigsaw its size, pieces, difficulty and clock; the name, picture and description belong to that picture and are not kept. */
interface NewPictureDefaults {
  kind: JigsawKind;
  size: string;
  pieces: string;
  snapPercent: number;
  timed: boolean;
  /** the shape of a picture: 'whole' or a standard size (a form kept before it was kept has none) */
  shape?: string;
}
const DEFAULTS_KEY = 'play.newPicture';
const isDefaults = (v: unknown): v is NewPictureDefaults | null => {
  const d = v as Partial<NewPictureDefaults> | null;
  return v === null || (!!d && typeof d === 'object' && JigsawKinds.is(d.kind) && typeof d.size === 'string' && typeof d.pieces === 'string' && typeof d.snapPercent === 'number' && Number.isFinite(d.snapPercent) && typeof d.timed === 'boolean' && (d.shape === undefined || typeof d.shape === 'string'));
};

/**
 * Adding a picture, in the app (what the website's page of a new jigsaw does, as its own class: **the pages of the website are not shared with the app, only components and services are**): **a picture, or a ready jigsaw.** A picture file
 * is chosen; for a picture it is kept whole at its own size (`JigsawKinds.pictureSize`; the pieces and the difficulty are chosen in each round), for a ready jigsaw it is cut to the shape chosen (`CutChoice`: size, pieces, difficulty, clock; the part
 * of the picture that is used is found with the cropper) and cut into pieces that are kept with their graphics. It gets a name, a description, a language, categories, a motive difficulty and who sees it, and it is
 * saved: the jigsaw document, then its picture. "Save and analyse" also has the AI set the categories, the motive difficulty, the name and the description; saving with no name does that too. If a step fails what was made
 * is taken away again: nothing half made is left. When it is saved its categories and who sees it (private to begin with) are added to the filter of the picture list (`PlayListFilter`), so the new picture is not left out of the list. The page (`add-picture`) provides a new one of these, so it starts empty each time.
 */
@Injectable()
export class NewPicture {
  private readonly jigsaws = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly pieceApi = inject(JigsawPiecesService);
  private readonly users = inject(JigsawUserService);
  private readonly plays = inject(PlaysService);
  private readonly listFilter = inject(PlayListFilter);

  /** the picture file that was chosen, and a small picture of it to look at (null: none yet) */
  readonly file = signal<File | null>(null);
  readonly preview = signal<string | null>(null);
  /** what is made: a picture (the pieces and the difficulty are chosen in each round) or a ready jigsaw (chosen here) */
  readonly kind = signal<JigsawKind>('picture');
  readonly isPicture = computed(() => this.kind() === 'picture');
  /** how a ready jigsaw is cut */
  readonly choice = new CutChoice();
  /** the size a picture is kept at (its own, whole), and the part of the file that is used: signals, so what depends on them is worked out again when the picture is read */
  private readonly size = signal({ width: 800, height: 600 });
  private readonly cut = signal<SourceRect | null>(null);
  /** the shape (width / height) the cut was found for */
  private readonly cutShape = signal(0);
  /** the cropper is open: the part of the picture that is used is found in it (the same cropper for a picture and for a ready jigsaw) */
  readonly cropping = signal(false);
  /** the shape of a picture: 'whole' (the picture as it is, at its own size) or a standard size that it is cut to */
  readonly pictureShape = signal<string>('whole');
  /** the size chosen in the list: a picture has "the whole picture" besides the standard sizes, a ready jigsaw only the standard sizes */
  readonly sizeKey = computed(() => (this.isPicture() ? this.pictureShape() : this.choice.sizeKey()));
  private readonly pictureSized = computed(() => this.choice.sizePresets.find((p) => p.key === this.pictureShape()));
  /** the size of the picture area: for a picture the whole picture's own or the standard size, for a ready jigsaw the one that comes out of the pieces */
  readonly width = computed(() => (this.isPicture() ? (this.pictureSized()?.width ?? this.size().width) : this.choice.width()));
  readonly height = computed(() => (this.isPicture() ? (this.pictureSized()?.height ?? this.size().height) : this.choice.height()));
  /** the cut was found for another shape than the one that is chosen now: the picture has to be adjusted again */
  readonly stale = computed(() => !!this.cut() && Math.abs(this.cutShape() - this.width() / this.height()) > 0.002);

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
  readonly analysing = signal(false);
  readonly error = signal('');
  /** the id of the picture that was saved (null: nothing yet) */
  readonly savedId = signal<string | null>(null);

  /** the jigsaw as it will look at the top of the page (the same top as the page of a jigsaw): what the form says so far */
  readonly draft = computed(() => ({ id: this.editId() ?? '', ...this.settings(this.name().trim()) }) as JigsawSpec);

  /** the name is missing: not a reason to turn Save away, and nothing is said about it (the AI sets one) */
  readonly nameMissing = computed(() => !this.name().trim());

  /** why the settings are not allowed besides a missing name ('' when they are): the rules of the model (`JigsawSettings`), the same as the page's */
  readonly problem = computed(() => (this.file() || this.editId() ? new JigsawSettings(this.settings(this.name().trim() || this.nameForAi())).error() : ''));
  /** a picture is there (with its cut, for a ready jigsaw) and nothing is wrong */
  readonly canAnalyse = computed(() => !!this.file() && !!this.cut() && !this.stale() && !!this.ownerUid() && !this.saving() && !this.problem());
  /** Save needs a picture and, to keep it, a name (when there is none, Save runs the AI, which sets one) */
  readonly canSave = computed(() =>
    this.editId()
      ? this.mayChange() && !this.loading() && !this.saving() && !!this.name().trim() && !this.problem() && (!this.file() || (!!this.cut() && !this.stale()))
      : this.canAnalyse(),
  );

  constructor() {
    // the form starts with what was chosen for the last picture, and what is chosen now is kept for the next
    const saved = readPreference<NewPictureDefaults | null>(DEFAULTS_KEY, null, isDefaults);
    if (saved) {
      this.kind.set(saved.kind);
      this.choice.chooseSize(saved.size);
      this.choice.choosePieces(saved.pieces);
      this.choice.snapPercent.set(saved.snapPercent);
      this.choice.timed.set(saved.timed);
      this.pictureShape.set(saved.shape === 'whole' || this.choice.sizePresets.some((p) => p.key === saved.shape) ? (saved.shape ?? 'whole') : 'whole');
    }
    effect(() => writePreference(DEFAULTS_KEY, { kind: this.kind(), size: this.choice.sizeKey(), pieces: this.choice.pieceChoice(), snapPercent: this.choice.snapPercent(), timed: this.choice.timed(), shape: this.pictureShape() } satisfies NewPictureDefaults));
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
      this.pictureShape.set('whole');
      this.choice.width.set(jigsaw.width);
      this.choice.height.set(jigsaw.height);
      this.choice.gridSize.set(jigsaw.gridSize);
      this.choice.snapPercent.set(jigsaw.snapPercent ?? this.choice.snapPercent());
      this.choice.timed.set(jigsaw.timed !== false);
      this.played.set(await this.plays.played(id).catch(() => false));
      this.setPreview(this.images.url(jigsaw, 1));
    } catch {
      this.error.set(tr('play.picture.couldNotRead', 'Could not read the picture: try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** A picture file was chosen: a picture is kept whole; a ready jigsaw shows it in the cropper to find the part that is used. */
  async choose(event: Event): Promise<void> {
    if (!this.canChangePicture()) return;
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (!file) return;
    this.error.set('');
    this.file.set(file);
    await this.fit(file);
  }

  /** What is made was chosen: the picture is fitted to the shape of that kind again. */
  async chooseKind(kind: JigsawKind): Promise<void> {
    if (kind === this.kind() || this.editId()) return; // what a picture is made as is not changed afterwards
    this.kind.set(kind);
    const file = this.file();
    if (file) await this.fit(file);
  }

  /** A size was chosen: the same list for both kinds (a picture can also be the whole picture); the picture is fitted to the shape. */
  async chooseSize(key: string): Promise<void> {
    if (!this.canChangePicture()) return;
    if (this.isPicture()) this.pictureShape.set(key);
    else this.choice.chooseSize(key);
    const file = this.file();
    if (file) await this.fit(file);
  }

  /** The picture is fitted to the shape that is chosen: the whole picture of a picture is kept as it is; every other shape, of a picture or of a ready jigsaw, has its cut found in the cropper. */
  private async fit(file: File): Promise<void> {
    if (this.isPicture() && this.pictureShape() === 'whole') return this.useWhole(file);
    this.cut.set(null);
    this.setPreview(null);
    this.cropping.set(true);
  }

  /** The whole picture: it gets the size `JigsawKinds.pictureSize` says, and there is no cut to find. */
  private async useWhole(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const size = JigsawKinds.pictureSize(bitmap.width, bitmap.height);
    const cut = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    bitmap.close();
    this.size.set(size);
    this.cut.set(cut);
    this.cutShape.set(size.width / size.height);
    this.file.set(file); // last: the picture counts as chosen when its size is known
    await this.showPreview(file, size.width, size.height, cut);
  }

  /** The cut was found in the cropper. */
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

  /** the name the AI replaces: the name of the picture file without its ending (a picture to analyse needs no name of its own yet) */
  private nameForAi(): string {
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
        if (cutting) {
          const pieces = cutting.placed.flatMap((p) => JigsawPieces.of(p, cutting.columns) ?? []);
          const address = URL.createObjectURL(picture);
          let graphics: Map<string, string>;
          try {
            graphics = await renderPieceGraphics(address, pieces, cutting.columns, cutting.rows, { width: this.original?.lineWidth ?? JigsawSettings.DEFAULT_LINE_WIDTH, color: this.original?.lineColor ?? JigsawSettings.DEFAULT_LINE_COLOR });
          } finally {
            URL.revokeObjectURL(address);
          }
          await this.pieceApi.replace(id, pieces.map((p) => (graphics.has(p.id) ? { ...p, graphic: graphics.get(p.id) } : p)));
        }
      }
      this.savedId.set(id);
    } catch {
      this.error.set(tr('play.picture.couldNotChange', 'Could not save the changes: only the owner can change a picture, and not its picture once rounds have been played.'));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Save: the picture is made and kept. With `analyse` (and when there is no name) the AI looks at it first and sets the categories, the motive difficulty, the name and the description; when the AI cannot, the
   * name of the picture file stands in and the person can ask again later on the page of the picture.
   */
  async save(analyse = false): Promise<void> {
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
    const pieces = cutting ? cutting.placed.flatMap((p) => JigsawPieces.of(p, cutting.columns) ?? []) : [];
    const withAi = analyse || this.nameMissing();
    this.error.set('');
    this.saving.set(true);
    let madeId: string | null = null;
    let categories = this.categories();
    try {
      const picture = await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut);
      const made = await this.jigsaws.create(this.settings(withAi ? this.nameForAi() : this.name().trim(), cutting?.storeWidth));
      madeId = made.id;
      await this.images.upload(made.id, picture);
      if (cutting) {
        const address = URL.createObjectURL(picture);
        let graphics: Map<string, string>;
        try {
          graphics = await renderPieceGraphics(address, pieces, cutting.columns, cutting.rows, { width: JigsawSettings.DEFAULT_LINE_WIDTH, color: JigsawSettings.DEFAULT_LINE_COLOR });
        } finally {
          URL.revokeObjectURL(address);
        }
        await this.pieceApi.replace(made.id, pieces.map((p) => (graphics.has(p.id) ? { ...p, graphic: graphics.get(p.id) } : p)));
      }
      if (withAi) {
        this.analysing.set(true);
        const classified = await this.jigsaws.classify(made.id, true).catch(() => null);
        if (classified?.applied) categories = classified.categories; // the picture has the categories the AI set
      }
      this.savedId.set(made.id);
      this.listFilter.addPicture(categories, this.visibility() === 'hidden' ? null : this.visibility() === 'owner' ? 'private' : 'public');
    } catch {
      if (madeId) await this.jigsaws.remove(madeId).catch(() => undefined); // nothing half made is left
      this.error.set(tr('play.picture.couldNotMake', 'Could not save the picture. Nothing was saved: check the picture and try again.'));
    } finally {
      this.saving.set(false);
      this.analysing.set(false);
    }
  }

  /** The small picture of the chosen file is let go (the page is left). */
  release(): void {
    this.setPreview(null);
  }
}

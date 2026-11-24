import { Location } from '@angular/common';
import { Component, OnDestroy, effect, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { tr } from '../../core/i18n';
import { readPreference, writePreference } from '../../core/preferences';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MAX_PICTURE_BYTES, fitPicture } from '../fit-picture';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawPiecesService } from '../jigsaw-pieces.service';
import { JigsawService } from '../jigsaw.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawUserSpec } from '../../models/shared/jigsaw-user';
import { PlaysService } from '../plays.service';
import { SNAP_LEVELS, snapLevelOf, snapPercentOf } from '../snap-level';
import { JigsawExample } from '../jigsaw-example/jigsaw-example';
import { CategoryPicker } from '../category-picker/category-picker';
import { VisibilityChoice } from '../visibility-choice/visibility-choice';
import { JigsawHeader } from '../jigsaw-header/jigsaw-header';
import { JigsawFields } from '../jigsaw-fields/jigsaw-fields';
import { LANGUAGES, LanguageService } from '../../core/language.service';
import { JigsawLanguages } from '../../models/shared/language';
import { PictureCropper } from '../picture-cropper/picture-cropper';
import { renderPieceGraphics } from '../piece-graphics';
import { JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME, JIGSAW_MAX_PICTURE_NAME, JIGSAW_MAX_SIDE, JIGSAW_MIN_SIDE, JigsawSettings, JigsawInput, JigsawSpec } from '../../models/shared/jigsaw-settings';
import { JigsawMotives, MOTIVES, MotiveLevel } from '../../models/shared/motive';
import { JigsawKind, JigsawKinds } from '../../models/shared/jigsaw-kind';
import { SourceRect } from '../../models/shared/geometry';
import { JigsawCut, JigsawPieces, PieceLayout, pieceGrid } from '../../models/shared/jigsaw';

/** What the person chose the last time they made a jigsaw: the form starts with it (what is typed for this jigsaw, like the name and the picture, is not kept). */
interface NewJigsawPreferences {
  /** a picture or a ready jigsaw (a form kept before the kinds has none: a picture) */
  kind?: JigsawKind;
  /** the size: a standard one by its key, or 'custom' with the width and height as they were typed */
  size: string;
  width: number;
  height: number;
  /** the number of pieces: a standard one by its key ('16x12'), or 'custom' with the number typed */
  pieces: string;
  pieceCount: number;
  snapPercent: number;
  timed: boolean;
  lineWidth: number;
  lineColor: string;
  backColor: string;
}

const NEW_JIGSAW_KEY = 'jigsaw.newDefaults';
const isNewJigsawPreferences = (v: unknown): v is NewJigsawPreferences => {
  const p = v as Partial<NewJigsawPreferences> | null;
  const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  const colour = (x: unknown) => typeof x === 'string' && /^#[0-9a-fA-F]{6}$/.test(x);
  return (
    !!p && typeof p === 'object' && (p.kind === undefined || JigsawKinds.is(p.kind)) && typeof p.size === 'string' && num(p.width) && num(p.height) && typeof p.pieces === 'string' && num(p.pieceCount) && num(p.snapPercent) &&
    typeof p.timed === 'boolean' && num(p.lineWidth) && colour(p.lineColor) && colour(p.backColor)
  );
};

/** The preview of the cut picture is small. */
const PREVIEW_BYTES = 300 * 1024;

/**
 * Making a new jigsaw: the person fills in the settings in the main frame (the name, the size, how many pieces, the picture and how close a piece has to be
 * dropped to click into place), then saves. Saving makes the jigsaw (its settings), puts its picture in Storage, cuts it into pieces and keeps them in
 * the database with their graphics, and opens it to play. If a step fails what was made is taken away again: there is no half made jigsaw.
 *
 * The same form edits a jigsaw (`/jigsaw/:id/edit`): it is filled in with the jigsaw and its picture. When nobody has played it everything can be changed, a new picture too;
 * saving changes the settings, and when the picture or the cut into pieces changed the picture and the pieces are made again. When rounds have been started (`played`) the
 * picture, the kind, the size, the pieces, the difficulty and the clock are fixed (they are shown as they are, locked), and the owner can take all the rounds away to change them.
 */
@Component({
  selector: 'app-jigsaw-new',
  imports: [FormsModule, RouterLink, PictureCropper, JigsawExample, TranslocoDirective, JigsawFields, JigsawHeader, VisibilityChoice, CategoryPicker],
  providers: [provideTranslocoScope('jigsawNew'), provideTranslocoScope('jigsawLevels'), provideTranslocoScope('jigsawPage')],
  templateUrl: './jigsaw-new.html',
})
export class JigsawNew implements OnDestroy {
  private readonly service = inject(JigsawService);
  private readonly images = inject(JigsawImageService);
  private readonly pieceApi = inject(JigsawPiecesService);
  private readonly router = inject(Router);
  private readonly plays = inject(PlaysService);
  private readonly users = inject(JigsawUserService);
  private readonly location = inject(Location);
  /** the jigsaw that is edited (null: a new one is made); a new one that was saved with "Save and analyse with AI" is the one that is edited from then on, in the same page */
  private readonly editIdState = signal<string | null>(inject(ActivatedRoute).snapshot.paramMap.get('id'));
  /** the kind a link asked for (`/jigsaw/new?kind=picture`, the menu's Add picture): it wins over what was chosen for the last jigsaw */
  private readonly askedKind = ((kind) => (JigsawKinds.is(kind) ? kind : null))(inject(ActivatedRoute).snapshot.queryParamMap.get('kind'));
  get editId(): string | null {
    return this.editIdState();
  }
  /** the jigsaw as it was when the edit began, and whether its picture was changed since (a new file, or another cut of it) */
  private original: JigsawSpec | null = null;
  protected readonly pictureChanged = signal(false);
  readonly loading = signal(!!this.editId);

  /** the standard shapes to choose from (the picture area is then made a whole number of pieces wide and high, which can differ a little) */
  readonly sizePresets = [
    { key: 'standard', label: 'Standard 4:3 (800 × 600)', width: 800, height: 600 },
    { key: 'photo', label: 'Photo 3:2 (900 × 600)', width: 900, height: 600 },
    { key: 'wide', label: 'Wide 16:9 (960 × 540)', width: 960, height: 540 },
    { key: 'square', label: 'Square 1:1 (700 × 700)', width: 700, height: 700 },
    { key: 'portrait', label: 'Portrait 3:4 (600 × 800)', width: 600, height: 800 },
    { key: 'panorama', label: 'Panorama 3:1 (1200 × 400)', width: 1200, height: 400 },
    { key: 'large', label: 'Large 4:3 (1200 × 900)', width: 1200, height: 900 },
  ] as const;
  /** the size as the person asked for it (the picture area itself is made a whole number of pieces wide and high, which can differ a little) */
  private readonly asked = signal({ width: 800, height: 600 });
  /** the standard numbers of pieces to choose from: whole columns and rows in the shape of the picture area (see `JigsawCut.pieceChoices`) */
  readonly pieceOptions = computed(() => JigsawCut.pieceChoices(this.asked().width, this.asked().height).map((c) => ({ ...c, key: `${c.columns}x${c.rows}` })));
  /** which standard size and number of pieces is chosen ('custom': typed by hand; a number of pieces is 'columns x rows') */
  readonly sizeChoice = signal<string>('whole');
  /** the size shown in the list: a ready jigsaw has no "whole picture" (that is the size of a picture entry), it shows the standard size then */
  readonly sizeKey = computed(() => (!this.isPicture() && this.sizeChoice() === 'whole' ? 'standard' : this.sizeChoice()));
  readonly pieceChoice = signal<string>('16x12');

  /** what is made: a picture (the pieces and the difficulty are chosen in each round: none are cut here) or a ready jigsaw; a picture to begin with */
  readonly kind = signal<JigsawKind>('picture');
  readonly isPicture = computed(() => this.kind() === 'picture');

  /**
   * The kind was chosen. A picture is made of the whole picture at its own size (no cut to find); a ready jigsaw gets a cut into pieces, so one that has none yet (a picture that is
   * edited) gets the usual number of pieces, and a picture that was chosen has to be adjusted to the shape of its picture area.
   */
  chooseKind(kind: JigsawKind): void {
    if (kind === this.kind() || this.played()) return;
    this.kind.set(kind);
    const file = this.file();
    if (kind === 'picture') {
      this.sizeChoice.set('whole');
      if (file) void this.useWholePicture(file);
      return;
    }
    if (this.sizeChoice() === 'whole') this.sizeChoice.set('custom'); // the size it has stays: the sides are typed ones now
    this.asked.set({ width: this.width(), height: this.height() });
    if (this.gridSize() <= 0) this.pieceCount.set(16 * 12);
    this.relayout('pieces');
  }

  /** The whole picture is the picture of a picture entry: it gets the size `JigsawKinds.pictureSize` says, and there is no cut to find. */
  private async useWholePicture(file: File): Promise<void> {
    const bitmap = await createImageBitmap(file);
    const size = JigsawKinds.pictureSize(bitmap.width, bitmap.height);
    const rect = { x: 0, y: 0, w: bitmap.width, h: bitmap.height };
    bitmap.close();
    this.sizeChoice.set('whole');
    this.width.set(size.width);
    this.height.set(size.height);
    this.cut.set({ rect, shape: size.width / size.height });
    this.pictureChanged.set(true);
    try {
      this.setPreview(URL.createObjectURL(await fitPicture(file, size.width, size.height, PREVIEW_BYTES, rect)));
    } catch {
      this.setPreview(null);
    }
  }

  /** the name is needed, and starts empty (nothing is filled in for the person) */
  readonly name = signal('');
  /** a few words about the picture (optional), shown on the page of the jigsaw */
  readonly description = signal('');
  /** the language the name and description are written in: the language the app is shown in (the language of the user), to begin with */
  readonly language = signal(inject(LanguageService).lang());
  /** the keys of the categories the jigsaw is in */
  readonly categories = signal<string[]>([]);
  /** the motive difficulty ('' when nobody has said it) */
  readonly motive = signal('');
  /** who made the jigsaw: a user chosen from the users (the UID is kept on the jigsaw as its owner, and the user's name is its author) */
  readonly owners = signal<JigsawUserSpec[]>([]);
  readonly ownerUid = signal('');
  /** who sees the jigsaw: a new one is private to begin with (only its owner, and the players it has) until its owner makes it hidden, or public (a publisher) */
  readonly visibility = signal<'everyone' | 'owner' | 'hidden'>('owner');
  /** a clock counts how long each round takes */
  readonly timed = signal(true);
  private readonly owner = computed(() => this.owners().find((u) => u.id === this.ownerUid()) ?? null);
  readonly width = signal(800);
  readonly height = signal(600);
  /** how many pieces the picture is cut into (the grid size is worked out from it) */
  readonly pieceCount = signal(16 * 12);
  readonly gridSize = signal(50);
  /** how close to its own grid point a piece has to be dropped to click into place, in percent of the grid size (0: never) */
  readonly snapPercent = signal(JigsawSettings.DEFAULT_SNAP_PERCENT);
  readonly levels = SNAP_LEVELS;
  readonly level = computed(() => snapLevelOf(this.snapPercent()));

  /** A difficulty was chosen: the snap range is set to it. */
  chooseLevel(key: string): void {
    const percent = snapPercentOf(key);
    if (percent !== null) this.snapPercent.set(percent);
  }
  /** how thick the frame around the picture area is, in pixels (0: none) */
  /** the line round each piece: how thick in pixels, and what colour (#rrggbb) */
  readonly lineWidth = signal(JigsawSettings.DEFAULT_LINE_WIDTH);
  readonly lineColor = signal(JigsawSettings.DEFAULT_LINE_COLOR);
  /** the background colour of the picture area (#rrggbb) */
  readonly backColor = signal(JigsawSettings.DEFAULT_BACK_COLOR);
  /** the thicknesses of the line to choose from, in words, and the one the line is closest to */

  readonly pieceInfo = computed(() => pieceGrid(this.width(), this.height(), this.gridSize()));

  /** the picture file that was chosen, and the cut of it that was found (with the shape of the picture area it was found for) */
  readonly file = signal<File | null>(null);
  readonly cut = signal<{ rect: SourceRect; shape: number } | null>(null);

  constructor() {
    effect(() => {
      if (this.askingName()) setTimeout(() => document.getElementById('jigsaw-name-ask')?.focus()); // the cursor is in the box
    });
    void this.loadOwners();
    if (this.editId) {
      void this.loadForEdit(this.editId);
      return;
    }
    // a new jigsaw starts with what was chosen for the last one, and what is chosen now is kept for the next
    const saved = readPreference<NewJigsawPreferences | null>(NEW_JIGSAW_KEY, null, (v): v is NewJigsawPreferences | null => v === null || isNewJigsawPreferences(v));
    if (saved) this.useDefaults(saved);
    effect(() => {
      const now: NewJigsawPreferences = {
        kind: this.kind(),
        size: this.sizeChoice(),
        width: this.asked().width,
        height: this.asked().height,
        pieces: this.pieceChoice(),
        pieceCount: this.pieceCount(),
        snapPercent: this.snapPercent(),
        timed: this.timed(),
        lineWidth: this.lineWidth(),
        lineColor: this.lineColor(),
        backColor: this.backColor(),
      };
      writePreference(NEW_JIGSAW_KEY, now);
    });
  }

  /** The form is filled in with what was chosen for the last jigsaw: the look, the difficulty and the clock, and the size and the number of pieces (worked out again, so they fit). */
  private useDefaults(saved: NewJigsawPreferences): void {
    this.kind.set(this.askedKind ?? saved.kind ?? 'picture');
    this.snapPercent.set(saved.snapPercent);
    this.timed.set(saved.timed);
    this.lineWidth.set(saved.lineWidth);
    this.lineColor.set(saved.lineColor.toLowerCase());
    this.backColor.set(saved.backColor.toLowerCase());
    this.asked.set({ width: saved.width, height: saved.height });
    this.width.set(saved.width);
    this.height.set(saved.height);
    this.sizeChoice.set(saved.size === 'custom' || this.sizePresets.some((p) => p.key === saved.size) ? saved.size : 'custom');
    this.pieceCount.set(saved.pieceCount);
    if (saved.pieces !== 'custom' && this.pieceOptions().some((o) => o.key === saved.pieces)) this.choosePieces(saved.pieces);
    else {
      this.pieceChoice.set('custom');
      this.relayout('pieces');
    }
  }

  /** The users the author is chosen from; a new jigsaw starts with the user who plays as its author. */
  private async loadOwners(): Promise<void> {
    try {
      this.owners.set(await this.users.list());
    } catch {
      this.error.set(tr('jigsawNew.couldNotReadUsers', 'Could not read the accounts: reload the page.'));
    }
    const me = this.users.user();
    if (!this.editId && me && !this.ownerUid()) this.ownerUid.set(me.id);
  }

  /** a small picture of the cut, as an address of the page (null: none yet) */
  readonly preview = signal<string | null>(null);
  readonly cropping = signal(false);
  /** the languages the name and the description can be written in (the AI writes them in the one chosen) */
  protected readonly languages = LANGUAGES;
  protected readonly motives = MOTIVES;
  /** the picture is shown big over the page */
  readonly enlarged = signal(false);

  readonly saving = signal(false);
  readonly error = signal('');

  readonly minSide = JIGSAW_MIN_SIDE;
  readonly maxSide = JIGSAW_MAX_SIDE;
  readonly maxName = JIGSAW_MAX_NAME;
  readonly maxDescription = JIGSAW_MAX_DESCRIPTION;
  /** the name or the description is being edited in place in the card (the others show the text with a pencil) */
  readonly editingName = signal(false);
  readonly editingDescription = signal(false);

  /** opens the editor of the name or of the description in the card and puts the cursor in it */
  edit(which: 'name' | 'description'): void {
    (which === 'name' ? this.editingName : this.editingDescription).set(true);
    setTimeout(() => document.getElementById(which === 'name' ? 'jigsaw-name' : 'jigsaw-description')?.focus());
  }

  /** the cut was found for another shape of picture area: the size changed since, so the picture has to be adjusted again */
  readonly stale = computed(() => {
    const c = this.cut();
    return !!c && Math.abs(c.shape - this.width() / this.height()) > 0.002;
  });

  /** the jigsaw as it will look on its page: the top of the page shows it while it is made (the same page as the one of a jigsaw, so it is familiar) */
  readonly draft = computed(() => ({ id: this.editId ?? '', ...this.settings() }) as JigsawSpec);

  /** a round of this jigsaw has been started (editing only): what every round shares is fixed */
  readonly played = signal(false);
  /** "Delete all rounds" was pressed and waits for "Yes" */
  readonly confirmingReset = signal(false);

  /** All the rounds are taken away (also other players'): the whole jigsaw can be changed now, and the form is open for all of it. */
  async resetRounds(): Promise<void> {
    if (!this.editId || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    try {
      await this.plays.removeAll(this.editId);
      this.played.set(false);
      this.confirmingReset.set(false);
    } catch {
      this.error.set(tr('jigsawPage.couldNotResetRounds', 'Could not take away the rounds: only its owner can.'));
      this.confirmingReset.set(false);
    } finally {
      this.saving.set(false);
    }
  }

  /** what the rounds of a played jigsaw share, as the jigsaw has it (the API refuses a change of them): sent back as it is */
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

  /** the settings as the API takes them (the store of the pieces is added when the picture is cut) */
  private settings(storeWidth?: number, name = this.name().trim()): JigsawInput {
    // a picture has no grid, store or difficulty of its own: each round has them
    const cutSettings = this.isPicture()
      ? { kind: 'picture' as const, gridSize: 0, gridVisible: false }
      : { gridSize: this.gridSize(), gridVisible: false, snapPercent: this.snapPercent(), ...(storeWidth ? { storeWidth } : {}) }; // the grid points were only for debugging: a new jigsaw does not show them
    const fixed = this.played() && this.original ? this.fixedFields(this.original) : null;
    return {
      name,
      ...(this.owner() ? { author: this.owner()!.name, ownerUid: this.owner()!.id } : this.ownerUid() ? { ownerUid: this.ownerUid() } : {}), // the API puts the name of the user in `author` itself
      ...(this.visibility() !== 'everyone' && this.ownerUid() ? { visibility: this.visibility() as 'owner' | 'hidden' } : {}),
      ...(this.timed() ? {} : { timed: false }), // timed is what none says
      ...(this.pictureNameOf() ? { pictureName: this.pictureNameOf() } : {}), // kept with the jigsaw as information
      ...(this.description().trim() ? { description: this.description().trim() } : {}),
      language: this.language(),
      ...(this.categories().length ? { categories: this.categories() } : {}),
      ...(JigsawMotives.is(this.motive()) ? { motive: this.motive() as MotiveLevel } : {}),
      ...(fixed ?? { width: this.width(), height: this.height(), ...cutSettings, placed: [] }),
      lineWidth: this.lineWidth(),
      lineColor: this.lineColor(),
      backColor: this.backColor(),
    };
  }

  /** why the settings are not allowed ('' when they are) */
  readonly problem = computed(() => new JigsawSettings(this.settings()).error());

  /** the name the AI replaces: the name of the picture file without its ending (a picture to analyse needs no name of its own yet) */
  private nameForAi(): string {
    return (this.name().trim() || this.pictureNameOf().replace(/\.[^.]*$/, '') || 'Picture').slice(0, JIGSAW_MAX_NAME);
  }

  /** the name is missing: said under the name field */
  readonly nameMissing = computed(() => !this.name().trim());

  /** what is wrong besides the name (a missing name is not a reason to turn Save away: it is asked for in a box when Save is pressed) */
  private readonly problemBesidesName = computed(() => new JigsawSettings(this.settings(undefined, this.name().trim() || this.nameForAi())).error());

  /** the problem for the box above the buttons: the missing name is already said under its own field */
  readonly otherProblem = computed(() => this.problemBesidesName());

  /** the box that asks for the name is open (Save was pressed with no name), and what is typed in it */
  readonly askingName = signal(false);
  readonly nameDraft = signal('');

  /** The name was given in the box: it is the name of the jigsaw, and the jigsaw is saved. */
  useName(): void {
    const given = this.nameDraft().trim().slice(0, JIGSAW_MAX_NAME);
    if (!given) return;
    this.name.set(given);
    this.askingName.set(false);
    void this.save();
  }

  /** the name of the picture file that is kept with the jigsaw: the chosen file's, or else the one the jigsaw had */
  private pictureNameOf(): string {
    return (this.file()?.name ?? this.original?.pictureName ?? '').trim().slice(0, JIGSAW_MAX_PICTURE_NAME);
  }

  /** the size or the cut into pieces is not what the jigsaw had when the edit began (editing only) */
  private readonly layoutChanged = computed(() => {
    const before = this.original;
    return !!before && (before.width !== this.width() || before.height !== this.height() || before.gridSize !== this.gridSize());
  });

  /**
   * A new jigsaw needs a picture with its cut. A jigsaw that is edited has them (its own picture is loaded), unless it was made without a picture: then it can still
   * be saved as long as the picture and the pieces are not touched (the settings, name and defaults change), and a picture is needed only to change those.
   */
  readonly canSave = computed(() => {
    if (this.saving() || this.problemBesidesName() || this.loading()) return false;
    if (!this.editId && !this.ownerUid()) return false; // a new jigsaw needs its author: a user
    if (this.file()) return !!this.cut() && !this.stale();
    return !!this.editId && !this.layoutChanged() && !this.pictureChanged();
  });

  /** "Save and analyse" is allowed without a name: the AI sets it (the settings are checked with the name of the picture file, which stands in until then) */
  readonly canAnalyse = computed(() => {
    if (this.editId || this.saving() || this.loading() || !this.ownerUid() || !this.file()) return false;
    return !new JigsawSettings(this.settings(undefined, this.nameForAi())).error() && !!this.cut() && !this.stale();
  });

  /** a jigsaw that is edited has no picture (it was made without one): said under the picture field */
  readonly lacksPicture = computed(() => !!this.editId && !this.loading() && !this.file());

  /**
   * The person gave a size or a number of pieces: the grid size is worked out from the number of pieces, and the picture area is made a whole number of pieces
   * wide and high (see `JigsawCut.layoutFor`). The number shown is the number of pieces that really comes out.
   */
  relayout(changed: 'width' | 'height' | 'pieces'): void {
    if (this.isPicture()) return this.asked.set({ width: this.width(), height: this.height() }); // a picture has no pieces: the sides are the ones typed
    // the sides as the person typed them, each on its own: not what the picture area was made last time (that is a little different when the pieces are whole squares)
    if (changed === 'width') this.asked.update((a) => ({ ...a, width: this.width() }));
    if (changed === 'height') this.asked.update((a) => ({ ...a, height: this.height() }));
    if (changed !== 'pieces' && this.pieceChoice() !== 'custom') return this.choosePiecesNear(); // a standard number stays a standard number of the new shape
    const asked = this.asked();
    this.applyLayout(JigsawCut.layoutFor(asked.width, asked.height, this.pieceCount()));
  }

  private applyLayout(layout: PieceLayout): void {
    this.width.set(layout.width);
    this.height.set(layout.height);
    this.gridSize.set(layout.grid);
    this.pieceCount.set(layout.columns * layout.rows);
  }

  /** The shape changed: the standard number of pieces nearest to the one there was is taken from the numbers of the new shape. */
  private choosePiecesNear(): void {
    const wanted = this.pieceCount();
    const options = this.pieceOptions();
    if (!options.length) return this.pieceChoice.set('custom');
    const near = options.reduce((best, o) => (Math.abs(o.count - wanted) < Math.abs(best.count - wanted) ? o : best));
    this.choosePieces(near.key);
  }

  /** A standard size was chosen: the picture area gets that shape, and the grid is worked out again for the number of pieces. */
  chooseSize(key: string): void {
    if (this.isPicture()) return this.choosePictureSize(key);
    this.sizeChoice.set(key);
    const preset = this.sizePresets.find((p) => p.key === key);
    if (!preset) return;
    this.asked.set({ width: preset.width, height: preset.height });
    this.width.set(preset.width);
    this.height.set(preset.height);
    if (this.pieceChoice() !== 'custom') return this.choosePiecesNear();
    this.relayout('pieces');
  }

  /** The size of a picture entry: the whole picture, or a shape (a standard one, or typed) that the picture is then cut to; there are no pieces to work out. */
  private choosePictureSize(key: string): void {
    this.sizeChoice.set(key);
    const file = this.file();
    if (key === 'whole') {
      if (file) void this.useWholePicture(file);
      return;
    }
    const preset = this.sizePresets.find((p) => p.key === key);
    if (!preset) return;
    this.asked.set({ width: preset.width, height: preset.height });
    this.width.set(preset.width);
    this.height.set(preset.height);
    if (file) this.cropping.set(true); // the shape changed: the picture is cut to it
  }

  /** A standard number of pieces was chosen (columns × rows): the picture area is made to fit exactly that many pieces. */
  choosePieces(value: string): void {
    this.pieceChoice.set(value);
    const option = this.pieceOptions().find((o) => o.key === value);
    if (!option) return;
    const asked = this.asked();
    this.applyLayout(JigsawCut.layoutOf(asked.width, asked.height, option.columns, option.rows));
  }

  /** A picture file was chosen: it is shown behind a frame of the shape of the picture area to find the cut. */
  choosePicture(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // so the same file can be chosen again
    if (!file) return;
    this.file.set(file);
    this.pictureChanged.set(true);
    this.cut.set(null);
    this.setPreview(null);
    if (this.isPicture()) return void this.useWholePicture(file); // a picture is the whole picture: no cut to find
    this.cropping.set(true);
  }

  /** The cut was found. */
  async useCut(rect: SourceRect): Promise<void> {
    this.cropping.set(false);
    this.pictureChanged.set(true);
    this.cut.set({ rect, shape: this.width() / this.height() });
    const file = this.file();
    if (!file) return;
    try {
      this.setPreview(URL.createObjectURL(await fitPicture(file, this.width(), this.height(), PREVIEW_BYTES, rect)));
    } catch {
      this.setPreview(null);
    }
  }

  private setPreview(address: string | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(address);
  }

  ngOnDestroy(): void {
    this.setPreview(null);
  }

  /** Fills the form with a jigsaw (not its picture). */
  private fill(item: JigsawSpec): void {
    this.kind.set(JigsawKinds.of(item));
    this.name.set(item.name);
    this.ownerUid.set(item.ownerUid ?? '');
    this.description.set(item.description ?? '');
    this.language.set(JigsawLanguages.of(item));
    this.categories.set(item.categories ?? []);
    this.motive.set(item.motive ?? '');
    this.visibility.set(item.visibility ?? 'everyone');
    this.timed.set(item.timed !== false);
    this.asked.set({ width: item.width, height: item.height });
    this.width.set(item.width);
    this.height.set(item.height);
    this.gridSize.set(item.gridSize);
    const grid = pieceGrid(item.width, item.height, item.gridSize);
    this.pieceCount.set(grid.columns * grid.rows);
    this.sizeChoice.set(this.sizePresets.find((p) => p.width === item.width && p.height === item.height)?.key ?? 'custom');
    const key = `${grid.columns}x${grid.rows}`;
    this.pieceChoice.set(this.pieceOptions().some((o) => o.key === key) ? key : 'custom');
    this.snapPercent.set(item.snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT);
    this.lineWidth.set(item.lineWidth ?? JigsawSettings.DEFAULT_LINE_WIDTH);
    this.lineColor.set(item.lineColor ?? JigsawSettings.DEFAULT_LINE_COLOR);
    this.backColor.set(item.backColor ?? JigsawSettings.DEFAULT_BACK_COLOR);
  }

  /** Fills the form with the jigsaw that is edited, and its picture (the picture is the cut one, so the example and the cut are as they were). */
  private async loadForEdit(id: string): Promise<void> {
    try {
      const item = await this.service.get(id);
      if (!item) return void (await this.router.navigate(['/'], { replaceUrl: true }));
      if (!item.ownerUid || (item.ownerUid !== this.users.user()?.id && !this.users.isAdmin())) return void (await this.router.navigate(['/jigsaw', id], { replaceUrl: true })); // only its owner (or an admin) edits a jigsaw, also by its address
      this.played.set(await this.plays.played(id)); // played: what the rounds share is fixed (see `fixedFields`)
      this.original = item;
      this.fill(item);
      const response = await fetch(this.images.url(item, 1));
      if (response.ok) {
        const blob = await response.blob();
        const bitmap = await createImageBitmap(blob);
        this.file.set(new File([blob], item.pictureName ?? 'picture', { type: blob.type }));
        this.cut.set({ rect: { x: 0, y: 0, w: bitmap.width, h: bitmap.height }, shape: item.width / item.height }); // the kept picture is already cut to the shape
        bitmap.close();
        this.setPreview(URL.createObjectURL(blob));
      }
    } catch {
      this.error.set(tr('jigsawNew.couldNotOpen', 'Could not open the jigsaw to edit: go back and try again.'));
    } finally {
      this.loading.set(false);
    }
  }

  /** Save the changes of a jigsaw: the settings; and when the picture or the cut into pieces changed, the picture and the pieces are made again. */
  private async saveEdit(file: File | null, cut: { rect: SourceRect; shape: number } | null): Promise<void> {
    const id = this.editId!;
    const before = this.original!;
    const kindChanged = JigsawKinds.of(before) !== this.kind();
    const recut = !this.isPicture() && !!file && !!cut && (this.pictureChanged() || this.layoutChanged() || kindChanged); // a picture is not cut: its rounds are
    this.error.set('');
    this.saving.set(true);
    try {
      if (this.isPicture()) {
        // only the picture itself is kept (a ready jigsaw that is made a picture loses its pieces on the server)
        const picture = file && cut && (this.pictureChanged() || kindChanged) ? await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut.rect) : null;
        await this.service.update(id, this.settings());
        if (picture) await this.images.upload(id, picture);
      } else if (!recut) {
        await this.service.update(id, this.settings(before.storeWidth));
      } else {
        const cutting = JigsawCut.cut(this.width(), this.height(), this.gridSize());
        if ('error' in cutting) throw new Error(cutting.error);
        const pieces = cutting.placed.flatMap((p) => JigsawPieces.of(p, cutting.columns) ?? []);
        const picture = await fitPicture(file!, this.width(), this.height(), MAX_PICTURE_BYTES, cut!.rect);
        await this.service.update(id, this.settings(cutting.storeWidth));
        await this.images.upload(id, picture);
        const address = URL.createObjectURL(picture);
        let graphics: Map<string, string>;
        try {
          graphics = await renderPieceGraphics(address, pieces, cutting.columns, cutting.rows, { width: this.lineWidth(), color: this.lineColor() });
        } finally {
          URL.revokeObjectURL(address);
        }
        await this.pieceApi.replace(id, pieces.map((p) => (graphics.has(p.id) ? { ...p, graphic: graphics.get(p.id) } : p)));
      }
      await this.router.navigate(['/jigsaw', id], { replaceUrl: true }); // the form is left out of the history: Back from the page does not come back to it
    } catch {
      this.error.set(tr('jigsawNew.couldNotSave', 'Could not save the changes: nobody may have started playing it in the meantime. Check the picture and try again.'));
      this.saving.set(false);
    }
  }

  /** the AI is looking at the picture of the jigsaw that was just made */
  readonly analysing = signal(false);

  /** Save: the jigsaw is made, its picture and pieces are kept, and its page is opened. With `analyse` the AI looks at the picture first and sets the categories, the motive difficulty, the name and the description, and the person stays in the form (now the edit form of the new jigsaw, with what the AI said in it) instead of going to its page. */
  async save(analyse = false): Promise<void> {
    const file = this.file();
    const cut = this.cut();
    if (!(analyse && !this.editId ? this.canAnalyse() : this.canSave())) return;
    if (!analyse && this.nameMissing()) {
      this.nameDraft.set(''); // no name: a box asks for it, and saves when it is given
      this.askingName.set(true);
      return;
    }
    if (this.editId) return this.saveEdit(file, cut);
    if (!file || !cut) return;
    this.error.set('');
    this.saving.set(true);
    // a picture is not cut here (each round cuts it as chosen): nothing but the picture is saved
    const cutting = this.isPicture() ? null : JigsawCut.cut(this.width(), this.height(), this.gridSize());
    if (cutting && 'error' in cutting) {
      this.error.set(cutting.error);
      this.saving.set(false);
      return;
    }
    const pieces = cutting && !('error' in cutting) ? cutting.placed.flatMap((p) => JigsawPieces.of(p, cutting.columns) ?? []) : [];
    let madeId: string | null = null;
    try {
      const picture = await fitPicture(file, this.width(), this.height(), MAX_PICTURE_BYTES, cut.rect); // cut to the shape of the picture area
      const made = await this.service.create(this.settings(cutting && !('error' in cutting) ? cutting.storeWidth : undefined, analyse ? this.nameForAi() : this.name().trim()));
      madeId = made.id;
      await this.images.upload(made.id, picture);
      if (cutting && !('error' in cutting)) {
        const address = URL.createObjectURL(picture);
        let graphics: Map<string, string>;
        try {
          graphics = await renderPieceGraphics(address, pieces, cutting.columns, cutting.rows, { width: this.lineWidth(), color: this.lineColor() });
        } finally {
          URL.revokeObjectURL(address);
        }
        await this.pieceApi.replace(made.id, pieces.map((p) => (graphics.has(p.id) ? { ...p, graphic: graphics.get(p.id) } : p)));
      }
      // the new jigsaw is only saved: no round is started, the person goes on to its page and starts one when they like
      if (analyse) {
        this.analysing.set(true);
        await this.service.classify(made.id, true).catch(() => null); // the jigsaw is made: when the AI cannot, the person can ask again with the AI link of the form
        // the person stays in the page: it is the edit form of the jigsaw that is made now, in place, with what the AI said in it, to look at and change (the address is changed to the one of the edit form without leaving)
        const fresh = (await this.service.get(made.id).catch(() => null)) ?? made;
        this.original = fresh;
        this.fill(fresh);
        this.pictureChanged.set(false);
        this.editIdState.set(made.id);
        this.location.replaceState(`/jigsaw/${made.id}/edit`);
        this.analysing.set(false);
        this.saving.set(false);
        return;
      }
      await this.router.navigate(['/jigsaw', made.id], { replaceUrl: true }); // the form is left out of the history
    } catch {
      if (madeId) await this.service.remove(madeId).catch(() => undefined); // nothing half made is left
      this.error.set(tr('jigsawNew.couldNotMake', 'Could not make the jigsaw. Nothing was saved: check the picture and try again.'));
      this.saving.set(false);
    }
  }
}

import { clockOf } from '../duration';
import { DatePipe, Location } from '@angular/common';
import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslocoDirective, provideTranslocoScope } from '@jsverse/transloco';
import { Autosave } from '../../core/autosave';
import { tr } from '../../core/i18n';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { PlaysService } from '../plays.service';
import { CANVAS_MAX_DESCRIPTION, CANVAS_MAX_NAME, CanvasArea, CanvasInput, CanvasSpec } from '../../models/shared/canvas';
import { pieceGrid } from '../../models/shared/jigsaw';
import { PlaySpec } from '../../models/shared/play';
import { JigsawUserSpec } from '../../models/shared/jigsaw-user';
import { LINE_LEVELS, lineLevelOf } from '../line-level';
import { snapLevelOfJigsaw } from '../snap-level';

/**
 * A jigsaw (`/jigsaw/:id`): its picture and what it is, and the games the user has played of it. A game is continued where it was left, or a new one is started
 * (the pieces are scattered again, and the old game stays in the list). The jigsaw can be edited here: its name, its author and its defaults (the difficulty and the look a
 * new game starts with). Its picture, size and pieces are fixed: every game of it shares them.
 */
@Component({
  selector: 'app-jigsaw-page',
  imports: [RouterLink, DatePipe, FormsModule, TranslocoDirective],
  providers: [provideTranslocoScope('jigsawPage'), provideTranslocoScope('jigsawLevels')],
  templateUrl: './jigsaw-page.html',
})
export class JigsawPage implements OnInit {
  /** a time played, as a clock (`12:34`) */
  protected readonly clock = clockOf;

  private readonly jigsaws = inject(JigsawService);
  private readonly plays = inject(PlaysService);
  private readonly images = inject(JigsawImageService);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  protected readonly users = inject(JigsawUserService);
  private readonly route = inject(ActivatedRoute);
  readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  readonly item = signal<CanvasSpec | null>(null);
  readonly games = signal<PlaySpec[]>([]);
  readonly hasPicture = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  /** Delete (the jigsaw) was pressed and waits for "Yes" */
  readonly confirmingDelete = signal(false);
  /** the game whose Delete button was pressed and waits for "Yes" */
  readonly confirmingId = signal<string | null>(null);
  readonly maxName = CANVAS_MAX_NAME;

  /** the edit form is open, and what is in it (it starts from the jigsaw as it is) */
  readonly editing = signal(false);
  readonly name = signal('');
  readonly owners = signal<JigsawUserSpec[]>([]);
  readonly ownerUid = signal('');
  /** the description in the edit form */
  readonly description = signal('');
  readonly maxDescription = CANVAS_MAX_DESCRIPTION;
  readonly visibility = signal<'everyone' | 'owner'>('everyone');
  readonly lineWidth = signal<number>(CanvasArea.DEFAULT_LINE_WIDTH);
  readonly lineColor = signal<string>(CanvasArea.DEFAULT_LINE_COLOR);
  readonly backColor = signal<string>(CanvasArea.DEFAULT_BACK_COLOR);
  /** the difficulty the jigsaw has (shown under its name and in the panel, where it cannot be changed) */
  readonly itemLevel = computed(() => snapLevelOfJigsaw(this.item() ?? {}));
  readonly lineLevels = LINE_LEVELS;
  readonly lineLevel = computed(() => lineLevelOf(this.lineWidth()));
  /** anyone has started a game of this jigsaw: its picture, size and pieces are then fixed */
  readonly played = signal(false);

  readonly pictureUrl = computed(() => this.images.url(this.id, 1));
  readonly pieces = computed(() => {
    const item = this.item();
    if (!item) return 0;
    const grid = pieceGrid(item.width, item.height, item.gridSize);
    return grid.columns * grid.rows;
  });

  async ngOnInit(): Promise<void> {
    try {
      const item = (await this.jigsaws.list()).find((c) => c.id === this.id);
      if (!item) return this.status.set('missing');
      this.item.set(item);
      const me = this.users.user();
      const all = await this.plays.list(this.id); // everyone's rounds: the ones of the user first, each newest first
      this.games.set([...all.filter((g) => g.userId === me?.id), ...all.filter((g) => g.userId !== me?.id)]);
      this.played.set(await this.plays.played(this.id));
      this.owners.set(await this.users.list().catch(() => []));
      this.status.set('ready');
      if (this.route.snapshot.queryParamMap.get('edit')) this.edit(); // the Edit button of the list opens the page with the form open
    } catch {
      this.status.set('failed');
    }
  }

  /** Back to the page the person came from; a page that was opened with nothing before it (a link, a new tab) goes to the list of the jigsaws instead. */
  back(): void {
    if (window.history.length > 1) this.location.back();
    else void this.router.navigate(['/jigsaw/list']);
  }

  /** the user may edit and delete the jigsaw: it is theirs (or it is one from before owners, which has none) */
  readonly mayChange = computed(() => {
    const owner = this.item()?.ownerUid;
    return !owner || owner === this.users.user()?.id;
  });

  /** The jigsaw is deleted for good (its pieces, picture and rounds go too), and the person goes to the list. */
  async deleteJigsaw(): Promise<void> {
    const me = this.users.user();
    if (!me || this.busy()) return;
    this.busy.set(true);
    try {
      await this.jigsaws.removeAs(this.id, me.id);
      await this.router.navigate(['/jigsaw/list']);
    } catch {
      this.error.set(tr('jigsawPage.couldNotDelete', 'Could not delete the jigsaw: only its owner can.'));
      this.confirmingDelete.set(false);
      this.busy.set(false);
    }
  }

  /** the round is the user's own (the others can be looked at, not changed) */
  isMine(game: PlaySpec): boolean {
    return game.userId === this.users.user()?.id;
  }

  /** Starts a new round and goes to it. */
  async play(): Promise<void> {
    const me = this.users.user();
    if (!me || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const game = await this.plays.start(this.id, me.id);
      await this.router.navigate(['/jigsaw', this.id, 'play', game.id]);
    } catch {
      this.error.set(tr('jigsawPage.couldNotStart', 'Could not start a round: try again.'));
      this.busy.set(false);
    }
  }

  async removeGame(game: PlaySpec): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.plays.remove(this.id, game.id);
      this.games.update((all) => all.filter((g) => g.id !== game.id));
    } catch {
      this.error.set(tr('jigsawPage.couldNotDeleteRound', 'Could not delete the round: try again.'));
    }
  }

  /**
   * What the edit panel holds, as the API takes it: the jigsaw keeps its picture, size, pieces and difficulty (the API refuses a change of them once it has been played) and has
   * the new name, description, author and look. null while there is no jigsaw.
   */
  private panelInput(): CanvasInput | null {
    const item = this.item();
    if (!item) return null;
    const owner = this.owners().find((u) => u.id === this.ownerUid()) ?? null;
    return {
      name: this.name().trim(),
      ...(owner ? { author: owner.name, ownerUid: owner.id } : item.author ? { author: item.author } : {}), // the API puts the name of the user in `author` itself
      ...(this.visibility() === 'owner' && (owner?.id ?? item.ownerUid) ? { visibility: 'owner' as const } : {}),
      ...(item.timed === false ? { timed: false } : {}), // the clock is fixed once somebody has started a round: it is sent back as it is
      ...(item.pictureName ? { pictureName: item.pictureName } : {}),
      ...(this.description().trim() ? { description: this.description().trim() } : {}),
      width: item.width,
      height: item.height,
      gridSize: item.gridSize,
      gridVisible: item.gridVisible,
      placed: item.placed,
      ...(item.storeWidth ? { storeWidth: item.storeWidth } : {}),
      ...(item.snapPercent !== undefined ? { snapPercent: item.snapPercent } : {}), // the difficulty is fixed once somebody has started a round: it is sent back as it is
      lineWidth: this.lineWidth(),
      lineColor: this.lineColor(),
      backColor: this.backColor(),
    };
  }

  /** What is changed in the panel is saved by itself, a pause after the last change; nothing is saved while the name is empty. */
  private readonly autosave = new Autosave<CanvasInput | null, CanvasSpec>({
    input: () => this.panelInput(),
    invalid: () => (!this.item() || !this.name().trim() ? 'name' : ''),
    create: () => Promise.reject(new Error('A jigsaw is made on the page for a new one.')),
    update: (id, input) => this.jigsaws.update(id, input!),
    saved: (saved) => this.item.set(saved),
  });
  readonly saveState = this.autosave.state;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.autosave.destroy()); // a change that is still waiting is saved when the page is left
  }

  /** The owner presses "Add a description": the edit opens (the panel of a played jigsaw, else the form of the jigsaw) and the cursor goes to the description. */
  addDescription(): void {
    if (!this.editing()) this.edit();
    setTimeout(() => document.getElementById('edit-description')?.focus());
  }

  /** The edit panel is opened, with the jigsaw as it is; pressing Edit again closes it. */
  toggleEdit(): void {
    if (this.editing()) this.editing.set(false);
    else this.edit();
  }

  /** The edit form is opened, with the jigsaw as it is. */
  edit(): void {
    const item = this.item();
    if (!item || !this.mayChange()) return; // a link that opens the form (`?edit=1`) does not open it for somebody who is not the owner
    // nobody has played it: the whole jigsaw can be edited, with the form of a new one
    if (!this.played()) {
      void this.router.navigate(['/jigsaw', this.id, 'edit']);
      return;
    }
    this.name.set(item.name);
    this.description.set(item.description ?? '');
    this.ownerUid.set(item.ownerUid ?? '');
    this.visibility.set(item.visibility ?? 'everyone');
    this.lineWidth.set(item.lineWidth ?? CanvasArea.DEFAULT_LINE_WIDTH);
    this.lineColor.set(item.lineColor ?? CanvasArea.DEFAULT_LINE_COLOR);
    this.backColor.set(item.backColor ?? CanvasArea.DEFAULT_BACK_COLOR);
    this.error.set('');
    this.editing.set(true);
    this.autosave.markSaved(item.id); // what is open is what is saved: only a change after this is saved
  }
}

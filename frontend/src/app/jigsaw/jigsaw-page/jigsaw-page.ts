import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { JigsawImageService } from '../jigsaw-image.service';
import { JigsawUserService } from '../jigsaw-user.service';
import { JigsawService } from '../jigsaw.service';
import { PlaysService } from '../plays.service';
import { CANVAS_MAX_NAME, CanvasInput, CanvasSpec } from '../../models/shared/canvas';
import { pieceGrid } from '../../models/shared/jigsaw';
import { PlaySpec } from '../../models/shared/play';
import { JigsawUserSpec } from '../../models/shared/jigsaw-user';
import { CanvasArea } from '../../models/shared/canvas';
import { LINE_LEVELS, lineLevelOf } from '../line-level';
import { SNAP_LEVELS, snapLevelOf, snapPercentOf } from '../snap-level';

/**
 * A jigsaw (`/jigsaw/:id`): its picture and what it is, and the games the user has played of it. A game is continued where it was left, or a new one is started
 * (the pieces are scattered again, and the old game stays in the list). The jigsaw can be edited here: its name, its author and its defaults (the difficulty and the look a
 * new game starts with). Its picture, size and pieces are fixed: every game of it shares them.
 */
@Component({
  selector: 'app-jigsaw-page',
  imports: [RouterLink, DatePipe, FormsModule],
  templateUrl: './jigsaw-page.html',
})
export class JigsawPage implements OnInit {
  private readonly jigsaws = inject(JigsawService);
  private readonly plays = inject(PlaysService);
  private readonly images = inject(JigsawImageService);
  private readonly router = inject(Router);
  protected readonly users = inject(JigsawUserService);
  private readonly route = inject(ActivatedRoute);
  readonly id = this.route.snapshot.paramMap.get('id') ?? '';

  readonly status = signal<'loading' | 'ready' | 'missing' | 'failed'>('loading');
  readonly item = signal<CanvasSpec | null>(null);
  readonly games = signal<PlaySpec[]>([]);
  readonly hasPicture = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  /** the game whose Delete button was pressed and waits for "Yes" */
  readonly confirmingId = signal<string | null>(null);
  readonly maxName = CANVAS_MAX_NAME;

  /** the edit form is open, and what is in it (it starts from the jigsaw as it is) */
  readonly editing = signal(false);
  readonly name = signal('');
  readonly owners = signal<JigsawUserSpec[]>([]);
  readonly ownerUid = signal('');
  readonly snapPercent = signal<number>(CanvasArea.DEFAULT_SNAP_PERCENT);
  readonly lineWidth = signal<number>(CanvasArea.DEFAULT_LINE_WIDTH);
  readonly lineColor = signal<string>(CanvasArea.DEFAULT_LINE_COLOR);
  readonly backColor = signal<string>(CanvasArea.DEFAULT_BACK_COLOR);
  readonly levels = SNAP_LEVELS;
  readonly level = computed(() => snapLevelOf(this.snapPercent()));
  readonly lineLevels = LINE_LEVELS;
  readonly lineLevel = computed(() => lineLevelOf(this.lineWidth()));
  readonly saving = signal(false);
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
      this.error.set('Could not start a round: try again.');
      this.busy.set(false);
    }
  }

  async removeGame(game: PlaySpec): Promise<void> {
    this.confirmingId.set(null);
    try {
      await this.plays.remove(this.id, game.id);
      this.games.update((all) => all.filter((g) => g.id !== game.id));
    } catch {
      this.error.set('Could not delete the round: try again.');
    }
  }

  /** The edit form is opened, with the jigsaw as it is. */
  edit(): void {
    const item = this.item();
    if (!item) return;
    // nobody has played it: the whole jigsaw can be edited, with the form of a new one
    if (!this.played()) {
      void this.router.navigate(['/jigsaw', this.id, 'edit']);
      return;
    }
    this.name.set(item.name);
    this.ownerUid.set(item.ownerUid ?? '');
    this.snapPercent.set(item.snapPercent ?? CanvasArea.DEFAULT_SNAP_PERCENT);
    this.lineWidth.set(item.lineWidth ?? CanvasArea.DEFAULT_LINE_WIDTH);
    this.lineColor.set(item.lineColor ?? CanvasArea.DEFAULT_LINE_COLOR);
    this.backColor.set(item.backColor ?? CanvasArea.DEFAULT_BACK_COLOR);
    this.error.set('');
    this.editing.set(true);
  }

  chooseLevel(key: string): void {
    const percent = snapPercentOf(key);
    if (percent !== null) this.snapPercent.set(percent);
  }

  /** The edit is saved: the jigsaw keeps its picture, size and pieces (the API refuses a change of them once it has been played) and has the new name, author and defaults. */
  async save(): Promise<void> {
    const item = this.item();
    const name = this.name().trim();
    if (!item || !name || this.saving()) return;
    const owner = this.owners().find((u) => u.id === this.ownerUid()) ?? null;
    const input: CanvasInput = {
      name,
      ...(owner ? { author: owner.name, ownerUid: owner.id } : item.author ? { author: item.author } : {}), // the API puts the name of the user in `author` itself
      ...(item.pictureName ? { pictureName: item.pictureName } : {}),
      width: item.width,
      height: item.height,
      gridSize: item.gridSize,
      gridVisible: item.gridVisible,
      placed: item.placed,
      ...(item.storeWidth ? { storeWidth: item.storeWidth } : {}),
      snapPercent: this.snapPercent(),
      lineWidth: this.lineWidth(),
      lineColor: this.lineColor(),
      backColor: this.backColor(),
    };
    this.saving.set(true);
    this.error.set('');
    try {
      this.item.set(await this.jigsaws.update(item.id, input));
      this.editing.set(false);
    } catch {
      this.error.set('Could not save the changes: try again.');
    } finally {
      this.saving.set(false);
    }
  }
}

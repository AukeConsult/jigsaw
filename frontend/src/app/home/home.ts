import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { Autosave } from '../core/autosave';
import { CanvasBoard } from '../canvas-board/canvas-board';
import { CanvasPanel } from '../canvas-panel/canvas-panel';
import { CanvasListService } from '../core/canvas-list.service';
import { CanvasObjectsService } from '../core/canvas-objects.service';
import { JigsawService } from '../core/jigsaw.service';
import { ObjectPalette } from '../object-palette/object-palette';
import { CANVAS_DEFAULT_GRID, CanvasArea, CanvasInput, CanvasSpec } from '../models/shared/canvas';
import { CanvasObject } from '../models/shared/canvas-object';
import { PlacedObject } from '../models/shared/placed';

/**
 * The canvas page (also the jigsaw page, which keeps its canvases in another collection): three parts side by side, the panel (the settings and the saved canvases), the board (the canvas with its objects) and the
 * palette (the objects to drag in). The page holds the open canvas (its settings and its placed objects), saves the changes by themselves, and
 * opens, starts and deletes saved canvases; each part works on what it is given.
 */
@Component({
  selector: 'app-home',
  imports: [TranslocoDirective, CanvasPanel, CanvasBoard, ObjectPalette],
  templateUrl: './home.html',
})
export class Home implements OnInit, OnDestroy {
  /** what the route says: the page's heading and where its canvases are kept (`canvas-list`, or `jigsaw`); the page works the same on both */
  private readonly route = inject(ActivatedRoute).snapshot.data as { heading?: string; collection?: string; frameDots?: boolean };
  readonly heading = this.route.heading ?? 'Canvas';
  /** whether the grid points on the outer frame of the canvas are drawn (not on the jigsaw) */
  readonly frameDots = this.route.frameDots ?? true;
  private readonly canvasList = inject(CanvasListService);
  private readonly jigsaw = inject(JigsawService);
  private readonly service = this.route.collection === 'jigsaw' ? this.jigsaw : this.canvasList;
  private readonly objectsService = inject(CanvasObjectsService);

  // the open canvas
  readonly name = signal('Untitled');
  readonly width = signal(800);
  readonly height = signal(600);
  readonly gridSize = signal(CANVAS_DEFAULT_GRID);
  readonly gridVisible = signal(true);
  /** the canvas objects placed on the canvas (as they are stored) */
  readonly placed = signal<PlacedObject[]>([]);

  /** the canvas objects that can be put on the canvas */
  readonly objects = signal<CanvasObject[]>([]);
  readonly objectsFailed = signal(false);

  readonly saved = signal<CanvasSpec[]>([]);
  readonly message = signal<{ kind: 'success' | 'danger'; text: string } | null>(null);

  /** why the current name and size cannot be saved ('' when they can) */
  readonly error = computed(() => new CanvasArea(this.input()).error());

  /** the changes of the open canvas are saved by themselves (a new canvas is created by its first change) */
  private readonly autosave = new Autosave<CanvasInput, CanvasSpec>({
    input: () => this.input(),
    invalid: () => this.error(),
    create: (input) => this.service.create(input),
    update: (id, input) => this.service.update(id, input),
    saved: (item) => this.saved.update((list) => (list.some((c) => c.id === item.id) ? list.map((c) => (c.id === item.id ? item : c)) : [item, ...list])),
  });
  readonly currentId = this.autosave.currentId;
  readonly saveState = this.autosave.state;

  /** the settings of the open canvas, as the API takes them */
  private input(): CanvasInput {
    return { name: this.name().trim(), width: this.width(), height: this.height(), gridSize: this.gridSize(), gridVisible: this.gridVisible(), placed: this.placed() };
  }

  async ngOnInit(): Promise<void> {
    this.objectsService.list().then((list) => this.objects.set(list), () => this.objectsFailed.set(true));
    try {
      this.saved.set(await this.service.list());
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not load the saved canvases.' });
    }
  }

  ngOnDestroy(): void {
    this.autosave.destroy();
  }

  /** what the board tells: why an object could not be put there ('' when there is nothing to tell) */
  tell(notice: string): void {
    this.message.set(notice ? { kind: 'danger', text: notice } : null);
  }

  async removeCanvas(item: CanvasSpec): Promise<void> {
    try {
      await this.service.remove(item.id);
      this.saved.update((list) => list.filter((c) => c.id !== item.id));
      if (this.currentId() === item.id) this.autosave.markSaved(null); // the open canvas is gone: what is on the page is a new one, saved when it changes
      this.message.set({ kind: 'success', text: `Deleted "${item.name}".` });
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not delete the canvas.' });
    }
  }

  /** a new, empty canvas (the one that was open has been saved by itself) */
  newCanvas(): void {
    this.name.set('Untitled');
    this.width.set(800);
    this.height.set(600);
    this.gridSize.set(CANVAS_DEFAULT_GRID);
    this.gridVisible.set(true);
    this.placed.set([]);
    this.message.set(null);
    this.autosave.markSaved(null);
  }

  open(item: CanvasSpec): void {
    this.placed.set(item.placed);
    this.name.set(item.name);
    this.width.set(item.width);
    this.height.set(item.height);
    this.gridSize.set(item.gridSize);
    this.gridVisible.set(item.gridVisible);
    this.message.set(null);
    this.autosave.markSaved(item.id); // opening is not a change
  }
}

import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Autosave } from '../../core/autosave';
import { CanvasObjectsService } from '../canvas-objects.service';
import { CanvasShape } from '../canvas-shape/canvas-shape';
import { ObjectPanel } from '../object-panel/object-panel';
import { CanvasBaseObject, CanvasObject, CanvasObjectInput, DEFAULT_OBJECT, EQUAL_SIDE_SHAPES, OBJECT_MIN_SIDE } from '../../models/shared/canvas-object';

/** The page where canvas objects (square, circle, triangle, histogram) are made and saved. */
@Component({
  selector: 'app-objects',
  imports: [CanvasShape, ObjectPanel],
  templateUrl: './objects.html',
})
export class Objects implements OnInit, OnDestroy {
  private readonly service = inject(CanvasObjectsService);

  readonly draft = signal<CanvasObjectInput>({ ...DEFAULT_OBJECT });
  readonly saved = signal<CanvasObject[]>([]);
  readonly message = signal<{ kind: 'success' | 'danger'; text: string } | null>(null);

  readonly error = computed(() => CanvasBaseObject.of(this.draft()).error());

  /** the changes of the open object are saved by themselves (a new object is created by its first change) */
  private readonly autosave = new Autosave<CanvasObjectInput, CanvasObject>({
    input: () => ({ ...this.draft(), name: this.draft().name.trim() }),
    invalid: () => this.error(),
    create: (input) => this.service.create(input),
    update: (id, input) => this.service.update(id, input),
    saved: (item) => this.saved.update((list) => (list.some((o) => o.id === item.id) ? list.map((o) => (o.id === item.id ? item : o)) : [item, ...list])),
  });
  readonly currentId = this.autosave.currentId;
  readonly saveState = this.autosave.state;
  /** a square and a circle have one size, the others a width and a height */
  readonly equalSides = computed(() => EQUAL_SIDE_SHAPES.includes(this.draft().shape));

  /** where the object is drawn on the drawing area (its top-left corner, in pixels of the area) */
  readonly origin = signal({ x: 20, y: 20 });
  private dragStart: { x: number; y: number } | null = null;

  /** the pointer position inside the drawing area (held at its edges) */
  private point(event: PointerEvent): { x: number; y: number } {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
    const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
    return { x, y };
  }

  startDraw(event: PointerEvent): void {
    this.dragStart = this.point(event);
    try {
      (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); // keep getting moves when the pointer leaves the area
    } catch {
      /* not an active pointer: the moves are still received while it is over the area */
    }
    this.origin.set({ x: Math.round(this.dragStart.x), y: Math.round(this.dragStart.y) });
  }

  /** drag from one corner to the opposite corner: that rectangle is the size of the object (equal sides: the longer side) */
  moveDraw(event: PointerEvent): void {
    const start = this.dragStart;
    if (!start) return;
    const now = this.point(event);
    const dx = now.x - start.x;
    const dy = now.y - start.y;
    let width = Math.max(OBJECT_MIN_SIDE, Math.round(Math.abs(dx)));
    let height = Math.max(OBJECT_MIN_SIDE, Math.round(Math.abs(dy)));
    if (this.equalSides()) width = height = Math.max(width, height);
    const line = this.draft().kind === 'connector' && this.draft().arrowStyle === 'solid';
    if (line) height = this.draft().height; // a solid arrow is drawn by its length: the thickness stays (a hollow arrow is drawn by both sides)
    this.origin.set({ x: Math.round(dx < 0 ? start.x - width : start.x), y: Math.round(dy < 0 ? start.y - height : start.y) });
    this.draft.update((d) => ({ ...d, width, height }));
  }

  endDraw(): void {
    this.dragStart = null;
  }

  async ngOnInit(): Promise<void> {
    try {
      this.saved.set(await this.service.list());
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not load the saved objects.' });
    }
  }

  open(item: CanvasObject): void {
    const { id: _id, createdAt: _createdAt, ...input } = item;
    this.draft.set(input);
    this.message.set(null);
    this.autosave.markSaved(item.id); // opening is not a change
  }

  /** a new object from the defaults (the one that was open has been saved by itself) */
  newObject(): void {
    this.draft.set({ ...DEFAULT_OBJECT });
    this.origin.set({ x: 20, y: 20 });
    this.message.set(null);
    this.autosave.markSaved(null);
  }

  ngOnDestroy(): void {
    this.autosave.destroy();
  }

  /** the saved object whose Delete button was pressed and waits for "Yes" (deleting is for good) */
  readonly confirmingId = signal<string | null>(null);

  async remove(item: CanvasObject): Promise<void> {
    try {
      await this.service.remove(item.id);
      this.saved.update((list) => list.filter((o) => o.id !== item.id));
      if (this.currentId() === item.id) this.autosave.markSaved(null); // the open object is gone: what is on the page is a new one
      this.message.set({ kind: 'success', text: `Deleted "${item.name}".` });
    } catch {
      this.message.set({ kind: 'danger', text: 'Could not delete the object.' });
    } finally {
      this.confirmingId.set(null);
    }
  }
}

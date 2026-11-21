import { Component, computed, input, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SaveState } from '../../core/autosave';
import {
  ARROW_STYLES,
  ARROW_TYPES,
  ArrowStyle,
  CANVAS_SHAPES,
  CanvasObjectInput,
  DEFAULT_CONNECTOR,
  DEFAULT_OBJECT,
  EQUAL_SIDE_SHAPES,
  OBJECT_KINDS,
  OBJECT_MAX_BORDER,
  OBJECT_MAX_FONT,
  OBJECT_MAX_NAME,
  OBJECT_MAX_RADIUS,
  OBJECT_MAX_SIDE,
  OBJECT_MIN_FONT,
  OBJECT_MIN_SIDE,
  ObjectKind,
} from '../../models/shared/canvas-object';

/** the height a hollow arrow starts with when a solid one is changed to it */
const HOLLOW_ARROW_HEIGHT = 40;

/**
 * The settings of one canvas object (a figure or a connector) and how they are saved. The settings are two-way bound to the page, which saves
 * them; the form knows what changing one setting does to the others (another kind starts from its defaults, a square keeps equal sides, a
 * hollow arrow has a height of its own).
 */
@Component({
  selector: 'app-object-panel',
  imports: [FormsModule],
  templateUrl: './object-panel.html',
})
export class ObjectPanel {
  readonly draft = model.required<CanvasObjectInput>();

  /** why the settings are not allowed ('' when they are) */
  readonly error = input('');
  /** how the changes are being saved, and the saved object that is open (null for a new one) */
  readonly saveState = input<SaveState>('idle');
  readonly currentId = input<string | null>(null);
  /** something to tell the person (an object was deleted, something could not be done) */
  readonly message = input<{ kind: 'success' | 'danger'; text: string } | null>(null);

  readonly newObject = output<void>();
  /** another kind was chosen: the object is a new one from the defaults of that kind */
  readonly kindChanged = output<void>();

  readonly shapes = CANVAS_SHAPES;
  readonly kinds = OBJECT_KINDS;
  readonly arrows = ARROW_TYPES;
  readonly arrowStyles = ARROW_STYLES;
  readonly minSide = OBJECT_MIN_SIDE;
  readonly maxSide = OBJECT_MAX_SIDE;
  readonly maxBorder = OBJECT_MAX_BORDER;
  readonly maxName = OBJECT_MAX_NAME;
  readonly maxRadius = OBJECT_MAX_RADIUS;
  readonly minFont = OBJECT_MIN_FONT;
  readonly maxFont = OBJECT_MAX_FONT;

  /** a square and a circle have one size, the others a width and a height */
  readonly equalSides = computed(() => EQUAL_SIDE_SHAPES.includes(this.draft().shape));

  set<K extends keyof CanvasObjectInput>(key: K, value: CanvasObjectInput[K]): void {
    this.draft.update((d) => ({ ...d, [key]: value }));
  }

  /** A figure and a connector have different settings: the other kind starts from its defaults (the name and the colour stay). */
  setKind(kind: ObjectKind): void {
    this.draft.update((d) => {
      const base = kind === 'connector' ? DEFAULT_CONNECTOR : DEFAULT_OBJECT;
      const other = kind === 'connector' ? DEFAULT_OBJECT : DEFAULT_CONNECTOR;
      return { ...base, name: d.name === other.name ? base.name : d.name, borderColor: d.borderColor };
    });
    this.kindChanged.emit();
  }

  /** the thickness of a solid arrow is its border and its height; a hollow arrow keeps its height, the border is the outline */
  setThickness(thickness: number): void {
    this.draft.update((d) => ({ ...d, borderWidth: thickness, height: d.arrowStyle === 'hollow' ? d.height : thickness }));
  }

  /** A hollow arrow has a size of its own (the thickness of a solid one is only a line): it starts from a size, a solid one from its thickness. */
  setArrowStyle(style: ArrowStyle): void {
    this.draft.update((d) => ({ ...d, arrowStyle: style, height: style === 'hollow' ? Math.max(d.borderWidth * 6, HOLLOW_ARROW_HEIGHT) : d.borderWidth }));
  }

  setShape(shape: CanvasObjectInput['shape']): void {
    this.draft.update((d) => ({ ...d, shape, height: EQUAL_SIDE_SHAPES.includes(shape) ? d.width : d.height }));
  }

  /** the width; for a square and a circle the height follows */
  setWidth(width: number): void {
    this.draft.update((d) => ({ ...d, width, height: EQUAL_SIDE_SHAPES.includes(d.shape) ? width : d.height }));
  }
}

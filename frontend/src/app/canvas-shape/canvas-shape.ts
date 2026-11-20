import { Component, computed, input } from '@angular/core';
import { CanvasBaseObject, CanvasObjectInput } from '../models/shared/canvas-object';
import { Point, QuadraticCurve } from '../models/shared/geometry';

/** The bars drawn in a histogram (fractions of its height): an example, the real data comes later. */
const SAMPLE_BARS = [0.45, 0.8, 0.6, 0.95, 0.7];

/** Draws a canvas object (square, circle, triangle or histogram) as an SVG, at its own pixel size scaled down to fit the space. */
@Component({
  selector: 'app-canvas-shape',
  templateUrl: './canvas-shape.html',
})
export class CanvasShape {
  readonly object = input.required<CanvasObjectInput>();
  /** the longest side the drawing may have on the page, in pixels (the shape is only scaled down) */
  readonly maxSide = input(240);
  /** how far the middle of the arrow is from the straight line between its ends, to the side, in pixels (0: straight; only an arrow can be bent) */
  readonly bend = input(0);

  /**
   * A bent arrow: the curve it follows in the box of the arrow (its ends in the middle of the left and right sides, its middle `bend` pixels to the side),
   * and what is drawn along it: a line with a head at the end (and at the start when it points both ways), or the outline of a block arrow. Null when
   * the arrow is straight (then it is drawn as before).
   */
  readonly curved = computed(() => {
    const o = this.object();
    const bend = this.bend();
    if (o.kind !== 'connector' || !bend) return null;
    const { w, h } = this.box();
    // the middle of the curve is `bend` to the side, so the control point is twice as far
    const curve = new QuadraticCurve({ x: 0, y: h / 2 }, { x: w / 2, y: h / 2 + 2 * bend }, { x: w, y: h / 2 });
    const length = curve.length();
    const both = o.arrow === 'both-ways';
    return o.arrowStyle === 'hollow'
      ? { solid: null, outline: this.curvedBlockArrow(curve, length, o.borderWidth, h, both) }
      : { solid: this.curvedLine(curve, length, o.borderWidth, both), outline: null };
  });

  private polygon(list: Point[]): string {
    return list.map((p) => `${p.x},${p.y}`).join(' ');
  }

  /** a triangle head with its tip at `tip` and its base across the direction from `base` to the tip, `half` to each side */
  private head(tip: Point, base: Point, half: number): string {
    const length = Math.hypot(tip.x - base.x, tip.y - base.y) || 1;
    const u = { x: (tip.x - base.x) / length, y: (tip.y - base.y) / length };
    return this.polygon([tip, { x: base.x - u.y * half, y: base.y + u.x * half }, { x: base.x + u.y * half, y: base.y - u.x * half }]);
  }

  /** a bent solid arrow: the line (the part of the curve between the heads) and the heads, as long and as wide as on a straight arrow */
  private curvedLine(curve: QuadraticCurve, length: number, border: number, both: boolean) {
    const headLength = Math.min(length / 2, Math.max(10, border * 4));
    const half = Math.max(5, border * 2);
    const t = Math.min(0.45, headLength / length); // how far along the curve a head reaches (measured as a share of it)
    const part = curve.part(both ? t : 0, 1 - t);
    return {
      d: `M ${part.start.x},${part.start.y} Q ${part.control.x},${part.control.y} ${part.end.x},${part.end.y}`,
      end: this.head(curve.end, part.end, half),
      start: both ? this.head(curve.start, part.start, half) : '',
    };
  }

  /** a bent hollow arrow: the outline of a block arrow along the curve (a shaft two fifths of the height, a head across the whole height) */
  private curvedBlockArrow(curve: QuadraticCurve, length: number, border: number, h: number, both: boolean): string {
    const p = border / 2;
    const across = h - 2 * p;
    const shaft = across * 0.2; // half the height of the shaft
    const t = Math.min(0.45, Math.min(length / 2, across) / length);
    const from = both ? t : 0;
    const to = 1 - t;
    const side = (s: number) => (k: number) => {
      const at = from + ((to - from) * k) / 24;
      const point = curve.at(at);
      const n = curve.normal(at);
      return { x: point.x + n.x * s, y: point.y + n.y * s };
    };
    const left = Array.from({ length: 25 }, (_, k) => side(shaft)(k));
    const right = Array.from({ length: 25 }, (_, k) => side(-shaft)(k)).reverse();
    const edge = (at: number, s: number): Point => ({ x: curve.at(at).x + curve.normal(at).x * s, y: curve.at(at).y + curve.normal(at).y * s });
    const outline = [...left, edge(to, across / 2), curve.end, edge(to, -across / 2), ...right];
    if (both) outline.push(edge(from, -across / 2), curve.start, edge(from, across / 2));
    return this.polygon(outline);
  }

  /** draw the connection points (8 around a figure, 2 at the ends of a connector) */
  readonly showPoints = input(false);
  /** the ids of the connection points that something is fastened to: they are always drawn, as a point in a point */
  readonly boundPoints = input<readonly string[]>([]);

  /** the arrowheads of a connector (at the end; both ways: at the start too) as triangle points, and where the line itself starts and ends so it does not poke out of a head */
  readonly arrow = computed(() => {
    const o = this.object();
    const { w, h } = this.box();
    const length = Math.min(w / 2, Math.max(10, o.borderWidth * 4)); // how long a head is
    const half = Math.max(5, o.borderWidth * 2); // half of how wide it is
    const y = h / 2;
    const both = o.arrow === 'both-ways';
    return {
      hollow: o.arrowStyle === 'hollow',
      outline: this.blockArrow(w, h, o.borderWidth, both),
      lineStart: both ? length : 0,
      lineEnd: w - length,
      end: `${w},${y} ${w - length},${y - half} ${w - length},${y + half}`,
      start: both ? `0,${y} ${length},${y - half} ${length},${y + half}` : '',
    };
  });

  /**
   * A hollow arrow: the outline of a block arrow (a shaft with a triangle head at the end, and at the start too when it points both ways) in a
   * box of the whole size, moved in by half the border so the outline stays inside. The shaft is two fifths of the height, a head is as long as
   * the arrow is high (at most half of the length).
   */
  private blockArrow(w: number, h: number, border: number, both: boolean): string {
    const p = border / 2;
    const top = p;
    const bottom = h - p;
    const mid = h / 2;
    const shaft = (bottom - top) * 0.2; // half the height of the shaft
    const head = Math.max(0, Math.min((w - 2 * p) / 2, bottom - top));
    const left = p;
    const right = w - p;
    const points = both
      ? [
          [left + head, mid - shaft], [right - head, mid - shaft], [right - head, top], [right, mid],
          [right - head, bottom], [right - head, mid + shaft], [left + head, mid + shaft], [left + head, bottom],
          [left, mid], [left + head, top],
        ]
      : [
          [left, mid - shaft], [right - head, mid - shaft], [right - head, top], [right, mid],
          [right - head, bottom], [right - head, mid + shaft], [left, mid + shaft],
        ];
    return points.map(([x, y]) => `${x},${y}`).join(' ');
  }

  readonly points = computed(() => CanvasBaseObject.of(this.object()).connectionPoints());

  /** the radius of a connection point in the drawing's own pixels: about 4 pixels on the screen, whatever the scale */
  readonly pointRadius = computed(() => {
    const { w, shownW } = this.box();
    return 4 * (w / Math.max(shownW, 1));
  });

  /** the border is drawn inside the shape, so the viewBox is the shape's own size */
  readonly box = computed(() => {
    const o = this.object();
    const scale = Math.min(1, this.maxSide() / Math.max(o.width, o.height));
    return { w: o.width, h: o.height, shownW: o.width * scale, shownH: o.height * scale };
  });

  /** the shape moved in by half the border, so the whole border stays inside the viewBox */
  readonly inset = computed(() => this.object().borderWidth / 2);

  /** the corner radius of a rectangle, never more than half of its (drawn) sides */
  readonly radius = computed(() => {
    const { w, h } = this.box();
    const b = this.object().borderWidth;
    return Math.max(0, Math.min(this.object().cornerRadius, (w - b) / 2, (h - b) / 2));
  });

  /** the triangle as a path whose three corners are rounded by `cornerRadius` (a quadratic curve through each corner) */
  readonly triangle = computed(() => {
    const { w, h } = this.box();
    // the points are pulled in a little so the pointed corners of the border do not leave the viewBox
    const pad = this.object().borderWidth;
    const corners = [
      { x: w / 2, y: pad },
      { x: w - pad, y: h - pad },
      { x: pad, y: h - pad },
    ];
    const r = this.object().cornerRadius;
    const toward = (from: { x: number; y: number }, to: { x: number; y: number }, distance: number) => {
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const t = Math.min(distance, length / 2) / length; // never past the middle of an edge
      return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
    };
    return (
      corners
        .map((corner, i) => {
          const before = corners[(i + 2) % 3];
          const after = corners[(i + 1) % 3];
          const a = toward(corner, before, r);
          const c = toward(corner, after, r);
          return `${i === 0 ? 'M' : 'L'}${a.x},${a.y} Q${corner.x},${corner.y} ${c.x},${c.y}`;
        })
        .join(' ') + ' Z'
    );
  });

  readonly bars = computed(() => {
    const { w, h } = this.box();
    const b = this.object().borderWidth;
    const innerW = w - 2 * b;
    const innerH = h - 2 * b;
    const slot = innerW / SAMPLE_BARS.length;
    return SAMPLE_BARS.map((fraction, i) => {
      const barH = innerH * fraction * 0.9;
      return { x: b + i * slot + slot * 0.15, y: b + innerH - barH, w: slot * 0.7, h: barH };
    });
  });
}

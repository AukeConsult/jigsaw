import { describe, expect, it } from "vitest";
import { PictureCrop, SmoothCurve } from "../src/models";

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};
const line = (...ys: number[]) => ys.map((y, i) => ({ x: (i * 100) / (ys.length - 1), y }));

describe("a smooth curve", () => {
  const curve = new SmoothCurve(line(0, 30, 40, 30, 0)); // five points, a hump in the middle

  it("goes from its first point to its last and through every point on the way", () => {
    near(curve.at(0), { x: 0, y: 0 });
    near(curve.at(1), { x: 100, y: 0 });
    near(curve.at(0.25), { x: 25, y: 30 });
    near(curve.at(0.5), { x: 50, y: 40 });
    near(curve.at(0.75), { x: 75, y: 30 });
    near(curve.start, curve.at(0));
    near(curve.end, curve.at(1));
  });

  it("can be an S: the points are on different sides of the line", () => {
    const s = new SmoothCurve(line(0, 30, 0, -30, 0));
    expect(s.at(0.25).y).toBeCloseTo(30, 9);
    expect(s.at(0.75).y).toBeCloseTo(-30, 9);
  });

  it("is straight, and as long as the distance, when the points are on a line at equal distances", () => {
    const straight = new SmoothCurve(line(0, 0, 0, 0, 0));
    near(straight.at(0.3), { x: 30, y: 0 }); // at the same speed all the way
    near(straight.normal(0.3), { x: 0, y: 1 }); // along x to the right: across is down
    expect(straight.length()).toBeCloseTo(100, 9);
    expect(curve.length()).toBeGreaterThan(100);
  });

  it("knows its direction, and the direction across it (a quarter turn clockwise on the screen)", () => {
    const n = curve.normal(0);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 9);
    const t = curve.tangent(0);
    near(n, { x: -t.y / Math.hypot(t.x, t.y), y: t.x / Math.hypot(t.x, t.y) });
    expect(curve.tangent(0.5).y).toBeCloseTo(0, 9); // at the top of the hump it goes level
  });

  it("gives a part of itself as a curve that is on it", () => {
    const part = curve.part(0.25, 0.75);
    near(part.start, curve.at(0.25));
    near(part.end, curve.at(0.75));
    near(part.at(0.5), curve.at(0.5)); // the middle of the part is the middle of the whole
    near(part.at(0.25), curve.at(0.25 + 0.5 * 0.25));
    near(curve.part(0, 1).at(0.6), curve.at(0.6));
    near(part.part(0, 0.5).end, curve.at(0.5)); // a part of a part
  });

  it("has a box that holds all of it", () => {
    const box = curve.bounds();
    expect(box.left).toBeCloseTo(0, 9);
    expect(box.top).toBeCloseTo(0, 9);
    expect(box.width).toBeCloseTo(100, 9);
    expect(box.height).toBeGreaterThanOrEqual(40 - 1e-9); // it reaches the top of the hump
  });
});

describe("a picture seen through a frame", () => {
  const view = (zoom = 1, x?: number, y?: number) => new PictureCrop(400, 300, 1200, 600, zoom, x, y); // a wide picture, a 4:3 frame

  it("covers the frame at least, in the middle to begin with, and the cut is what the frame shows", () => {
    const v = view();
    expect(v.scale).toBeCloseTo(0.5, 9); // the height decides: 300 / 600
    expect([v.imageW, v.imageH]).toEqual([600, 300]);
    expect(v.x).toBe(-100); // the middle: 100 px of the picture are out of the frame on each side
    expect(v.y).toBe(0);
    const s = v.source();
    expect(s).toEqual({ x: 200, y: 0, w: 800, h: 600 }); // 800 × 600 of the picture, in its own pixels: the shape of the frame
    expect(s.w / s.h).toBeCloseTo(400 / 300, 9);
  });

  it("is dragged inside the frame, but never so that the frame shows what is outside the picture", () => {
    expect(view().moved(50, 0).x).toBe(-50);
    expect(view().moved(-50, 0).x).toBe(-150);
    expect(view().moved(500, 0).x).toBe(0); // as far as the left edge of the picture
    expect(view().moved(-500, 0).x).toBe(-200); // as far as the right edge
    expect(view().moved(0, 80).y).toBe(0); // the height is covered exactly: it cannot be dragged up or down
    expect(view().moved(500, 0).source()).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    expect(view().moved(-500, 0).source()).toEqual({ x: 400, y: 0, w: 800, h: 600 });
  });

  it("is zoomed in up to four times, keeping the point under the pointer where it is", () => {
    const v = view();
    expect(v.zoomed(2).scale).toBeCloseTo(1, 9);
    expect(v.zoomed(9).zoom).toBe(PictureCrop.MAX_ZOOM);
    expect(v.zoomed(0.2).zoom).toBe(1); // not smaller than covering the frame
    const spot = (c: PictureCrop, fx: number, fy: number) => ({ px: (fx - c.x) / c.scale, py: (fy - c.y) / c.scale });
    const before = spot(v.moved(40, 0), 300, 100);
    const after = spot(v.moved(40, 0).zoomed(2.5, 300, 100), 300, 100);
    expect(after.px).toBeCloseTo(before.px, 6);
    expect(after.py).toBeCloseTo(before.py, 6);
    const zoomed = v.zoomed(2);
    expect(zoomed.source().w).toBeCloseTo(400, 6); // half as much of the picture is shown
    expect(zoomed.source().h).toBeCloseTo(300, 6);
  });

  it("stays covering the frame after every zoom", () => {
    for (const zoom of [1, 1.3, 2, 3.7, 4]) {
      for (const [fx, fy] of [[0, 0], [400, 300], [123, 250]]) {
        const c = view(1, -100, 0).zoomed(zoom, fx, fy).moved(-9999, 9999);
        expect(c.x).toBeLessThanOrEqual(0);
        expect(c.x + c.imageW).toBeGreaterThanOrEqual(400 - 1e-9);
        expect(c.y).toBeLessThanOrEqual(0);
        expect(c.y + c.imageH).toBeGreaterThanOrEqual(300 - 1e-9);
        const s = c.source();
        expect(s.x).toBeGreaterThanOrEqual(-1e-9);
        expect(s.x + s.w).toBeLessThanOrEqual(1200 + 1e-9);
        expect(s.y + s.h).toBeLessThanOrEqual(600 + 1e-9);
      }
    }
  });
});

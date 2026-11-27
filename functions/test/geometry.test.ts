import { describe, expect, it } from "vitest";
import { PictureCrop } from "../src/models";

describe("the cut a picture gets by itself", () => {
  it("is the biggest part with the shape, round the middle", () => {
    expect(PictureCrop.covering(1200, 600, 4 / 3)).toEqual({ x: 200, y: 0, w: 800, h: 600 });
    expect(PictureCrop.covering(600, 1200, 1)).toEqual({ x: 0, y: 300, w: 600, h: 600 });
  });

  it("is zoomed in as much as an earlier cut was", () => {
    expect(PictureCrop.covering(1200, 600, 1, { x: 600, y: 300 }, 2)).toEqual({ x: 450, y: 150, w: 300, h: 300 });
    expect(PictureCrop.covering(1200, 600, 1, { x: 600, y: 300 }, 0.5)).toEqual({ x: 300, y: 0, w: 600, h: 600 }); // never further out than the whole picture
  });

  it("stays round the middle of an earlier cut, but never leaves the picture", () => {
    expect(PictureCrop.covering(1200, 600, 1, { x: 400, y: 300 })).toEqual({ x: 100, y: 0, w: 600, h: 600 });
    expect(PictureCrop.covering(1200, 600, 1, { x: 1150, y: 300 })).toEqual({ x: 600, y: 0, w: 600, h: 600 });
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

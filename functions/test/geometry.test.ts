import { describe, expect, it } from "vitest";
import { SmoothCurve } from "../src/models";

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

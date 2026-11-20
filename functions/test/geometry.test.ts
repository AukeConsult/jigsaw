import { describe, expect, it } from "vitest";
import { QuadraticCurve } from "../src/models";

const near = (a: { x: number; y: number }, b: { x: number; y: number }) => {
  expect(a.x).toBeCloseTo(b.x, 9);
  expect(a.y).toBeCloseTo(b.y, 9);
};

describe("a quadratic curve", () => {
  const curve = new QuadraticCurve({ x: 0, y: 0 }, { x: 50, y: 100 }, { x: 100, y: 0 });

  it("goes from its start to its end, and its middle is half way between the control point and the middle of the straight line", () => {
    near(curve.at(0), { x: 0, y: 0 });
    near(curve.at(1), { x: 100, y: 0 });
    near(curve.at(0.5), { x: 50, y: 50 }); // (start + 2 x control + end) / 4
  });

  it("knows its direction, and the direction across it (a quarter turn clockwise on the screen)", () => {
    expect(curve.tangent(0)).toEqual({ x: 100, y: 200 }); // twice the way to the control point
    const n = curve.normal(0);
    expect(Math.hypot(n.x, n.y)).toBeCloseTo(1, 9);
    near(n, { x: -200 / Math.hypot(100, 200), y: 100 / Math.hypot(100, 200) });
    const straight = new QuadraticCurve({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 });
    near(straight.normal(0.3), { x: 0, y: 1 }); // along x to the right: across is down
  });

  it("has a length: a straight one is as long as the distance, a bent one is longer", () => {
    const straight = new QuadraticCurve({ x: 0, y: 0 }, { x: 50, y: 0 }, { x: 100, y: 0 });
    expect(straight.length()).toBeCloseTo(100, 9);
    expect(curve.length()).toBeGreaterThan(100);
  });

  it("gives a part of itself as a curve that is on it", () => {
    const part = curve.part(0.25, 0.75);
    near(part.start, curve.at(0.25));
    near(part.end, curve.at(0.75));
    near(part.at(0.5), curve.at(0.5)); // the middle of the part is the middle of the whole
    near(part.at(0.25), curve.at(0.25 + 0.5 * 0.25));
    const whole = curve.part(0, 1);
    near(whole.control, curve.control);
  });

  it("has a box that holds all of it", () => {
    const box = curve.bounds();
    expect(box.left).toBeCloseTo(0, 9);
    expect(box.top).toBeCloseTo(0, 9);
    expect(box.width).toBeCloseTo(100, 9);
    expect(box.height).toBeCloseTo(50, 9); // it never gets to the control point, only to y = 50
  });
});

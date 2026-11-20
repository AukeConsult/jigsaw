import { describe, expect, it } from "vitest";
import { CanvasArrow, CanvasBaseObject, CanvasFigure, DEFAULT_CONNECTOR, DEFAULT_OBJECT, MIN_RESIZED_SIDE_PX } from "../src/models";
import type { CanvasObjectInput } from "../src/models";

const figure = (o: Partial<CanvasObjectInput>) => CanvasBaseObject.of({ ...DEFAULT_OBJECT, ...o });
const arrow = (o: Partial<CanvasObjectInput>) => CanvasBaseObject.of({ ...DEFAULT_CONNECTOR, ...o });

describe("the classes of an object: parent, figure, arrow", () => {
  it("makes the right class for the settings: an arrow is a figure, a figure is a base object", () => {
    expect(figure({})).toBeInstanceOf(CanvasFigure);
    expect(figure({})).not.toBeInstanceOf(CanvasArrow);
    expect(arrow({})).toBeInstanceOf(CanvasArrow);
    expect(arrow({})).toBeInstanceOf(CanvasFigure);
    expect(arrow({})).toBeInstanceOf(CanvasBaseObject);
  });

  it("knows which figures have equal sides", () => {
    for (const [shape, equal] of [["square", true], ["circle", true], ["triangle", false], ["histogram", false]] as const) {
      expect((figure({ shape }) as CanvasFigure).equalSides).toBe(equal);
    }
    expect((arrow({}) as CanvasArrow).equalSides).toBe(false);
  });
});

describe("what is stored of an object, and how an older object is read", () => {
  it("stores only the known fields, trims the name, and keeps the arrow settings of a figure at their defaults", () => {
    const stored = CanvasBaseObject.stored({ ...DEFAULT_OBJECT, name: "  Box  ", evil: 1, arrow: undefined, arrowStyle: undefined } as unknown as CanvasObjectInput);
    expect(stored).toEqual({ ...DEFAULT_OBJECT, name: "Box" });
    expect("evil" in stored).toBe(false);
  });

  it("gives an object that an older version saved what it lacked: a figure, a solid arrow, a font of 16, no rounding", () => {
    const old = { name: "Old", shape: "circle", width: 50, height: 50, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff" };
    expect(CanvasBaseObject.fromStored(old as Partial<CanvasObjectInput>)).toMatchObject({ ...old, kind: "figure", arrow: "one-way", arrowStyle: "solid", fontSize: 16, cornerRadius: 0 });
    expect(CanvasBaseObject.fromStored({ ...DEFAULT_CONNECTOR, arrow: "both-ways" })).toMatchObject({ kind: "connector", arrow: "both-ways" }); // what it has is kept
  });
});

describe("scaling the settings of a figure", () => {
  const scaled = (o: Partial<CanvasObjectInput>, sx: number, sy: number) => figure(o).scaledSettings(sx, sy);

  it("keeps the shape of a triangle or a histogram: both sides by the same factor, the one that changed more", () => {
    expect(scaled({ shape: "triangle", width: 100, height: 60 }, 1.5, 2)).toMatchObject({ width: 200, height: 120 });
    expect(scaled({ shape: "histogram", width: 100, height: 60 }, 0.5, 1)).toMatchObject({ width: 50, height: 30 });
    expect(scaled({ shape: "triangle", width: 100, height: 60 }, 1.5, 1)).toMatchObject({ width: 150, height: 90 });
  });
  it("makes a square and a circle follow the factor that changed more, and stay equal-sided", () => {
    for (const shape of ["square", "circle"] as const) {
      const size = (sx: number, sy: number) => scaled({ shape, width: 100, height: 100 }, sx, sy);
      expect(size(1.5, 1)).toMatchObject({ width: 150, height: 150 }); // along x only
      expect(size(1, 1.5)).toMatchObject({ width: 150, height: 150 }); // along y only
      expect(size(1.5, 2)).toMatchObject({ width: 200, height: 200 }); // both bigger: the bigger change
      expect(size(0.5, 0.8)).toMatchObject({ width: 50, height: 50 }); // both smaller: the bigger change
      expect(size(2, 0.9)).toMatchObject({ width: 200, height: 200 }); // one bigger, one smaller: the one that changed more
    }
  });
  it("is never smaller than the least, and the corner radius stays at most half of the shorter side", () => {
    expect(scaled({ shape: "square", width: 100, height: 100 }, 0.01, 0.01)).toMatchObject({ width: MIN_RESIZED_SIDE_PX, height: MIN_RESIZED_SIDE_PX });
    expect(scaled({ shape: "square", width: 100, height: 100, cornerRadius: 40 }, 0.5, 0.5).cornerRadius).toBe(25);
    expect(scaled({ shape: "square", width: 100, height: 100, cornerRadius: 10 }, 2, 2).cornerRadius).toBe(10);
  });

  it("says how small it can be scaled: the shorter side decides, both sides scale together", () => {
    expect(figure({ shape: "triangle", width: 100, height: 40 }).minScale()).toEqual({ x: 0.1, y: 0.1 });
  });
  it("keeps everything else", () => {
    const o = scaled({ shape: "triangle", name: "T", borderColor: "#123456" }, 2, 2);
    expect(o).toMatchObject({ name: "T", borderColor: "#123456", kind: "figure" });
  });
});

describe("scaling the settings of an arrow", () => {
  const scaled = (o: Partial<CanvasObjectInput>, sx: number, sy: number) => arrow(o).scaledSettings(sx, sy);

  it("scales the thickness of a solid arrow, which is also its height, and not its length", () => {
    const o = scaled({ width: 150, borderWidth: 4, height: 4 }, 1.5, 1);
    expect(o).toMatchObject({ borderWidth: 6, height: 6, width: 150 }); // along x only: it follows that factor
    expect(scaled({ borderWidth: 4, height: 4 }, 1, 2)).toMatchObject({ borderWidth: 8, height: 8 });
    expect(scaled({ borderWidth: 4, height: 4 }, 0.5, 0.5)).toMatchObject({ borderWidth: 2, height: 2 });
  });

  it("is at least a pixel thick, and at most what an arrow can be", () => {
    expect(scaled({ borderWidth: 2, height: 2 }, 0.1, 0.1)).toMatchObject({ borderWidth: 1, height: 1 });
    expect(scaled({ borderWidth: 80, height: 80 }, 5, 5).borderWidth).toBe(100);
  });

  it("scales the height and the outline of a hollow arrow, the outline at most half of the height", () => {
    expect(scaled({ arrowStyle: "hollow", height: 40, borderWidth: 4 }, 1.5, 1.5)).toMatchObject({ height: 60, borderWidth: 6 });
    const thin = scaled({ arrowStyle: "hollow", height: 40, borderWidth: 20 }, 0.7, 0.7);
    expect(thin.borderWidth * 2).toBeLessThanOrEqual(thin.height);
    expect(arrow({ arrowStyle: "hollow", height: 40, borderWidth: 20 }).error()).toBe("");
    expect(CanvasBaseObject.of(thin).error()).toBe("");
  });

  it("takes a width across: a solid arrow's thickness (its height too), a hollow arrow's height", () => {
    const solid = arrow({ borderWidth: 2, height: 2 }) as CanvasArrow;
    expect(solid.across).toBe(2);
    expect(solid.withAcross(6)).toMatchObject({ borderWidth: 6, height: 6 });
    expect(solid.withAcross(0)).toMatchObject({ borderWidth: 1, height: 1 }); // at least a pixel
    expect(solid.withAcross(-30)).toMatchObject({ borderWidth: 1, height: 1 });
    expect(solid.withAcross(500)).toMatchObject({ borderWidth: 100, height: 100 }); // at most what a thickness can be
    expect(solid.withAcross(7.6)).toMatchObject({ borderWidth: 8, height: 8 });
    const hollow = arrow({ arrowStyle: "hollow", height: 40, borderWidth: 4 }) as CanvasArrow;
    expect(hollow.across).toBe(40);
    expect(hollow.withAcross(60)).toMatchObject({ height: 60, borderWidth: 4 }); // the outline stays
    expect(hollow.withAcross(3)).toMatchObject({ height: 8 }); // never less than twice the outline
    expect(hollow.withAcross(99999).height).toBe(10000);
    for (const o of [solid.withAcross(6), hollow.withAcross(60), hollow.withAcross(3)]) expect(CanvasBaseObject.of(o).error()).toBe("");
  });

  it("can be scaled as small as wanted", () => {
    expect(arrow({}).minScale()).toEqual({ x: 0, y: 0 });
  });
});

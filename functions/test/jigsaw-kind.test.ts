import { describe, expect, it } from "vitest";
import { JigsawKinds, JigsawSettings, PICTURE_DEFAULT_WIDTH, PICTURE_MAX_SIDE } from "../src/models";

const ready = { name: "A", width: 400, height: 300, gridSize: 50, gridVisible: true, placed: [], storeWidth: 200, snapPercent: 25 };
const picture = { name: "P", kind: "picture", width: PICTURE_DEFAULT_WIDTH, height: 800, gridSize: 0, gridVisible: false, placed: [] };

describe("the kind of a jigsaw entry: a ready jigsaw or a picture", () => {
  it("knows the kinds, and a document that says nothing is a ready jigsaw", () => {
    expect(JigsawKinds.is("picture")).toBe(true);
    expect(JigsawKinds.is("jigsaw")).toBe(true);
    expect(JigsawKinds.is("puzzle")).toBe(false);
    expect(JigsawKinds.of({})).toBe("jigsaw");
    expect(JigsawKinds.of({ kind: "nonsense" })).toBe("jigsaw");
    expect(JigsawKinds.isPicture({ kind: "picture" })).toBe(true);
    expect(JigsawKinds.isPicture({})).toBe(false);
    expect(JigsawKinds.error(undefined)).toBe("");
    expect(JigsawKinds.error("picture")).toBe("");
    expect(JigsawKinds.error("x")).toMatch(/ready jigsaw or a picture/);
  });

  it("leaves a ready jigsaw exactly as it was: no kind is stored or read", () => {
    const s = new JigsawSettings(ready);
    expect(s.error()).toBe("");
    expect(s.stored()).not.toHaveProperty("kind");
    expect(s.stored()).toMatchObject({ gridSize: 50, gridVisible: true, storeWidth: 200, snapPercent: 25 });
    expect(JigsawSettings.fromStored("a", { ...ready, createdAt: 1 })).not.toHaveProperty("kind");
    expect(new JigsawSettings({ ...ready, kind: "jigsaw" }).stored()).not.toHaveProperty("kind");
  });

  it("stores a picture with its kind and without grid, store or difficulty, and reads it back", () => {
    const s = new JigsawSettings({ ...picture, gridVisible: true, storeWidth: 300, snapPercent: 10 });
    const stored = s.stored();
    expect(stored).toMatchObject({ kind: "picture", gridSize: 0, gridVisible: false, placed: [] });
    expect(stored).not.toHaveProperty("storeWidth");
    expect(stored).not.toHaveProperty("snapPercent");
    expect(JigsawSettings.fromStored("p", { ...stored, createdAt: 2 })).toMatchObject({ kind: "picture", width: PICTURE_DEFAULT_WIDTH });
  });

  it("allows a picture and refuses grid, store, difficulty, objects and too big a side", () => {
    expect(new JigsawSettings(picture).error()).toBe("");
    for (const bad of [{ gridSize: 50 }, { storeWidth: 100 }, { snapPercent: 25 }, { placed: [{}] }]) {
      expect(new JigsawSettings({ ...picture, ...bad }).error()).toMatch(/no grid|no pieces/);
    }
    expect(new JigsawSettings({ ...picture, width: PICTURE_MAX_SIDE + 1 }).error()).toMatch(/at most 2000/);
    expect(new JigsawSettings({ ...picture, kind: "x" }).error()).toMatch(/ready jigsaw or a picture/);
  });

  it("gives the picture of a picture entry its size: 1200 wide, not wider than the picture, never over 2000 on a side", () => {
    expect(JigsawKinds.pictureSize(4000, 3000)).toEqual({ width: 1200, height: 900 });
    expect(JigsawKinds.pictureSize(800, 600)).toEqual({ width: 800, height: 600 });
    const tall = JigsawKinds.pictureSize(1000, 4000);
    expect(tall.height).toBe(PICTURE_MAX_SIDE);
    expect(tall.width).toBe(500);
    expect(JigsawKinds.pictureSize(0, 0)).toEqual({ width: 1, height: 1 });
    expect(new JigsawSettings({ ...picture, ...JigsawKinds.pictureSize(5000, 1000) }).error()).toBe("");
  });

  it("counts a change of kind as a change of what players share", () => {
    expect(JigsawSettings.changesWhatPlayersShare(ready, { ...ready })).toBe(false);
    expect(JigsawSettings.changesWhatPlayersShare(ready, { ...ready, kind: "picture" })).toBe(true);
    expect(JigsawSettings.changesWhatPlayersShare(picture, { ...picture })).toBe(false);
    expect(JigsawSettings.changesWhatPlayersShare(picture, { ...picture, height: 700 })).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { JigsawUsers } from "../src/models/shared/jigsaw-user";

describe("the effects on pictures", () => {
  it("are switched on or off, and nothing else", () => {
    expect(JigsawUsers.change({ pictureEffects: false })).toEqual({ change: { pictureEffects: false } });
    expect(JigsawUsers.change({ pictureEffects: true })).toEqual({ change: { pictureEffects: true } });
    expect(JigsawUsers.change({ pictureEffects: "off" })).toHaveProperty("error");
  });

  it("are read from what is kept, and nothing is said for an account that has not chosen", () => {
    expect(JigsawUsers.fromStored("a", { pictureEffects: false }).pictureEffects).toBe(false);
    expect(JigsawUsers.fromStored("a", { pictureEffects: "x" as never }).pictureEffects).toBeUndefined();
    expect(JigsawUsers.fromStored("a", {}).pictureEffects).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { JigsawUsers, PART_SIZES, PartSizes } from "../src/models";

// How big a person likes the picture tiles is a preference of the account: only a known size is taken and kept.

describe("the size of the tiles as a preference of the account", () => {
  it("knows its sizes and nothing else", () => {
    for (const size of PART_SIZES) expect(PartSizes.is(size)).toBe(true);
    expect(PartSizes.is("huge")).toBe(false);
    expect(PartSizes.is(undefined)).toBe(false);
  });

  it("takes and reads back the size of the tiles, only when it is known", () => {
    expect(JigsawUsers.change({ tileSize: "large" })).toEqual({ change: { tileSize: "large" } });
    expect(JigsawUsers.change({ tileSize: "x" })).toHaveProperty("error");
    expect(JigsawUsers.fromStored("a", { tileSize: "small" }).tileSize).toBe("small");
    expect(JigsawUsers.fromStored("a", { tileSize: "x" as never }).tileSize).toBeUndefined();
  });
});

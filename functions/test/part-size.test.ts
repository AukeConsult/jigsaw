import { describe, expect, it } from "vitest";
import { JigsawUsers, PART_SIZES, PartSizes, SIZED_PARTS } from "../src/models";

// How big a person likes the picture tiles and the small labels are preferences of the account: only a known size is taken and kept.

describe("the sizes of tiles and labels as preferences of the account", () => {
  it("knows its sizes and nothing else", () => {
    for (const size of PART_SIZES) expect(PartSizes.is(size)).toBe(true);
    expect(PartSizes.is("huge")).toBe(false);
    expect(PartSizes.is(undefined)).toBe(false);
  });

  it.each(SIZED_PARTS)("takes and reads back %s, only when it is known", (part) => {
    expect(JigsawUsers.change({ [part]: "large" })).toEqual({ change: { [part]: "large" } });
    expect(JigsawUsers.change({ [part]: "x" })).toHaveProperty("error");
    expect(JigsawUsers.fromStored("a", { [part]: "small" })[part]).toBe("small");
    expect(JigsawUsers.fromStored("a", { [part]: "x" as never })[part]).toBeUndefined();
  });
});

import { describe, expect, it } from "vitest";
import { JigsawUsers, TileDetailLevels } from "../src/models";

// How much the picture tiles tell is a preference of the account: none, short, details or full.

describe("how much the tiles tell as a preference of the account", () => {
  it("takes none, short, details and full, and nothing else", () => {
    for (const level of ["none", "short", "details", "full"] as const) expect(JigsawUsers.change({ tileDetails: level })).toEqual({ change: { tileDetails: level } });
    expect(JigsawUsers.change({ tileDetails: true })).toHaveProperty("error");
    expect(JigsawUsers.change({ tileDetails: "all" })).toHaveProperty("error");
  });

  it("reads what an earlier version kept: details shown is full, left out is short", () => {
    expect(TileDetailLevels.of(true)).toBe("full");
    expect(TileDetailLevels.of(false)).toBe("short");
    expect(JigsawUsers.fromStored("a", { tileDetails: false as never }).tileDetails).toBe("short");
    expect(JigsawUsers.fromStored("a", { tileDetails: "none" }).tileDetails).toBe("none");
    expect(JigsawUsers.fromStored("a", { tileDetails: "x" as never }).tileDetails).toBeUndefined();
    expect(JigsawUsers.fromStored("a", {}).tileDetails).toBeUndefined();
  });
});

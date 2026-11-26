import { describe, expect, it } from "vitest";
import { JigsawUsers } from "../src/models";

// Whether the picture tiles tell their details is a preference of the account: only yes or no is taken and kept.

describe("showing the details on the tiles as a preference of the account", () => {
  it("takes yes and no, and nothing else", () => {
    expect(JigsawUsers.change({ tileDetails: false })).toEqual({ change: { tileDetails: false } });
    expect(JigsawUsers.change({ tileDetails: true })).toEqual({ change: { tileDetails: true } });
    expect(JigsawUsers.change({ tileDetails: "no" })).toHaveProperty("error");
  });

  it("is read back when it is yes or no", () => {
    expect(JigsawUsers.fromStored("a", { tileDetails: false }).tileDetails).toBe(false);
    expect(JigsawUsers.fromStored("a", { tileDetails: "x" as never }).tileDetails).toBeUndefined();
    expect(JigsawUsers.fromStored("a", {}).tileDetails).toBeUndefined();
  });
});

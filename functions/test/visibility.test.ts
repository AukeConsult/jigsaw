import { describe, expect, it } from "vitest";
import { JigsawSettings, JigsawVisibilities } from "../src/models";

describe("visibility of a jigsaw", () => {
  const base = { name: "n", width: 400, height: 300, gridSize: 50, gridVisible: false, placed: [] };

  it("says which kinds are restricted (private and hidden) and which are listed (not hidden)", () => {
    expect([undefined, "everyone", "owner", "hidden"].map((v) => JigsawVisibilities.restricted(v))).toEqual([false, false, true, true]);
    expect([undefined, "everyone", "owner", "hidden"].map((v) => JigsawVisibilities.listed(v))).toEqual([true, true, true, false]);
  });

  it("keeps hidden when it is stored, and reads it back", () => {
    const stored = new JigsawSettings({ ...base, ownerUid: "u1", visibility: "hidden" }).stored();
    expect(stored.visibility).toBe("hidden");
    expect(JigsawSettings.fromStored("id", stored as never).visibility).toBe("hidden");
  });

  it("needs an owner for private and for hidden, and refuses another kind", () => {
    expect(new JigsawSettings({ ...base, visibility: "hidden" }).error()).toMatch(/owner/);
    expect(new JigsawSettings({ ...base, visibility: "owner" }).error()).toMatch(/owner/);
    expect(new JigsawSettings({ ...base, ownerUid: "u1", visibility: "hidden" }).error()).toBe("");
    expect(new JigsawSettings({ ...base, ownerUid: "u1", visibility: "secret" }).error()).toMatch(/public, private or hidden/);
  });
});

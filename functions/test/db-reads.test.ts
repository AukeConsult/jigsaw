import { describe, expect, it } from "vitest";
import { JIGSAW_HEAD_FIELDS, JigsawSettings, PlaySpec } from "../src/models";
import { memoryPlays } from "./memory-plays";

describe("what a read of the database asks for", () => {
  it("reads every stored field of a jigsaw except what is placed on its board", () => {
    const full = new JigsawSettings({ name: "x", width: 800, height: 600, gridSize: 100, gridVisible: true, placed: [], visibility: "everyone", timed: true, categories: [], language: "en", description: "d", author: "a", ownerUid: "u", kind: "ready" });
    const stored = Object.keys(full.stored()).filter((k) => k !== "placed");
    // a field the model starts to store must be read in the heads too, or a list would show it missing
    for (const key of stored) expect(JIGSAW_HEAD_FIELDS as readonly string[]).toContain(key);
    expect(JIGSAW_HEAD_FIELDS as readonly string[]).not.toContain("placed");
  });

  it("finds the rounds of one user on every jigsaw in one question", async () => {
    const plays = memoryPlays();
    const round = (userId: string): Omit<PlaySpec, "id"> => ({ jigsawId: "-", userId, userName: userId, status: "active", startedAt: 1, matched: 0, total: 4, storeWidth: 0, overrides: {} });
    await plays.create("j1", round("ann"), {});
    await plays.create("j2", round("ann"), {});
    await plays.create("j2", round("bob"), {});
    expect((await plays.listOfUser("ann")).map((r) => r.jigsawId).sort()).toEqual(["j1", "j2"]);
    expect(await plays.listOfUser("nobody")).toEqual([]);
  });
});

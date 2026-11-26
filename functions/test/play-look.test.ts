import { describe, expect, it } from "vitest";
import { JigsawUsers, PlayLooks, TABLES } from "../src/models";

// How a person likes the play area is a preference of the account: only a whole, known choice is taken and kept.

describe("the play area as a preference of the account", () => {
  it("takes a table that is known with the sound on or off, and nothing else", () => {
    for (const table of TABLES) expect(PlayLooks.is({ table, sound: false })).toBe(true);
    expect(PlayLooks.is({ table: "marble", sound: true })).toBe(false);
    expect(PlayLooks.is({ table: "felt" })).toBe(false);
    expect(PlayLooks.is(null)).toBe(false);
  });

  it("is changed on the account, only the known fields", () => {
    expect(JigsawUsers.change({ playLook: { table: "wood", sound: false, extra: 1 } })).toEqual({ change: { playLook: { table: "wood", sound: false } } });
    expect(JigsawUsers.change({ playLook: { table: "marble", sound: true } })).toHaveProperty("error");
  });

  it("is read from the document, and a wrong one is left out", () => {
    expect(JigsawUsers.fromStored("a", { playLook: { table: "linen", sound: true } }).playLook).toEqual({ table: "linen", sound: true });
    expect(JigsawUsers.fromStored("a", { playLook: { table: "x" } as never }).playLook).toBeUndefined();
    expect(JigsawUsers.fromStored("a", {}).playLook).toBeUndefined();
  });
});

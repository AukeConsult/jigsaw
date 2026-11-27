import { describe, expect, it } from "vitest";
import { DEFAULT_PLAY_LOOK, JigsawUsers, PIECE_EFFECTS, PIECE_STYLES, PlayLooks, SOUND_STYLES, TABLES } from "../src/models";

// How a person likes the play area is a preference of the account: only a known choice is taken and kept.

const whole = { ...DEFAULT_PLAY_LOOK, table: "wood" as const, sound: false };

describe("the play area as a preference of the account", () => {
  it("takes a table that is known with the sound on or off, and nothing else", () => {
    for (const table of TABLES) expect(PlayLooks.is({ table, sound: false })).toBe(true);
    expect(PlayLooks.is({ table: "marble", sound: true })).toBe(false);
    expect(PlayLooks.is({ table: "felt" })).toBe(false);
    expect(PlayLooks.is(null)).toBe(false);
  });

  it("takes the pieces, effects and sounds the app has, and no others", () => {
    for (const pieces of PIECE_STYLES) expect(PlayLooks.is({ ...whole, pieces })).toBe(true);
    for (const soundStyle of SOUND_STYLES) expect(PlayLooks.is({ ...whole, soundStyle })).toBe(true);
    expect(PlayLooks.is({ ...whole, effects: [...PIECE_EFFECTS] })).toBe(true);
    expect(PlayLooks.is({ ...whole, pieces: "stone" })).toBe(false);
    expect(PlayLooks.is({ ...whole, effects: ["ring", "smoke"] })).toBe(false);
    expect(PlayLooks.is({ ...whole, effects: "ring" })).toBe(false);
    expect(PlayLooks.is({ ...whole, soundStyle: "horn" })).toBe(false);
  });

  it("keeps a choice whole: what an older one left out is the usual, each effect once", () => {
    expect(PlayLooks.stored({ table: "felt", sound: true })).toEqual({ ...DEFAULT_PLAY_LOOK, table: "felt" });
    expect(PlayLooks.stored({ ...whole, effects: ["confetti", "glow", "glow"] }).effects).toEqual(["glow", "confetti"]);
    expect(PlayLooks.stored({ ...whole, effects: [] }).effects).toEqual([]);
  });

  it("switches one effect on or off", () => {
    expect(PlayLooks.withEffect(["ring"], "magnet", true)).toEqual(["magnet", "ring"]);
    expect(PlayLooks.withEffect(["magnet", "ring"], "ring", false)).toEqual(["magnet"]);
  });

  it("is changed on the account, only the known fields", () => {
    expect(JigsawUsers.change({ playLook: { ...whole, extra: 1 } })).toEqual({ change: { playLook: whole } });
    expect(JigsawUsers.change({ playLook: { table: "marble", sound: true } })).toHaveProperty("error");
  });

  it("is read from the document, and a wrong one is left out", () => {
    expect(JigsawUsers.fromStored("a", { playLook: { table: "linen", sound: true } as never }).playLook).toEqual({ ...DEFAULT_PLAY_LOOK, table: "linen" });
    expect(JigsawUsers.fromStored("a", { playLook: { table: "x" } as never }).playLook).toBeUndefined();
    expect(JigsawUsers.fromStored("a", {}).playLook).toBeUndefined();
  });
});

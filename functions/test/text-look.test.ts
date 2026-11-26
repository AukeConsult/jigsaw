import { describe, expect, it } from "vitest";
import { FONTS, JigsawUsers, TEXT_SIZES, TextLooks } from "../src/models";

// How big a person likes the text, and in which letters, is a preference of the account: only a whole, known choice is taken and kept.

describe("the text as a preference of the account", () => {
  it("takes every size with every font, and nothing else", () => {
    for (const size of TEXT_SIZES) for (const font of FONTS) expect(TextLooks.is({ size, font })).toBe(true);
    expect(TextLooks.is({ size: "huge", font: "serif" })).toBe(false);
    expect(TextLooks.is({ size: "small" })).toBe(false);
    expect(TextLooks.is(null)).toBe(false);
  });

  it("is a change of the account, with only the known fields", () => {
    expect(JigsawUsers.change({ textLook: { size: "large", font: "clear", extra: 1 } })).toEqual({ change: { textLook: { size: "large", font: "clear" } } });
    expect(JigsawUsers.change({ textLook: { size: "large", font: "x" } })).toHaveProperty("error");
  });

  it("is read from a stored account when it is whole", () => {
    expect(JigsawUsers.fromStored("a", { textLook: { size: "small", font: "playful" } }).textLook).toEqual({ size: "small", font: "playful" });
    expect(JigsawUsers.fromStored("a", { textLook: { size: "x" } as never }).textLook).toBeUndefined();
    expect(JigsawUsers.fromStored("a", {}).textLook).toBeUndefined();
  });
});

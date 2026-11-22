import { describe, expect, it } from "vitest";
import { JigsawFilters, SEARCH_MAX_CATEGORIES, SEARCH_MAX_OWNERS, SEARCH_MAX_TEXT } from "../src/models";
import type { JigsawFilter } from "../src/models";

const on = (over: Partial<JigsawFilter>): JigsawFilter => ({ ...JigsawFilters.empty(), ...over });

describe("a filter of jigsaws", () => {
  it("asks for everything when it is empty, and is on when any choice is made", () => {
    expect(JigsawFilters.empty()).toEqual({ text: "", categories: [], sizes: [], difficulties: [], languages: [], owners: [] });
    expect(JigsawFilters.isOn(JigsawFilters.empty())).toBe(false);
    expect(JigsawFilters.isOn(on({ text: "  " }))).toBe(false); // no words
    expect(JigsawFilters.isOn(on({ text: "harbour" }))).toBe(true);
    expect("favorites" in JigsawFilters.empty()).toBe(false);
    expect(JigsawFilters.isOn(on({ favorites: true }))).toBe(true); // only the favorites is a choice too
    for (const over of [{ categories: ["art"] }, { sizes: ["small"] }, { difficulties: ["hard"] }, { languages: ["nb"] }, { owners: ["u1"] }] as Partial<JigsawFilter>[]) expect(JigsawFilters.isOn(on(over))).toBe(true);
  });

  it("is never changed: a choice gives a new filter", () => {
    const before = on({ sizes: ["small"] });
    const after = JigsawFilters.toggled(before, "difficulties", "easy");
    expect(after).toEqual(on({ sizes: ["small"], difficulties: ["easy"] }));
    expect(before).toEqual(on({ sizes: ["small"] }));
    expect(JigsawFilters.toggled(after, "difficulties", "easy")).toEqual(before);
  });

  it("ticks several of a list, in the order they were ticked, and takes one away when it is ticked again", () => {
    let f = JigsawFilters.empty();
    for (const size of ["large", "small", "medium"]) f = JigsawFilters.toggled(f, "sizes", size);
    expect(f.sizes).toEqual(["large", "small", "medium"]);
    expect(JigsawFilters.toggled(f, "sizes", "small").sizes).toEqual(["large", "medium"]);
    expect(JigsawFilters.isChosen(f, "sizes", "small")).toBe(true);
    expect(JigsawFilters.isChosen(f, "sizes", "huge")).toBe(false);
    expect(JigsawFilters.toggled(JigsawFilters.toggled(JigsawFilters.toggled(JigsawFilters.empty(), "owners", "u1"), "owners", "u2"), "owners", "u1").owners).toEqual(["u2"]);
  });

  it("ticks a category on its own, and a sub-category in its place, as a jigsaw does, but up to more of them", () => {
    let f = JigsawFilters.toggled(JigsawFilters.empty(), "categories", "nature");
    expect(f.categories).toEqual(["nature"]);
    f = JigsawFilters.toggled(f, "categories", "nature/forest");
    expect(f.categories).toEqual(["nature/forest"]); // in the place of the category
    expect(JigsawFilters.isChosen(f, "categories", "nature")).toBe(true); // the category counts as chosen
    f = JigsawFilters.toggled(JigsawFilters.toggled(f, "categories", "family"), "categories", "art");
    expect(f.categories).toEqual(["family", "nature/forest", "art"]); // in the order the categories are shown
    expect(f.categories.length).toBeLessThanOrEqual(SEARCH_MAX_CATEGORIES);
    expect(JigsawFilters.toggled(f, "categories", "nature").categories).toEqual(["family", "art"]); // taken away with its sub-categories
    expect(JigsawFilters.toggled(JigsawFilters.empty(), "categories", "boats").categories).toEqual([]); // not a category
  });

  it("takes no more than the most of a list, and no value that is not one that can be ticked", () => {
    const owners = Array.from({ length: SEARCH_MAX_OWNERS }, (_, i) => `u${i}`);
    const full = on({ owners });
    expect(JigsawFilters.toggled(full, "owners", "extra")).toBe(full);
    expect(JigsawFilters.canChoose(full, "owners", "extra")).toBe(false);
    expect(JigsawFilters.canChoose(full, "owners", "u3")).toBe(true); // ticked: it can be taken away
    expect(JigsawFilters.toggled(full, "owners", "u3").owners).toHaveLength(SEARCH_MAX_OWNERS - 1);
    const sixCategories = on({ categories: ["family", "travel", "nature", "animals", "flowers", "food"] });
    expect(JigsawFilters.canChoose(sixCategories, "categories", "art")).toBe(false);
    expect(JigsawFilters.canChoose(sixCategories, "categories", "nature/forest")).toBe(true); // in the place of its category
    expect(JigsawFilters.toggled(on({}), "sizes", "tiny")).toEqual(on({}));
    expect(JigsawFilters.toggled(on({}), "difficulties", "insane")).toEqual(on({}));
    expect(JigsawFilters.toggled(on({}), "owners", "")).toEqual(on({}));
  });

  it("has a text with the spaces tidied and not longer than a search takes", () => {
    expect(JigsawFilters.withText(on({}), "  the   harbour ").text).toBe("the harbour ");
    expect(JigsawFilters.withText(on({}), "x".repeat(SEARCH_MAX_TEXT + 20)).text).toHaveLength(SEARCH_MAX_TEXT);
  });

  it("is checked when it is read again from a device: only what the model allows", () => {
    expect(JigsawFilters.is(on({}))).toBe(true);
    expect(JigsawFilters.is(on({ favorites: true }))).toBe(true);
    expect(JigsawFilters.is({ ...on({}), favorites: false })).toBe(false); // it is there, and true, or it is not there
    expect(JigsawFilters.is({ ...on({}), favorites: "yes" })).toBe(false);
    expect(JigsawFilters.is(on({ text: "harbour", categories: ["nature/forest", "family"], sizes: ["huge", "small"], difficulties: ["hard"], languages: ["nb", "en"], owners: ["u1", "u2"] }))).toBe(true);
    const tooMany = Array.from({ length: 11 }, (_, i) => `u${i}`);
    for (const bad of [null, undefined, "x", {}, { category: null }, on({ categories: ["boats"] }), on({ sizes: ["tiny" as never] }), on({ difficulties: ["insane" as never] }), on({ languages: ["xx"] }), on({ languages: ["nb", "nb"] }),
      on({ owners: ["a/b"] }), on({ owners: ["x".repeat(61)] }), on({ owners: ["u1", "u1"] }), on({ owners: tooMany }), on({ categories: ["family", "family"] }), on({ text: "x".repeat(SEARCH_MAX_TEXT + 1) }),
      { ...on({}), owners: "u1" }, { ...on({}), sizes: "small" }, { ...on({}), text: 3 }]) {
      expect(JigsawFilters.is(bad)).toBe(false);
    }
  });

  it("knows a setup: cards or list with a filter that is allowed", () => {
    expect(JigsawFilters.isSetup({ view: "cards", filter: JigsawFilters.empty() })).toBe(true);
    expect(JigsawFilters.isSetup({ view: "list", filter: on({ text: "x", owners: ["u1"] }) })).toBe(true);
    for (const bad of [null, undefined, "list", {}, { view: "grid", filter: JigsawFilters.empty() }, { view: "list" }, { view: "list", filter: { text: "" } }, { view: "list", filter: on({ sizes: ["tiny" as never] }) }]) {
      expect(JigsawFilters.isSetup(bad)).toBe(false);
    }
  });

  it("makes the question for the search: only what is chosen, and the page", () => {
    expect(JigsawFilters.query(on({}))).toEqual({ page: 1 });
    expect(JigsawFilters.query(on({ text: " harbour  ", categories: ["nature/forest"], sizes: ["large", "huge"], difficulties: ["easy"], languages: ["nb"], owners: ["u1", "u2"] }), 2, 12)).toEqual({
      categories: ["nature/forest"], sizes: ["large", "huge"], difficulties: ["easy"], languages: ["nb"], owners: ["u1", "u2"], text: "harbour", page: 2, limit: 12,
    });
    expect(JigsawFilters.query(on({ text: "   " }))).toEqual({ page: 1 });
    expect(JigsawFilters.query(on({ favorites: true }))).toEqual({ favorites: true, page: 1 });
  });
});

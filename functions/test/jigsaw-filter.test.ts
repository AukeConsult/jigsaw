import { describe, expect, it } from "vitest";
import { JigsawFilters, JigsawUsers, SEARCH_MAX_CATEGORIES, SEARCH_MAX_OWNERS, SEARCH_MAX_TEXT } from "../src/models";
import type { JigsawFilter } from "../src/models";

const on = (over: Partial<JigsawFilter>): JigsawFilter => ({ ...JigsawFilters.empty(), ...over });

describe("a filter of jigsaws", () => {
  it("asks for everything when it is empty, and is on when any choice is made", () => {
    expect(JigsawFilters.empty()).toEqual({ text: "", kinds: [], categories: [], sizes: [], difficulties: [], motives: [], languages: [], owners: [], visibilities: [] });
    expect(JigsawFilters.isOn(JigsawFilters.empty())).toBe(false);
    expect(JigsawFilters.isOn(on({ text: "  " }))).toBe(false); // no words
    expect(JigsawFilters.isOn(on({ text: "harbour" }))).toBe(true);
    expect("favorites" in JigsawFilters.empty()).toBe(false);
    expect(JigsawFilters.isOn(on({ favorites: true }))).toBe(true); // only the favorites is a choice too
    for (const over of [{ categories: ["art"] }, { sizes: ["small"] }, { difficulties: ["hard"] }, { motives: ["expert"] }, { languages: ["nb"] }, { owners: ["u1"] }] as Partial<JigsawFilter>[]) expect(JigsawFilters.isOn(on(over))).toBe(true);
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

  it("has the kind of the entry: one or the other, or both (none is all), nothing else", () => {
    const picture = JigsawFilters.toggled(on({}), "kinds", "picture");
    expect(picture.kinds).toEqual(["picture"]);
    expect(JigsawFilters.isOn(picture)).toBe(true);
    const both = JigsawFilters.toggled(picture, "kinds", "jigsaw");
    expect(both.kinds).toEqual(["picture", "jigsaw"]);
    expect(JigsawFilters.canChoose(both, "kinds", "picture")).toBe(true); // ticked: it can be taken away
    expect(JigsawFilters.toggled(both, "kinds", "picture").kinds).toEqual(["jigsaw"]);
    expect(JigsawFilters.toggled(on({}), "kinds", "book")).toEqual(on({})); // not a kind
    expect(JigsawFilters.query(both).kinds).toEqual(["picture", "jigsaw"]);
    expect(JigsawFilters.query(on({})).kinds).toBeUndefined(); // none asks for all
    expect(JigsawFilters.is(both)).toBe(true);
    expect(JigsawFilters.is({ ...both, kinds: ["book"] })).toBe(false);
    const { kinds: _kinds, ...kept } = both; // a filter kept before the kinds had none
    expect(JigsawFilters.is(kept)).toBe(true);
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

describe("a filter with categories added (what was just made is not left out of it)", () => {
  it("is left as it is when no category is chosen: it looks at every category already", () => {
    const empty = JigsawFilters.empty();
    expect(JigsawFilters.withCategories(empty, ["nature"])).toBe(empty);
  });

  it("adds the categories that are not chosen, and not again the ones that are", () => {
    const chosen = on({ categories: ["animals"] });
    expect([...JigsawFilters.withCategories(chosen, ["nature", "animals"]).categories].sort()).toEqual(["animals", "nature"]);
  });

  it("does not add a sub-category whose category is chosen already", () => {
    const chosen = on({ categories: ["nature"] });
    expect(JigsawFilters.withCategories(chosen, ["nature/forest"])).toBe(chosen);
  });

  it("does not add a category there is no room for, or one that is not a category", () => {
    const full = on({ categories: ["nature"] });
    expect(JigsawFilters.withCategories(full, ["not-a-category"])).toBe(full);
  });
});

describe("the filter of the list kept with a user", () => {
  it("is kept as a change when it is a filter, only with the known fields", () => {
    const filter = on({ categories: ["nature"], languages: ["nb"] });
    expect(JigsawUsers.change({ listFilter: { ...filter, extra: 1 } })).toEqual({ change: { listFilter: filter } });
  });

  it("is refused when it is not a filter", () => {
    expect(JigsawUsers.change({ listFilter: { text: "" } })).toHaveProperty("error");
    expect(JigsawUsers.change({ listFilter: "all" })).toHaveProperty("error");
  });

  it("is read back from what is stored, and left out when what is stored is not a filter", () => {
    const filter = on({ owners: ["u1"], favorites: true });
    expect(JigsawUsers.fromStored("u", { username: "u", name: "U", listFilter: filter }).listFilter).toEqual(filter);
    expect(JigsawUsers.fromStored("u", { username: "u", name: "U", listFilter: { text: 1 } as never })).not.toHaveProperty("listFilter");
  });
});

describe("who sees the jigsaws, a choice of a filter: public, private, or both", () => {
  it("is a choice like the others: on when one is chosen, and asked for in the query only then", () => {
    expect(JigsawFilters.isOn(on({ visibilities: ["private"] }))).toBe(true);
    expect(JigsawFilters.query(on({ visibilities: ["public", "private"] }))).toEqual({ visibilities: ["public", "private"], page: 1 });
    expect(JigsawFilters.query(on({}))).toEqual({ page: 1 });
  });

  it("is ticked and taken away like the others, and only public and private can be ticked", () => {
    const one = JigsawFilters.toggled(on({}), "visibilities", "private");
    expect(one.visibilities).toEqual(["private"]);
    expect(JigsawFilters.toggled(one, "visibilities", "public").visibilities).toEqual(["private", "public"]);
    expect(JigsawFilters.toggled(one, "visibilities", "private").visibilities).toEqual([]);
    expect(JigsawFilters.toggled(on({}), "visibilities", "hidden").visibilities).toEqual([]);
  });

  it("gets the visibility of a new picture added, unless none is chosen (every picture is shown then) or it is chosen already", () => {
    const empty = on({});
    expect(JigsawFilters.withVisibility(empty, "private")).toBe(empty);
    const publicOnly = on({ visibilities: ["public"] });
    expect(JigsawFilters.withVisibility(publicOnly, "private").visibilities).toEqual(["public", "private"]);
    const both = on({ visibilities: ["public", "private"] });
    expect(JigsawFilters.withVisibility(both, "private")).toBe(both);
  });

  it("is a filter that is allowed with none (one kept before it was there), and is always kept as a list", () => {
    const old = { ...on({}) } as Partial<JigsawFilter>;
    delete old.visibilities;
    expect(JigsawFilters.is(old)).toBe(true);
    expect(JigsawFilters.is(on({ visibilities: ["secret" as never] }))).toBe(false);
    expect(JigsawFilters.stored(old as JigsawFilter).visibilities).toEqual([]);
  });
});

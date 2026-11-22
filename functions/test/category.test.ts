import { describe, expect, it } from "vitest";
import { CATEGORIES_MAX_PER_JIGSAW, JigsawCategories } from "../src/models";

describe("the categories", () => {
  it("are the thirteen there are, each with a key, a name and an icon, and a key is used once", () => {
    const all = JigsawCategories.all();
    expect(all).toHaveLength(13);
    expect(all.map((c) => c.key)).toEqual(["recommended", "family", "travel", "nature", "animals", "flowers", "food", "art", "buildings", "seasons", "transport", "kids", "other"]);
    expect(new Set(all.map((c) => c.key)).size).toBe(all.length);
    for (const c of all) {
      expect(c.name.length).toBeGreaterThan(1);
      expect(c.icon).toMatch(/^bi-[a-z0-9-]+$/);
    }
  });

  it("have sub-categories: each with the key of its category, a slash and its own key, the icon of its category, and none of its own", () => {
    expect(JigsawCategories.of("nature")!.subs.map((s) => s.name)).toEqual(["Mountains", "Sea & coast", "Lakes, rivers & waterfalls", "Forest", "Sky & sunsets"]);
    expect(JigsawCategories.of("other")!.subs).toEqual([]);
    expect(JigsawCategories.of("recommended")).toMatchObject({ name: "Recommended", icon: "bi-star", subs: [] }); // a category on its own, with no sub-categories
    const keys: string[] = [];
    for (const c of JigsawCategories.all()) {
      keys.push(c.key);
      for (const s of c.subs) {
        expect(s.key.startsWith(`${c.key}/`)).toBe(true);
        expect(s.parent).toBe(c.key);
        expect(s.icon).toBe(c.icon);
        expect(s.subs).toEqual([]);
        keys.push(s.key);
      }
    }
    expect(new Set(keys).size).toBe(keys.length); // every key is used once
    expect(JigsawCategories.of("nature/mountains")?.parent).toBe("nature");
    expect(JigsawCategories.of("nature")?.parent).toBeUndefined();
  });

  it("are found by key, and a key that is not one gives nothing", () => {
    expect(JigsawCategories.of("travel")?.name).toBe("Travel");
    expect(JigsawCategories.of("travel/mountains")).toBeUndefined(); // a sub-category of another category
    expect(JigsawCategories.of("Travel")).toBeUndefined(); // the key is exact
    expect(JigsawCategories.of(3)).toBeUndefined();
  });

  it("are allowed in a jigsaw: none, or up to the most, each once and each a known one", () => {
    expect(JigsawCategories.error([])).toBe("");
    expect(JigsawCategories.error(["family", "nature", "kids"])).toBe("");
    expect(CATEGORIES_MAX_PER_JIGSAW).toBe(3);
    expect(JigsawCategories.error(["family", "nature", "kids", "art"])).toMatch(/at most 3/);
    expect(JigsawCategories.error(["nature/mountains", "travel/cities", "family"])).toBe(""); // a sub-category counts like a category
    expect(JigsawCategories.error(["family", "family"])).toMatch(/only chosen once/);
    expect(JigsawCategories.error(["family", "boats"])).toMatch(/"boats" is not a category/);
    expect(JigsawCategories.error("family")).toMatch(/must be a list/);
    expect(JigsawCategories.error(undefined)).toMatch(/must be a list/);
  });

  it("are stored as only the known ones, once each, in the order they are shown, and at most the most", () => {
    expect(JigsawCategories.stored(["nature", "boats", "family", "nature"])).toEqual(["family", "nature"]);
    expect(JigsawCategories.stored(["other", "kids", "art", "family"])).toEqual(["family", "art", "kids"]);
    expect(JigsawCategories.stored(["nature/forest", "nature", "family/weddings"])).toEqual(["family/weddings", "nature", "nature/forest"]); // a category before its sub-categories
    expect(JigsawCategories.stored(undefined)).toEqual([]);
    expect(JigsawCategories.stored("family")).toEqual([]);
  });

  describe("when the person presses them", () => {
    const press = (keys: string[], ...presses: string[]) => presses.reduce((now, key) => JigsawCategories.toggled(now, key), keys);

    it("chooses a category on its own, and takes it away with its sub-categories", () => {
      expect(press([], "nature")).toEqual(["nature"]);
      expect(press([], "nature", "nature")).toEqual([]);
      expect(press(["nature", "family"], "nature")).toEqual(["family"]);
      expect(press(["nature/forest", "nature/sky"], "nature")).toEqual([]);
    });

    it("lets a sub-category take the place of its category, adds more of the same, and leaves the category when the last one goes", () => {
      expect(press([], "nature", "nature/forest")).toEqual(["nature/forest"]);
      expect(press([], "nature", "nature/forest", "nature/sky")).toEqual(["nature/forest", "nature/sky"]);
      expect(press([], "nature", "nature/forest", "nature/forest")).toEqual(["nature"]);
      expect(press([], "nature", "nature/forest", "nature/sky", "nature/forest")).toEqual(["nature/sky"]);
    });

    it("is chosen when it or one of its sub-categories is", () => {
      expect(JigsawCategories.isChosen(["nature/forest"], "nature")).toBe(true);
      expect(JigsawCategories.isChosen(["nature/forest"], "nature/forest")).toBe(true);
      expect(JigsawCategories.isChosen(["nature"], "nature/forest")).toBe(false);
      expect(JigsawCategories.isChosen(["nature"], "travel")).toBe(false);
      expect(JigsawCategories.isChosen(["nature"], "boats")).toBe(false);
    });

    it("changes nothing when there is no room, except a sub-category of a category that is chosen on its own, and for a key that is not one", () => {
      const full = ["family", "nature", "kids"];
      expect(press(full, "art")).toEqual(full);
      expect(press(full, "travel/cities")).toEqual(full);
      expect(JigsawCategories.canChoose(full, "art")).toBe(false);
      expect(JigsawCategories.canChoose(full, "nature")).toBe(true); // it is chosen: it can be taken away
      expect(JigsawCategories.canChoose(full, "nature/forest")).toBe(true); // it takes the place of the category
      expect(press(full, "nature/forest")).toEqual(["family", "nature/forest", "kids"]);
      expect(press(full, "boats")).toEqual(full);
      expect(JigsawCategories.canChoose(full, "boats")).toBe(false);
    });
  });

  it("take a larger maximum when a caller gives one (a filter), and the same rules otherwise", () => {
    const six = ["family", "travel", "nature", "animals", "flowers", "food"];
    expect(JigsawCategories.stored(six, 6)).toEqual(six);
    expect(JigsawCategories.stored(six)).toEqual(["family", "travel", "nature"]);
    expect(JigsawCategories.toggled(six.slice(0, 5), "food", 6)).toEqual(six);
    expect(JigsawCategories.toggled(six, "art", 6)).toEqual(six); // no room
    expect(JigsawCategories.canChoose(six, "art", 6)).toBe(false);
    expect(JigsawCategories.canChoose(six.slice(0, 5), "art", 6)).toBe(true);
    expect(JigsawCategories.canChoose(six.slice(0, 5), "art")).toBe(false); // a jigsaw takes three
  });
});

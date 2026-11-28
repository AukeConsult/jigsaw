import { JigsawMotives } from "../src/models/shared/motive";
import { describe, expect, it } from "vitest";
import { Classifications, JIGSAW_MAX_NAME, JigsawCategories } from "../src/models";

describe("what the AI may fill on a picture when it runs by itself", () => {
  const found = { categories: ["nature"], motive: "normal" as const, name: "A forest" };

  it("fills everything that is empty", () => {
    expect(Classifications.lacks({})).toBe(true);
    expect(Classifications.fill({ name: "  ", categories: [] }, found)).toEqual(found);
  });

  it("keeps what the person has typed or chosen", () => {
    expect(Classifications.fill({ name: "Mine", categories: ["recommended"] }, found)).toEqual({ motive: "normal" });
  });

  it("has nothing to ask when nothing is empty, and fills nothing the AI did not say", () => {
    expect(Classifications.lacks({ name: "Mine", categories: ["nature"], motive: "easy" })).toBe(false);
    expect(Classifications.fill({}, { categories: [], name: "" })).toEqual({});
  });
});

describe("what the AI is asked and allowed to say about a picture", () => {
  it("may give every category and sub-category by key, and nothing else", () => {
    const keys = Classifications.keys();
    expect(keys).toContain("recommended");
    expect(keys).toContain("nature");
    expect(keys).toContain("nature/forest");
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(JigsawCategories.all().length + JigsawCategories.all().reduce((n, c) => n + c.subs.length, 0));
  });

  it("is a strict schema: categories (only the keys), the three ratings of the motive (detail, colour, landmark), a name, and nothing more (a person writes the description)", () => {
    const schema = Classifications.schema() as { type: string; required: string[]; additionalProperties: boolean; properties: Record<string, { type: string; enum?: (string | number)[]; items?: { enum: string[] } }> };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["categories", "detail", "colour", "landmark", "name"]);
    expect(schema.properties.detail.enum).toEqual([1, 2, 3, 4, 5]);
    expect(schema.properties.colour.enum).toEqual([1, 2, 3, 4, 5]);
    expect(schema.properties.landmark.type).toBe("boolean");
    expect(schema.properties).not.toHaveProperty("motive"); // the level is worked out from the ratings
    expect(schema.properties.categories.items?.enum).toEqual(Classifications.keys());
    expect(schema.properties.name.type).toBe("string");
    expect(schema.properties).not.toHaveProperty("description");
  });

  it("is told the categories, the limits and the language to write in (English for one that is not a language of the app)", () => {
    const nb = Classifications.prompt("nb");
    expect(nb).toContain("Norsk");
    expect(nb).toContain("nature/forest = Forest");
    expect(nb).toContain("at most 3");
    expect(nb).toContain(String(JIGSAW_MAX_NAME));
    expect(nb).not.toMatch(/description/i);
    expect(Classifications.prompt("xx")).toContain("English");
  });

  it("is checked when it comes back: only categories that exist, once each, at most three, in the order they are shown", () => {
    const read = Classifications.read({ categories: ["nature/forest", "boats", "nature/forest", "family", "art", "kids"], name: "Forest walk", description: "A path." });
    expect(read).toEqual({ categories: ["family", "nature/forest", "art"], name: "Forest walk" }); // a description it says anyway is not used
  });

  it("gives the categories as one would choose them: a sub-category instead of its category, and other only when it is all there is", () => {
    expect(Classifications.tidyCategories(["family", "family/friends", "other"])).toEqual(["family/friends"]); // the case of a picture of friends on a sofa
    expect(Classifications.tidyCategories(["nature", "nature/forest", "nature/sky"])).toEqual(["nature/forest", "nature/sky"]);
    expect(Classifications.tidyCategories(["other"])).toEqual(["other"]);
    expect(Classifications.tidyCategories(["other", "art"])).toEqual(["art"]);
    expect(Classifications.tidyCategories(["family", "nature"])).toEqual(["family", "nature"]); // two categories that are not each other's
    expect(Classifications.tidyCategories(["boats", "family"])).toEqual(["family"]);
    expect(Classifications.tidyCategories("family")).toEqual([]);
    expect(Classifications.read({ categories: ["family", "family/friends", "other"], name: "n", description: "d" })).toMatchObject({ categories: ["family/friends"] });
  });

  it("has the name tidied and cut to its limit, and an empty one when it said none or said something that is not text", () => {
    const read = Classifications.read({ categories: [], name: `  ${"a ".repeat(100)}  ` }) as { name: string };
    expect(read.name.length).toBeLessThanOrEqual(JIGSAW_MAX_NAME);
    expect(read.name.startsWith("a a")).toBe(true);
    expect(read.name.endsWith(" ")).toBe(false);
    expect((Classifications.read({ name: `x${" ".repeat(5)}y` }) as { name: string }).name).toBe("x y"); // runs of spaces are one
    expect(Classifications.read({ categories: "nature", name: 3 })).toEqual({ categories: [], name: "" });
    expect(Classifications.read({})).toEqual({ categories: [], name: "" });
  });

  it("is refused when it is not an object", () => {
    for (const bad of [null, undefined, "text", 5]) expect(Classifications.read(bad)).toEqual({ error: "The answer is not an object." });
  });
});


describe("the motive difficulty the AI gives", () => {
  it("is asked for in the prompt as three ratings, detail and contrast and colour from 1 to 5 and whether something stands out, not as a level", () => {
    const prompt = Classifications.prompt("en");
    expect(prompt).toMatch(/You do not choose a level/);
    expect(prompt).toMatch(/detail, from 1 to 5/);
    expect(prompt).toMatch(/colour, from 1 to 5: contrast and colour/);
    expect(prompt).toMatch(/landmark: true when at least one thing clearly stands out/);
    expect(prompt).toMatch(/when in doubt between two numbers, give the lower one/);
  });

  it("is worked out from the ratings: low detail and low contrast and colour is the hardest, much of both the easiest, and something that stands out makes the hardest one hard", () => {
    expect(JigsawMotives.fromRatings(5, 4, false)).toBe("easy");
    expect(JigsawMotives.fromRatings(5, 5, true)).toBe("easy");
    expect(JigsawMotives.fromRatings(4, 3, false)).toBe("mediumeasy");
    expect(JigsawMotives.fromRatings(3, 3, false)).toBe("normal");
    expect(JigsawMotives.fromRatings(5, 1, false)).toBe("normal"); // one high, the other low: the middle
    expect(JigsawMotives.fromRatings(2, 2, false)).toBe("hard");
    expect(JigsawMotives.fromRatings(1, 1, false)).toBe("expert"); // fog, one colour: nothing tells the pieces apart
    expect(JigsawMotives.fromRatings(1, 2, false)).toBe("expert");
    expect(JigsawMotives.fromRatings(1, 1, true)).toBe("hard"); // a white check mark on a blue wall
    expect(JigsawMotives.fromRatings(1, 2, true)).toBe("hard");
    // a rating that is not a whole number from 1 to 5 gives no level
    expect(JigsawMotives.fromRatings(0, 3, false)).toBeUndefined();
    expect(JigsawMotives.fromRatings(3, 6, false)).toBeUndefined();
    expect(JigsawMotives.fromRatings("3", 3, false)).toBeUndefined();
    expect(JigsawMotives.fromRatings(2.5, 3, false)).toBeUndefined();
  });

  it("is what the AI's ratings say when it gave them (a level said outright is used only when there are no ratings)", () => {
    const given = { categories: ["nature"], name: "A", description: "B" };
    expect(Classifications.read({ ...given, detail: 1, colour: 1, landmark: true })).toMatchObject({ motive: "hard" });
    expect(Classifications.read({ ...given, detail: 1, colour: 1, landmark: false })).toMatchObject({ motive: "expert" });
    expect(Classifications.read({ ...given, detail: 1, colour: 1, landmark: false, motive: "easy" })).toMatchObject({ motive: "expert" });
    expect(Classifications.read({ ...given, motive: "hard" })).toMatchObject({ motive: "hard" });
    expect(Classifications.read({ ...given, detail: 9, colour: 1, landmark: false })).not.toHaveProperty("motive");
  });

  it("is kept apart from the categories: a property when it is one of the levels, left out when it is not", () => {
    const given = { categories: ["nature", "nature/forest"], motive: "hard", name: "A", description: "B" };
    expect(Classifications.read(given)).toMatchObject({ categories: ["nature/forest"], motive: "hard" });
    expect(Classifications.read({ ...given, motive: "impossible" })).not.toHaveProperty("motive");
    expect(Classifications.read({ ...given, motive: undefined })).not.toHaveProperty("motive");
    expect(Classifications.read({ ...given, categories: ["motive/easy", "food"] })).toMatchObject({ categories: ["food"] }); // a level is not a category
  });
});

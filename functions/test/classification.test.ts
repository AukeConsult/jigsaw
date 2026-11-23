import { describe, expect, it } from "vitest";
import { Classifications, JIGSAW_MAX_DESCRIPTION, JIGSAW_MAX_NAME, JigsawCategories } from "../src/models";

describe("what the AI is asked and allowed to say about a picture", () => {
  it("may give every category and sub-category by key, and nothing else", () => {
    const keys = Classifications.keys();
    expect(keys).toContain("recommended");
    expect(keys).toContain("nature");
    expect(keys).toContain("nature/forest");
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(JigsawCategories.all().length + JigsawCategories.all().reduce((n, c) => n + c.subs.length, 0));
  });

  it("is a strict schema: categories (only the keys), the motive difficulty (one of its levels), a name and a description, and nothing more", () => {
    const schema = Classifications.schema() as { type: string; required: string[]; additionalProperties: boolean; properties: Record<string, { type: string; enum?: string[]; items?: { enum: string[] } }> };
    expect(schema.type).toBe("object");
    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["categories", "motive", "name", "description"]);
    expect(schema.properties.motive.enum).toEqual(["easy", "mediumeasy", "normal", "hard", "expert"]);
    expect(schema.properties.categories.items?.enum).toEqual(Classifications.keys());
    expect(schema.properties.name.type).toBe("string");
    expect(schema.properties.description.type).toBe("string");
  });

  it("is told the categories, the limits and the language to write in (English for one that is not a language of the app)", () => {
    const nb = Classifications.prompt("nb");
    expect(nb).toContain("Norsk");
    expect(nb).toContain("nature/forest = Forest");
    expect(nb).toContain("at most 3");
    expect(nb).toContain(String(JIGSAW_MAX_NAME));
    expect(nb).toContain(String(JIGSAW_MAX_DESCRIPTION));
    expect(Classifications.prompt("xx")).toContain("English");
  });

  it("is checked when it comes back: only categories that exist, once each, at most three, in the order they are shown", () => {
    const read = Classifications.read({ categories: ["nature/forest", "boats", "nature/forest", "family", "art", "kids"], name: "Forest walk", description: "A path." });
    expect(read).toEqual({ categories: ["family", "nature/forest", "art"], name: "Forest walk", description: "A path." });
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

  it("has the texts tidied and cut to their limits, and an empty one when it said none or said something that is not text", () => {
    const read = Classifications.read({ categories: [], name: `  ${"a ".repeat(100)}  `, description: `x${" ".repeat(5)}y ${"z".repeat(600)}` }) as { name: string; description: string };
    expect(read.name.length).toBeLessThanOrEqual(JIGSAW_MAX_NAME);
    expect(read.name.startsWith("a a")).toBe(true);
    expect(read.name.endsWith(" ")).toBe(false);
    expect(read.description.length).toBeLessThanOrEqual(JIGSAW_MAX_DESCRIPTION);
    expect(read.description.startsWith("x y z")).toBe(true); // runs of spaces are one
    expect(Classifications.read({ categories: "nature", name: 3, description: null })).toEqual({ categories: [], name: "", description: "" });
    expect(Classifications.read({})).toEqual({ categories: [], name: "", description: "" });
  });

  it("is refused when it is not an object", () => {
    for (const bad of [null, undefined, "text", 5]) expect(Classifications.read(bad)).toEqual({ error: "The answer is not an object." });
  });
});

describe("the motive difficulty the AI gives", () => {
  it("is asked for in the prompt, with what each level means", () => {
    const prompt = Classifications.prompt("en");
    expect(prompt).toContain("mediumeasy");
    expect(prompt).toContain("expert");
    expect(prompt).toMatch(/fewer distinct details/); // few details is harder, many different details is easier
    expect(prompt.indexOf("easy = many clear")).toBeGreaterThan(-1);
    expect(prompt.indexOf("expert = hardly anything")).toBeGreaterThan(prompt.indexOf("hard = large plain"));
  });

  it("is kept apart from the categories: a property when it is one of the levels, left out when it is not", () => {
    const given = { categories: ["nature", "nature/forest"], motive: "hard", name: "A", description: "B" };
    expect(Classifications.read(given)).toMatchObject({ categories: ["nature/forest"], motive: "hard" });
    expect(Classifications.read({ ...given, motive: "impossible" })).not.toHaveProperty("motive");
    expect(Classifications.read({ ...given, motive: undefined })).not.toHaveProperty("motive");
    expect(Classifications.read({ ...given, categories: ["motive/easy", "food"] })).toMatchObject({ categories: ["food"] }); // a level is not a category
  });
});

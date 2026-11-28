import { describe, expect, it } from "vitest";
import { JIGSAW_LANGUAGES, JigsawIndex, JigsawSearch, JigsawSettings, JigsawTexts } from "../src/models";

// The words of a picture in the languages: written in its base language, translated into the others.

const picture = { name: "Skog", description: "Trær i tåke.", language: "nb" };
const translated = { ...picture, translations: { en: { name: "Forest", description: "Trees in fog." }, de: { name: "Wald" } } };

describe("the words of a picture in the languages", () => {
  it("lacks every language but its base one until it is translated, and nothing without a name", () => {
    const all = JIGSAW_LANGUAGES.map((l) => l.code);
    expect(JigsawTexts.lacking(picture)).toEqual(all.filter((code) => code !== "nb"));
    expect(JigsawTexts.lacking(translated)).toEqual(all.filter((code) => !["nb", "en", "de"].includes(code)));
    expect(JigsawTexts.lacking({ name: " " })).toEqual([]);
    expect(JigsawTexts.lacking({ name: "Forest" })).not.toContain("en"); // one that says no language is English
  });

  it("shows a reader the translation, and what was written where there is none", () => {
    expect(JigsawTexts.pick(translated, "en")).toEqual({ name: "Forest", description: "Trees in fog." });
    expect(JigsawTexts.pick(translated, "nb")).toEqual({ name: "Skog", description: "Trær i tåke." });
    expect(JigsawTexts.pick(translated, "fr")).toEqual({ name: "Skog", description: "Trær i tåke." });
    expect(JigsawTexts.pick(translated, "de")).toEqual({ name: "Wald", description: "Trær i tåke." });
  });

  it("keeps the base language it got when made, whatever a change says, and its translations while the words are the same", () => {
    const same = JigsawTexts.keptOver(translated, { ...picture, language: "de", translations: { fr: { name: "Faux" } } });
    expect(same).toEqual(translated); // what the page sends of either is not used
    expect(JigsawTexts.keptOver(translated, { ...picture, name: "Skogen" })).toEqual({ ...picture, name: "Skogen" });
    expect(JigsawTexts.keptOver(translated, { ...picture, description: "" })).not.toHaveProperty("translations");
    expect(JigsawTexts.keptOver({ name: "Old" }, { name: "Old", language: "nb" })).not.toHaveProperty("language"); // made with none: English for ever
    expect(JigsawTexts.asNew({ ...translated })).toEqual(picture);
  });

  it("keeps only the languages of the app, with a name", () => {
    expect(JigsawTexts.stored({ en: { name: " Forest ", description: " " }, xx: { name: "No" }, de: { description: "no name" } })).toEqual({ en: { name: "Forest" } });
    expect(JigsawTexts.stored({})).toBeUndefined();
    expect(JigsawTexts.stored("text")).toBeUndefined();
  });

  it("is stored and read with the picture, and in the summary of a list", () => {
    const doc = { ...translated, width: 100, height: 100, kind: "picture", gridSize: 0, gridVisible: false, placed: [] };
    expect(new JigsawSettings(doc).stored().translations).toEqual(translated.translations);
    expect(JigsawSettings.fromStored("a", doc as never).translations).toEqual(translated.translations);
    expect(JigsawIndex.summaryOf("a", doc).translations).toEqual(translated.translations);
  });

  it("is found by words in any of its languages", () => {
    for (const word of ["skog", "forest", "wald", "fog"]) expect(JigsawSearch.hasWords(translated, word)).toBe(true);
    expect(JigsawSearch.hasWords(translated, "forêt")).toBe(false);
    expect(JigsawTexts.namesOnly(translated.translations)).toEqual({ en: { name: "Forest" }, de: { name: "Wald" } });
  });
});

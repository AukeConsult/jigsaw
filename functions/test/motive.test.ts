import { describe, expect, it } from "vitest";
import { JigsawFilters, JigsawIndex, JigsawMotives, JigsawSearch, JigsawSettings, MOTIVES } from "../src/models";
import type { JigsawSpec, JigsawSummary } from "../src/models";

const base = { name: "A", width: 400, height: 300, gridSize: 50, gridVisible: false, placed: [] };
const summary = (id: string, over: Partial<JigsawSummary> = {}): JigsawSummary => ({ id, name: id, width: 400, height: 300, gridSize: 50, createdAt: 1, ...over });

describe("the motive difficulty is a property of a jigsaw, like its difficulty", () => {
  it("has five levels, the easiest first, and says what is a level", () => {
    expect(MOTIVES.map((m) => m.key)).toEqual(["easy", "mediumeasy", "normal", "hard", "expert"]);
    expect(JigsawMotives.is("hard")).toBe(true);
    expect(JigsawMotives.is("motive/hard")).toBe(false);
    expect(JigsawMotives.is(undefined)).toBe(false);
    expect(JigsawMotives.nameOf("mediumeasy")).toBe("Medium easy");
    expect(JigsawMotives.error(undefined)).toBe("");
    expect(JigsawMotives.error("hard")).toBe("");
    expect(JigsawMotives.error("impossible")).toMatch(/one of easy/);
  });

  it("is stored with the jigsaw when it is a level, left out when it is not, and checked by the one validation", () => {
    expect(new JigsawSettings({ ...base, motive: "expert" }).stored().motive).toBe("expert");
    expect("motive" in new JigsawSettings({ ...base }).stored()).toBe(false);
    expect("motive" in new JigsawSettings({ ...base, motive: "huge" }).stored()).toBe(false);
    expect(new JigsawSettings({ ...base, motive: "hard" }).error()).toBe("");
    expect(new JigsawSettings({ ...base, motive: "huge" }).error()).toMatch(/motive difficulty/);
  });

  it("is read from a document that an older version saved with it among the categories: it is the property now, and not a category", () => {
    const old = JigsawSettings.fromStored("j", { ...base, createdAt: 5, categories: ["nature", "motive/hard"] } as unknown as Partial<JigsawSpec>);
    expect(old.motive).toBe("hard");
    expect(old.categories).toEqual(["nature"]);
    const own = JigsawSettings.fromStored("j", { ...base, createdAt: 5, motive: "easy", categories: ["motive/hard"] } as unknown as Partial<JigsawSpec>);
    expect(own.motive).toBe("easy"); // what it says itself comes first
    expect("motive" in JigsawSettings.fromStored("j", { ...base, createdAt: 5 } as unknown as Partial<JigsawSpec>)).toBe(false);
  });

  it("is found by: a jigsaw is matched by its level, one that has none is never found by it, and the counts say how many there are of each", () => {
    const items = [summary("a", { motive: "hard" }), summary("b", { motive: "hard" }), summary("c", { motive: "easy" }), summary("d")];
    const ask = (motives: string[]) => JigsawSearch.parse({ motives: motives.join(",") });
    const parsed = ask(["hard", "expert"]);
    expect(parsed).toEqual({ query: expect.objectContaining({ motives: ["hard", "expert"] }) });
    expect(ask(["huge"])).toEqual({ error: expect.stringContaining("motives") });
    const query = (parsed as { query: Parameters<typeof JigsawSearch.matches>[1] }).query;
    expect(items.filter((j) => JigsawSearch.matches(j, query)).map((j) => j.id)).toEqual(["a", "b"]);
    expect(JigsawIndex.of({ ...items[0] }).motive).toBe("hard");
    expect("motive" in JigsawIndex.of(items[3])).toBe(false);
    const facets = JigsawSearch.facets(items, query);
    expect(facets.motives).toEqual({ hard: 2, easy: 1 }); // the counts leave the motive choice out, as for the other lists
    expect(facets.total).toBe(2);
  });

  it("is a choice of a filter like the difficulty: ticked once, taken away, checked, and asked for", () => {
    const f = JigsawFilters.toggled(JigsawFilters.empty(), "motives", "normal");
    expect(f.motives).toEqual(["normal"]);
    expect(JigsawFilters.isChosen(f, "motives", "normal")).toBe(true);
    expect(JigsawFilters.isOn(f)).toBe(true);
    expect(JigsawFilters.toggled(f, "motives", "normal").motives).toEqual([]);
    expect(JigsawFilters.toggled(f, "motives", "huge")).toBe(f); // not a level: nothing changes
    expect(JigsawFilters.query(f)).toMatchObject({ motives: ["normal"] });
    expect(JigsawFilters.query(JigsawFilters.empty())).not.toHaveProperty("motives");
    expect(JigsawFilters.is(f)).toBe(true);
    expect(JigsawFilters.is({ ...f, motives: ["huge"] })).toBe(false);
    const { motives: _none, ...kept } = f; // a filter kept before there were motive difficulties
    expect(JigsawFilters.is(kept)).toBe(true);
  });
});

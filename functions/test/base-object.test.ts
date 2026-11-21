import { describe, expect, it } from "vitest";
import { BaseObject, DEFAULT_OBJECT, OBJECT_MAX_NAME, OBJECT_MAX_SIDE } from "../src/models";
import type { ObjectInput } from "../src/models";

const check = (o: Partial<ObjectInput>) => BaseObject.of({ ...DEFAULT_OBJECT, ...o }).error();

describe("the settings of an object", () => {
  it("are fine as they are by default", () => {
    expect(check({})).toBe("");
  });

  it("need a name, at most OBJECT_MAX_NAME characters", () => {
    expect(check({ name: "   " })).toContain("name");
    expect(check({ name: "x".repeat(OBJECT_MAX_NAME + 1) })).toContain("at most");
    expect(check({ name: "x".repeat(OBJECT_MAX_NAME) })).toBe("");
  });

  it("need a width and a height that are whole pixels from 1 to the most an object can be", () => {
    for (const bad of [0, -1, 1.5, OBJECT_MAX_SIDE + 1, "10", null]) {
      expect(check({ width: bad as never })).toContain("Width");
      expect(check({ height: bad as never })).toContain("Height");
    }
    expect(check({ width: 1, height: OBJECT_MAX_SIDE })).toBe("");
  });
});

describe("what is stored of an object, and how an older object is read", () => {
  it("stores only the known fields, and trims the name", () => {
    const stored = BaseObject.stored({ ...DEFAULT_OBJECT, name: "  Box  ", evil: 1, shape: "circle", arrow: "one-way" } as unknown as ObjectInput);
    expect(stored).toEqual({ ...DEFAULT_OBJECT, name: "Box" });
  });

  it("gives an object that an older version saved what it lacked, and leaves out what only the drawing tool had", () => {
    expect(BaseObject.fromStored({ name: "Old", width: 50 })).toEqual({ name: "Old", width: 50, height: DEFAULT_OBJECT.height });
    const old = { name: "Old", shape: "circle", width: 50, height: 50, kind: "connector", arrow: "both-ways", borderWidth: 1, fontSize: 12 };
    expect(BaseObject.fromStored(old as Partial<ObjectInput>)).toEqual({ name: "Old", width: 50, height: 50 });
  });
});

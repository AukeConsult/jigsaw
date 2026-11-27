import { describe, expect, it } from "vitest";
import { DEFAULT_MENU_PLACE, JigsawUsers, MENU_PLACES, MenuPlaces } from "../src/models";

// Where the menu is and whether the rounds that are going are on the home page are preferences of the account.

describe("the place of the menu as a preference of the account", () => {
  it("knows its places and nothing else, and starts on the left", () => {
    for (const place of MENU_PLACES) expect(MenuPlaces.is(place)).toBe(true);
    expect(MenuPlaces.is("middle")).toBe(false);
    expect(DEFAULT_MENU_PLACE).toBe("left");
  });

  it("takes and reads back a place, only when it is known", () => {
    expect(JigsawUsers.change({ menuPlace: "bottom" })).toEqual({ change: { menuPlace: "bottom" } });
    expect(JigsawUsers.change({ menuPlace: "x" })).toHaveProperty("error");
    expect(JigsawUsers.fromStored("a", { menuPlace: "floating" }).menuPlace).toBe("floating");
    expect(JigsawUsers.fromStored("a", { menuPlace: "x" as never }).menuPlace).toBeUndefined();
  });
});

describe("the rounds on the home page as a preference of the account", () => {
  it("takes yes and no, and keeps a no", () => {
    expect(JigsawUsers.change({ showOngoing: false })).toEqual({ change: { showOngoing: false } });
    expect(JigsawUsers.change({ showOngoing: "no" })).toHaveProperty("error");
    expect(JigsawUsers.fromStored("a", { showOngoing: false }).showOngoing).toBe(false);
    expect(JigsawUsers.fromStored("a", {}).showOngoing).toBeUndefined();
  });
});

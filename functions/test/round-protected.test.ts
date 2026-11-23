import { describe, expect, it } from "vitest";
import { Plays } from "../src/models";
import type { PlaySpec } from "../src/models";

// A round started by a login of the account that plays it is marked with that login (kept for later use) and is protected by the account; the page is told only that, never the login.

const play: Omit<PlaySpec, "id"> = { jigsawId: "j", userId: "u1", userName: "U1", status: "active", startedAt: 1, matched: 0, total: 4, storeWidth: 100, overrides: {} };

describe("a round marked with the login that plays it", () => {
  it("is marked when the login is one of the logins of the account", () => {
    expect(Plays.marked(play, { firebaseUids: ["fb-a", "fb-b"] }, "fb-b")).toMatchObject({ logonUid: "fb-b" });
  });

  it("is not marked by a login that is not one of them, no login, or an account that has none", () => {
    expect(Plays.marked(play, { firebaseUids: ["fb-a"] }, "fb-x")).toEqual(play);
    expect(Plays.marked(play, { firebaseUids: ["fb-a"] }, undefined)).toEqual(play);
    expect(Plays.marked(play, {}, "fb-a")).toEqual(play);
  });

  it("is kept when stored, and the page is told only that it is protected", () => {
    const marked = { id: "p", ...Plays.marked(play, { firebaseUids: ["fb-a"] }, "fb-a") } as PlaySpec;
    expect(Plays.stored(marked).logonUid).toBe("fb-a");
    const open = Plays.publicOf(marked);
    expect(open.protected).toBe(true);
    expect(JSON.stringify(open)).not.toContain("fb-a");
    expect(Plays.publicOf({ id: "q", ...play })).not.toHaveProperty("protected");
  });
});

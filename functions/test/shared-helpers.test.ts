import { describe, expect, it, vi } from "vitest";
import { findById } from "../src/common/document-store";
import { TtlCache } from "../src/common/ttl-cache";
import { JigsawCut, JigsawPieces, LogonAccounts, UserLevels } from "../src/models";

describe("answers kept for a while (TtlCache)", () => {
  const clock = { now: 0 };
  const made = (max?: number) => new TtlCache<number>(100, max, () => clock.now);

  it("asks once for calls at the same time and until the time is up", async () => {
    const cache = made();
    const ask = vi.fn(async () => 1);
    expect(await Promise.all([cache.get("a", ask), cache.get("a", ask)])).toEqual([1, 1]);
    clock.now += 99;
    await cache.get("a", ask);
    expect(ask).toHaveBeenCalledTimes(1);
    clock.now += 1;
    await cache.get("a", ask);
    expect(ask).toHaveBeenCalledTimes(2);
  });

  it("does not keep a question that failed, and forgets one key or all", async () => {
    const cache = made();
    await expect(cache.get("a", async () => Promise.reject(new Error("down")))).rejects.toThrow("down");
    expect(await cache.get("a", async () => 2)).toBe(2);
    await cache.get("b", async () => 3);
    cache.forget("a");
    expect(await cache.get("a", async () => 4)).toBe(4);
    expect(await cache.get("b", async () => 9)).toBe(3);
    cache.forget();
    expect(await cache.get("b", async () => 9)).toBe(9);
  });

  it("forgets everything before it keeps more than it may", async () => {
    const cache = made(2);
    for (const key of ["a", "b", "c"]) await cache.get(key, async () => 1);
    expect(await cache.get("a", async () => 7)).toBe(7);
  });
});

describe("what several routes share", () => {
  const items = [{ id: "a" }, { id: "b" }];

  it("finds one by its id, also in a store that can only list", async () => {
    expect(await findById({ list: async () => items }, "b")).toEqual({ id: "b" });
    expect(await findById({ list: async () => items }, "x")).toBeNull();
    expect(await findById({ list: async () => [], get: async (id) => ({ id }) }, "old")).toEqual({ id: "old" });
  });

  it("counts the other admins: only those with a login", () => {
    const users = [{ id: "me", level: "admin", firebaseUids: ["1"] }, { id: "two", level: "admin", firebaseUids: ["2"] }, { id: "open", level: "admin" }];
    expect(UserLevels.otherAdmins(users, "me")).toBe(1);
    expect(UserLevels.otherAdmins(users, "nobody")).toBe(2);
  });

  it("tells the page only these of an account a login is verified for", () => {
    const stored = { id: "u", name: "U", username: "u", language: "en", createdAt: 1, firebaseUids: ["secret"] };
    expect(LogonAccounts.linkedUser(stored)).toEqual({ id: "u", name: "U", username: "u" });
    expect(LogonAccounts.linkedUser({ ...stored, pictureAt: 2, level: "admin" } as never)).toEqual({ id: "u", name: "U", username: "u", pictureAt: 2, level: "admin" });
  });

  it("gives the pieces of a cut as they are kept", () => {
    const cutting = JigsawCut.cut(200, 150, 50, () => 0.3);
    if ("error" in cutting) throw new Error(cutting.error);
    expect(JigsawPieces.ofCut(cutting)).toEqual(cutting.placed.map((p) => JigsawPieces.of(p, cutting.columns)));
    expect(JigsawPieces.ofCut(cutting)).toHaveLength(12);
  });
});

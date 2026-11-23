import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import type { JigsawSearchStore } from "../src/jigsaw/jigsaw-search";
import type { PlaySpec } from "../src/models";
import { JigsawUsers } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryPlays, memoryUsers } from "./memory-plays";
import type { LogonToken } from "../src/models";
import type { AccountDirectory, AccountStore, TokenVerifier } from "../src/logons";

// A user is deleted only when nothing is attached to it: no jigsaw it owns, no round it has played (an opened round nobody moved a piece in does not count, and goes with it) and no login besides the
// one that asks. A user that has logins is deleted only by one of them (the gate).

const token = (uid: string): LogonToken => ({ uid, email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" } });
const verifier: TokenVerifier = { async verify(t) { if (t !== "a" && t !== "b") throw new Error("bad"); return token(`fb-${t}`); } };
const directory: AccountDirectory = { async gone() { return []; } };
const accounts: AccountStore = { async sync() { throw new Error("not used"); }, async read() { return {}; } };

function setup(owned: string[] = []) {
  const users = memoryUsers("u1");
  const plays = memoryPlays();
  const jigsaw: JigsawStore = { list: async () => [{ id: "j1", name: "J" } as never], get: async () => null, add: async () => { throw new Error("not used"); }, update: async () => null, remove: async () => false };
  const jigsawSearch: JigsawSearchStore = { load: async () => owned.map((ownerUid) => ({ id: "j9", ownerUid }) as never), forget() {} };
  const app = createJigsawApp({ users, plays, jigsaw, jigsawSearch, accountPictures: memoryImages(), viewKeySecret: TEST_KEY_SECRET, logons: { verifier, accounts, directory, codes: { async create() {}, async consume() { return false; } } } });
  const del = (auth?: string) => { const r = request(app).delete("/jigsaw/api/jigsaw-users/u1"); if (auth) r.set("Authorization", `Bearer ${auth}`); return r; };
  const play = (fresh: boolean) => plays.create("j1", { jigsawId: "j1", userId: "u1", userName: "U1", status: "ongoing", startedAt: 1, matched: 0, total: 4, storeWidth: 100, ...(fresh ? { fresh: true } : {}) } as Omit<PlaySpec, "id">, {} as never);
  return { users, plays, del, play };
}

describe("deleting a user", () => {
  it("says why a user may not go, and lets one with nothing attached go", () => {
    expect(JigsawUsers.removeError({ jigsaws: 0, rounds: 0, logins: 0 })).toBe("");
    expect(JigsawUsers.removeError({ jigsaws: 0, rounds: 0, logins: 1 })).toBe("");
    expect(JigsawUsers.removeError({ jigsaws: 1, rounds: 0, logins: 1 })).toMatch(/jigsaws/);
    expect(JigsawUsers.removeError({ jigsaws: 0, rounds: 2, logins: 1 })).toMatch(/rounds/);
    expect(JigsawUsers.removeError({ jigsaws: 0, rounds: 0, logins: 2 })).toMatch(/logins/);
  });

  it("deletes a user with nothing attached, and a round nobody moved a piece in goes with it", async () => {
    const t = setup();
    await t.play(true);
    expect((await t.del()).status).toBe(204);
    expect(await t.users.get("u1")).toBeNull();
    expect(await t.plays.list("j1")).toEqual([]);
    expect((await t.del()).status).toBe(404);
  });

  it("refuses a user that owns a jigsaw or has played a round", async () => {
    const owner = setup(["u1"]);
    expect((await owner.del()).status).toBe(409);
    expect(await owner.users.get("u1")).not.toBeNull();
    const player = setup();
    await player.play(false);
    const res = await player.del();
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/rounds/);
    expect(await player.users.get("u1")).not.toBeNull();
  });

  it("is done by its only login, and refused while another login is verified for it", async () => {
    const t = setup();
    await t.users.changeLogons("u1", () => ["fb-a"]);
    expect((await t.del()).status).toBe(401); // needs its login
    expect((await t.del("b")).status).toBe(403); // not one of its logins
    await t.users.changeLogons("u1", () => ["fb-a", "fb-b"]);
    expect((await t.del("a")).status).toBe(409);
    await t.users.changeLogons("u1", () => ["fb-a"]);
    expect((await t.del("a")).status).toBe(204);
    expect(await t.users.get("u1")).toBeNull();
  });
});

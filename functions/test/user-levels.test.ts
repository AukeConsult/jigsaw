import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { AccountDirectory, AccountStore, TokenVerifier } from "../src/logons";
import { JigsawCut, JigsawPieces, JigsawSpec, JigsawUsers, LogonAccounts, UserLevels } from "../src/models";
import type { LogonToken } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// The level of an account: user, publisher or admin. It counts only for an account that needs a login (the header `X-Jigsaw-User` is not a lock for one that does not), the gate has seen that the
// login may act as it, and only an admin sets levels. No test calls Firebase: tokens are fakes.

const tokenOf = (uid: string): LogonToken => ({ uid, email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" } });
const KNOWN: Record<string, LogonToken> = { boss: tokenOf("fb-boss"), pub: tokenOf("fb-pub"), plain: tokenOf("fb-plain"), boss2: tokenOf("fb-boss2"), stranger: tokenOf("fb-stranger") };
const verifier: TokenVerifier = {
  async verify(idToken) {
    const token = KNOWN[idToken];
    if (!token) throw new Error("bad token");
    return token;
  },
};
const accounts: AccountStore = { sync: async (token) => ({ account: LogonAccounts.stored(token, undefined, () => "stamp"), created: true }), read: async () => ({}) };
const directory: AccountDirectory = { gone: async () => [] };

describe("UserLevels (the model)", () => {
  it("has three levels, each with the rights of the one before", () => {
    expect(UserLevels.is("publisher")).toBe(true);
    expect(UserLevels.is("owner")).toBe(false);
    expect(UserLevels.error("boss")).toMatch(/user, publisher, admin/);
    expect(UserLevels.mayPublish("user")).toBe(false);
    expect(UserLevels.mayPublish("publisher")).toBe(true);
    expect(UserLevels.mayPublish("admin")).toBe(true);
    expect(UserLevels.isAdmin("publisher")).toBe(false);
    expect(UserLevels.isAdmin("admin")).toBe(true);
  });

  it("counts a level only for an account that needs a login", () => {
    expect(UserLevels.stored({ level: "admin" })).toBe("admin");
    expect(UserLevels.stored({ level: "root" })).toBe("user");
    expect(UserLevels.of({ level: "admin" })).toBe("user"); // anybody can send its id
    expect(UserLevels.of({ level: "admin", firebaseUids: [] })).toBe("user");
    expect(UserLevels.of({ level: "admin", firebaseUids: ["x"] })).toBe("admin");
    expect(UserLevels.of({ level: "publisher", protected: true })).toBe("publisher"); // as the page is told
    expect(UserLevels.of({ firebaseUids: ["x"] })).toBe("user");
    expect(UserLevels.of(null)).toBe("user");
  });

  it("lets only a publisher make a jigsaw public, and lets one that is public stay so", () => {
    expect(UserLevels.publishError("user", undefined, null)).toMatch(/publisher/); // none says public
    expect(UserLevels.publishError("user", "everyone", null)).toMatch(/publisher/);
    expect(UserLevels.publishError("user", "owner", null)).toBe("");
    expect(UserLevels.publishError("user", "hidden", { visibility: "everyone" })).toBe("");
    expect(UserLevels.publishError("user", "everyone", { visibility: "hidden" })).toMatch(/publisher/);
    expect(UserLevels.publishError("user", undefined, { visibility: "owner" })).toMatch(/publisher/);
    expect(UserLevels.publishError("user", "everyone", { visibility: undefined })).toBe(""); // public already
    expect(UserLevels.publishError("publisher", "everyone", null)).toBe("");
  });

  it("does not let the last admin step down", () => {
    expect(UserLevels.changeError("admin", "user", 0)).toMatch(/last admin/);
    expect(UserLevels.changeError("admin", "user", 1)).toBe("");
    expect(UserLevels.changeError("admin", "admin", 0)).toBe("");
    expect(UserLevels.changeError("user", "admin", 0)).toBe("");
  });

  it("is kept on a user, and never made by the body that makes one", () => {
    expect(JigsawUsers.fromStored("u", { username: "u", name: "U", createdAt: 1, level: "publisher" }).level).toBe("publisher");
    expect(JigsawUsers.fromStored("u", { username: "u", name: "U", createdAt: 1, level: "user" }).level).toBeUndefined();
    expect(JigsawUsers.fromStored("u", { username: "u", name: "U", createdAt: 1, level: "root" as never }).level).toBeUndefined();
    expect(JigsawUsers.stored({ username: "uuu", name: "U", ...{ level: "admin" } }, 1)).not.toHaveProperty("level");
    expect(JigsawUsers.change({ name: "N", ...{ level: "admin" } })).toEqual({ change: { name: "N" } });
  });
});

async function setup() {
  const users = memoryUsers("boss", "boss2", "pub", "plain", "free", "owner");
  const jigsaws = memoryJigsaws();
  const pieces = memoryPieces();
  const plays = memoryPlays();
  const app = createJigsawApp({ users, plays, jigsaw: jigsaws, jigsawPieces: pieces, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), viewKeySecret: TEST_KEY_SECRET, accountPictures: memoryImages(), jigsawSearch: { load: async () => jigsaws.list(), forget() {} }, logons: { verifier, accounts, directory } });
  for (const [id, uid] of [["boss", "fb-boss"], ["boss2", "fb-boss2"], ["pub", "fb-pub"], ["plain", "fb-plain"]]) await users.changeLogons(id, () => [uid]);
  await users.update("boss", { level: "admin" });
  await users.update("boss2", { level: "admin" });
  await users.update("pub", { level: "publisher" });
  await users.update("free", { level: "admin" }); // an admin on paper: it needs no login, so anybody could say it is theirs
  const call = (method: "get" | "put" | "post" | "delete", path: string, as?: string, token?: string) => {
    const r = request(app)[method](`/jigsaw/api${path}`);
    if (as) r.set("X-Jigsaw-User", as);
    if (token) r.set("Authorization", `Bearer ${token}`);
    return r;
  };
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [] };
  const make = async (as: string, token: string | undefined, extra: Record<string, unknown> = {}) => call("post", "/jigsaw", as, token).send({ ...settings, ownerUid: as, ...extra });
  return { app, users, jigsaws, pieces, plays, call, make, settings };
}

describe("who may make a jigsaw public", () => {
  it("is a publisher or an admin: an account makes private or hidden jigsaws", async () => {
    const { make } = await setup();
    expect((await make("plain", "plain")).status).toBe(403); // none says public
    expect((await make("plain", "plain", { visibility: "everyone" })).status).toBe(403);
    expect((await make("plain", "plain", { visibility: "owner" })).status).toBe(201);
    expect((await make("plain", "plain", { visibility: "hidden" })).status).toBe(201);
    expect((await make("pub", "pub")).status).toBe(201);
    expect((await make("boss", "boss")).status).toBe(201);
  });

  it("does not count the level of an account that needs no login", async () => {
    const { make } = await setup();
    expect((await make("free", undefined)).status).toBe(403);
  });

  it("lets a plain account keep a public jigsaw public, but not make a private one public", async () => {
    const { make, call, settings } = await setup();
    const open = (await make("pub", "pub")).body as JigsawSpec;
    const mine = (await make("plain", "plain", { visibility: "owner" })).body as JigsawSpec;
    const put = (id: string, as: string, extra: Record<string, unknown>) => call("put", `/jigsaw/${id}`, as, as).send({ ...settings, ownerUid: as, ...extra });
    // a public jigsaw that was handed over to a plain account keeps its visibility when the name is changed
    expect((await put(open.id, "pub", { name: "Handed over", ownerUid: "plain" })).status).toBe(200);
    expect((await put(open.id, "plain", { name: "New name" })).status).toBe(200);
    expect((await put(mine.id, "plain", { name: "x" })).status).toBe(403); // saying nothing is public
    expect((await put(mine.id, "plain", { name: "x", visibility: "everyone" })).status).toBe(403);
    expect((await put(mine.id, "plain", { name: "x", visibility: "hidden" })).status).toBe(200);
  });
});

describe("what an admin may do with what is not theirs", () => {
  it("changes and deletes any jigsaw; others cannot", async () => {
    const { make, call, settings } = await setup();
    const theirs = (await make("pub", "pub")).body as JigsawSpec;
    const change = { ...settings, name: "Renamed", ownerUid: "pub" };
    expect((await call("put", `/jigsaw/${theirs.id}`, "plain", "plain").send(change)).status).toBe(403);
    expect((await call("delete", `/jigsaw/${theirs.id}`, "plain", "plain")).status).toBe(403);
    expect((await call("put", `/jigsaw/${theirs.id}`, "boss", "boss").send(change)).status).toBe(200);
    expect((await call("get", `/jigsaw/${theirs.id}`, "boss", "boss")).body.name).toBe("Renamed");
    expect((await call("delete", `/jigsaw/${theirs.id}`, "boss", "boss")).status).toBe(204);
  });

  it("is not an admin by sending the id of one: the login is asked for, and an account that needs none has no level", async () => {
    const { make, call, settings } = await setup();
    const theirs = (await make("pub", "pub")).body as JigsawSpec;
    expect((await call("delete", `/jigsaw/${theirs.id}`, "boss")).status).toBe(401); // no token: the gate
    expect((await call("delete", `/jigsaw/${theirs.id}`, "boss", "plain")).status).toBe(403); // another login
    expect((await call("delete", `/jigsaw/${theirs.id}`, "free")).status).toBe(403); // asks no login, and is a plain account
    expect((await call("put", `/jigsaw/${theirs.id}`, "free").send({ ...settings, ownerUid: "pub" })).status).toBe(403);
  });

  it("sees a private or hidden jigsaw of another, also in the lists (a private one), and can change and delete it; others get 404", async () => {
    const { make, call } = await setup();
    const secret = (await make("plain", "plain", { visibility: "owner" })).body as JigsawSpec;
    const hidden = (await make("plain", "plain", { visibility: "hidden" })).body as JigsawSpec;
    expect((await call("get", `/jigsaw/${secret.id}`, "pub", "pub")).status).toBe(404);
    expect((await call("get", `/jigsaw/${secret.id}`, "boss", "boss")).status).toBe(200);
    expect((await call("get", `/jigsaw/${hidden.id}`, "boss", "boss")).status).toBe(200);
    expect((await call("get", `/jigsaw/${hidden.id}`, "pub", "pub")).status).toBe(404);
    expect((await call("get", `/jigsaw/${secret.id}`, "plain", "plain")).status).toBe(200); // the owner
    const change = { name: "Seen", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], ownerUid: "plain", visibility: "owner" };
    const listed = (as: string) => call("get", `/jigsaw`, as, as).then((r) => r.body.map((j: JigsawSpec) => j.id) as string[]);
    expect(await listed("boss")).not.toContain(secret.id); // an admin opens them by address, but does not find them in the list
    expect(await listed("boss")).not.toContain(hidden.id);
    expect(await listed("plain")).toEqual(expect.arrayContaining([secret.id, hidden.id])); // the owner finds both
    expect(await listed("pub")).not.toContain(secret.id);
    expect((await call("put", `/jigsaw/${secret.id}`, "pub", "pub").send(change)).status).toBe(404);
    expect((await call("put", `/jigsaw/${secret.id}`, "boss", "boss").send(change)).status).toBe(200);
    expect((await call("delete", `/jigsaw/${secret.id}`, "pub", "pub")).status).toBe(403);
    expect((await call("delete", `/jigsaw/${secret.id}`, "boss", "boss")).status).toBe(204);
    expect((await call("delete", `/jigsaw/${hidden.id}`, "plain", "plain")).status).toBe(204);
  });

  it("starts a round on a private jigsaw of another, which a publisher and a player cannot", async () => {
    const { app, make, pieces } = await setup();
    const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
    if ("error" in cut) throw new Error(cut.error);
    const secret = (await make("plain", "plain", { visibility: "owner" })).body as JigsawSpec;
    await pieces.replaceAll(secret.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
    const start = (as: string, token: string) => request(app).post(`/jigsaw/api/jigsaw/${secret.id}/plays`).set("X-Jigsaw-User", as).set("Authorization", `Bearer ${token}`).send({ userId: as });
    expect((await start("pub", "pub")).status).toBe(404); // cannot even see it
    expect((await start("boss", "boss")).status).toBe(201);
    expect((await start("plain", "plain")).status).toBe(201); // its owner
  });

  it("changes and deletes the round of another player; a publisher cannot", async () => {
    const { app, make, call, pieces } = await setup();
    const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
    if ("error" in cut) throw new Error(cut.error);
    const made = (await make("pub", "pub")).body as JigsawSpec;
    await pieces.replaceAll(made.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
    const round = (await request(app).post(`/jigsaw/api/jigsaw/${made.id}/plays`).set("X-Jigsaw-User", "plain").set("Authorization", "Bearer plain").send({ userId: "plain" })).body as { id: string };
    expect(round.id).toBeTruthy();
    expect((await call("delete", `/jigsaw/${made.id}/plays/${round.id}`, "pub", "pub")).status).toBe(403);
    expect((await call("delete", `/jigsaw/${made.id}/plays/${round.id}`, "boss", "boss")).status).toBe(204);
  });
});

describe("setting a level", () => {
  it("is for an admin only", async () => {
    const { call } = await setup();
    expect((await call("put", "/jigsaw-levels/plain", "pub", "pub").send({ level: "admin" })).status).toBe(403);
    expect((await call("put", "/jigsaw-levels/plain", "plain", "plain").send({ level: "admin" })).status).toBe(403); // not even for themselves
    expect((await call("put", "/jigsaw-levels/plain", "free").send({ level: "publisher" })).status).toBe(403); // an admin on paper, with no login
    expect((await call("put", "/jigsaw-levels/plain").send({ level: "publisher" })).status).toBe(403);
    expect((await call("put", "/jigsaw-levels/plain", "boss").send({ level: "publisher" })).status).toBe(401); // the gate asks for the admin's login
  });

  it("gives an account a level at once, and the account then may do what it brings", async () => {
    const { call, make } = await setup();
    expect((await make("plain", "plain")).status).toBe(403);
    const set = await call("put", "/jigsaw-levels/plain", "boss", "boss").send({ level: "publisher" });
    expect(set.status).toBe(200);
    expect(set.body).toMatchObject({ id: "plain", level: "publisher", protected: true });
    expect(set.body).not.toHaveProperty("firebaseUids");
    expect((await make("plain", "plain")).status).toBe(201);
    expect((await call("get", "/jigsaw-users/plain")).body.level).toBe("publisher"); // the list tells the level
    const back = await call("put", "/jigsaw-levels/plain", "boss", "boss").send({ level: "user" });
    expect(back.body.level).toBeUndefined();
    expect((await make("plain", "plain")).status).toBe(403);
  });

  it("refuses a level that does not exist, an account that does not exist, and the last admin stepping down", async () => {
    const { call, users } = await setup();
    expect((await call("put", "/jigsaw-levels/plain", "boss", "boss").send({ level: "root" })).status).toBe(400);
    expect((await call("put", "/jigsaw-levels/plain", "boss", "boss").send({})).status).toBe(400);
    expect((await call("put", "/jigsaw-levels/nobody", "boss", "boss").send({ level: "user" })).status).toBe(404);
    expect((await call("put", "/jigsaw-levels/boss2", "boss", "boss").send({ level: "user" })).status).toBe(200); // boss is still there
    const last = await call("put", "/jigsaw-levels/boss", "boss", "boss").send({ level: "publisher" });
    expect(last.status).toBe(409);
    expect(last.body.error).toMatch(/last admin/);
    expect((await users.get("boss"))?.level).toBe("admin");
  });

  it("is not given by the body that changes or makes an account", async () => {
    const { call, users } = await setup();
    await call("put", "/jigsaw-users/plain", "plain", "plain").send({ name: "Plain Jane", level: "admin" });
    expect((await users.get("plain"))?.level).toBeUndefined();
    expect((await call("post", "/jigsaw-users").send({ username: "newone", name: "New", level: "admin" })).body.level).toBeUndefined();
  });
});

describe("what an admin may do with the accounts of others", () => {
  it("changes the name and the alias of an account that needs a login; others cannot", async () => {
    const { call, users } = await setup();
    expect((await call("put", "/jigsaw-users/plain", "pub", "pub").send({ name: "By a publisher" })).status).toBe(403); // another login
    expect((await call("put", "/jigsaw-users/plain", "free").send({ name: "By nobody" })).status).toBe(401); // an admin on paper, with no login
    expect((await call("put", "/jigsaw-users/plain", "boss").send({ name: "No token" })).status).toBe(401);
    const changed = await call("put", "/jigsaw-users/plain", "boss", "boss").send({ name: "Renamed", username: "renamed" });
    expect(changed.status).toBe(200);
    expect((await users.get("plain"))?.name).toBe("Renamed");
    expect((await users.get("plain"))?.username).toBe("renamed");
  });

  it("deletes an account that has nothing attached, whatever logins it has; others cannot", async () => {
    const { call, users } = await setup();
    await users.changeLogons("plain", () => ["fb-plain", "fb-extra"]); // two logins: its own owner would have to take one away first
    expect((await call("delete", "/jigsaw-users/plain", "pub", "pub")).status).toBe(403);
    expect((await call("delete", "/jigsaw-users/plain", "boss", "boss")).status).toBe(204);
    expect(await users.get("plain")).toBeNull();
  });

  it("does not delete an account that owns a jigsaw, nor the last admin", async () => {
    const { call, make, users } = await setup();
    await make("plain", "plain", { visibility: "owner" });
    const owns = await call("delete", "/jigsaw-users/plain", "boss", "boss");
    expect(owns.status).toBe(409);
    expect(owns.body.error).toMatch(/owns jigsaws/);
    await call("put", "/jigsaw-levels/boss2", "boss", "boss").send({ level: "user" });
    const last = await call("delete", "/jigsaw-users/boss", "boss", "boss");
    expect(last.status).toBe(409);
    expect(last.body.error).toMatch(/last admin/);
    expect(await users.get("boss")).not.toBeNull();
  });

  it("does not manage the logins of another account", async () => {
    const { call } = await setup();
    expect((await call("get", "/jigsaw-users/plain/logons", "boss", "boss")).status).toBe(403);
    expect((await call("post", "/jigsaw-users/plain/logons/codes", "boss", "boss")).status).toBe(403);
  });
});

describe("setting a level while there is no admin", () => {
  it("is open to any account that exists, so the first admin can be made; once there is one it is for admins only", async () => {
    const users = memoryUsers("ann", "bob", "cy");
    for (const [id, uid] of [["ann", "fb-boss"], ["bob", "fb-pub"]]) await users.changeLogons(id, () => [uid]);
    const app = createJigsawApp({ users, plays: memoryPlays(), jigsaw: memoryJigsaws(), viewKeySecret: TEST_KEY_SECRET, logons: { verifier, accounts, directory } });
    const put = (target: string, level: string, as: string | undefined, token?: string) => {
      const r = request(app).put(`/jigsaw/api/jigsaw-levels/${target}`);
      if (as) r.set("X-Jigsaw-User", as);
      if (token) r.set("Authorization", `Bearer ${token}`);
      return r.send({ level });
    };
    const open = async () => (await request(app).get("/jigsaw/api/jigsaw-levels/open")).body.open;
    expect(await open()).toBe(true);
    expect((await put("ann", "admin", undefined)).status).toBe(403); // nobody asks
    expect((await put("ann", "admin", "nobody")).status).toBe(403); // no such account
    expect((await put("cy", "admin", "bob", "pub")).status).toBe(409); // cy has no verified login: it can only be a user
    expect((await put("ann", "admin", "bob", "pub")).status).toBe(200); // any account makes the first admin
    expect(await open()).toBe(false);
    expect((await put("bob", "admin", "bob", "pub")).status).toBe(403); // now only an admin
    expect((await put("bob", "publisher", "ann", "boss")).status).toBe(200);
    expect((await users.get("bob"))?.level).toBe("publisher");
  });

  it("does not count an admin on paper (an account that needs no login) as an admin", async () => {
    const users = memoryUsers("ann");
    await users.update("ann", { level: "admin" });
    const app = createJigsawApp({ users, plays: memoryPlays(), jigsaw: memoryJigsaws(), viewKeySecret: TEST_KEY_SECRET, logons: { verifier, accounts, directory } });
    expect((await request(app).get("/jigsaw/api/jigsaw-levels/open")).body.open).toBe(true);
    expect(UserLevels.hasAdmin([{ level: "admin" }])).toBe(false);
    expect(UserLevels.hasAdmin([{ level: "admin", firebaseUids: ["x"] }])).toBe(true);
  });
});

describe("an account with no verified login", () => {
  it("can never be more than a user: it cannot be given a higher level, and loses its level when it is open again", async () => {
    const { call, users } = await setup();
    const refused = await call("put", "/jigsaw-levels/owner", "boss", "boss").send({ level: "publisher" }); // owner has no login
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatch(/verified login/);
    expect((await call("put", "/jigsaw-levels/owner", "boss", "boss").send({ level: "user" })).status).toBe(200);
    expect(UserLevels.setError({ firebaseUids: ["x"] }, "admin")).toBe("");
    expect(UserLevels.setError({ protected: true }, "admin")).toBe("");
    expect(UserLevels.setError({}, "user")).toBe("");
    await users.changeLogons("pub", () => []); // its last login goes: the account is open again
    expect((await users.get("pub"))?.level).toBeUndefined();
    await users.changeLogons("pub", () => ["fb-pub"]); // and a login that verifies it later does not find a level there
    expect(UserLevels.of(await users.get("pub"))).toBe("user");
  });
});

describe("an admin acts as another account with nothing but the admin's own login (the Bearer token)", () => {
  /** `as` is the account the call acts as (`X-Jigsaw-User`), `token` is the login that comes: there is no other key */
  const act = async (as: string, token: string | undefined, method: "get" | "put" | "post" | "delete" = "get", path = "/jigsaw-users/plain/plays") => {
    const { call, make, settings } = await setup();
    const owned = (await make("plain", "plain", { visibility: "owner" })).body as JigsawSpec;
    return { r: call(method, path, as, token), owned, settings, call };
  };

  it("acts as the account, without its login: sees its private jigsaws, changes and deletes them", async () => {
    const { r, owned, settings, call } = await act("plain", "boss", "get", "/jigsaw");
    expect((await r).body.map((j: JigsawSpec) => j.id)).toContain(owned.id); // the list of that account, with its own private jigsaw (the admin's own list is another thing, see the front page test)
    const change = { ...settings, name: "Edited as plain", ownerUid: "plain", visibility: "owner" };
    expect((await call("get", `/jigsaw/${owned.id}`, "plain", "boss")).status).toBe(200); // and the page of it, by its address
    expect((await call("put", `/jigsaw/${owned.id}`, "plain", "boss").send(change)).status).toBe(200);
    expect((await call("get", `/jigsaw/${owned.id}`, "plain", "boss")).body.name).toBe("Edited as plain");
    expect((await call("delete", `/jigsaw/${owned.id}`, "plain", "boss")).status).toBe(204);
  });

  it("is only for a login that is an admin's: not another account's, not no login, not an admin on paper", async () => {
    expect((await (await act("plain", "pub")).r).status).toBe(403); // the login of a publisher
    expect((await (await act("plain", "plain")).r).status).toBe(200); // its own login, as always
    expect((await (await act("plain", undefined)).r).status).toBe(401); // no login
    expect((await (await act("plain", "boss2")).r).status).toBe(200); // another admin's login is an admin's too
    expect((await (await act("boss", "pub")).r).status).toBe(403); // a publisher cannot act as an admin
  });

  it("does not open the logins of the account, even to an admin's login", async () => {
    expect((await (await act("plain", "boss", "get", "/jigsaw-users/plain/logons")).r).status).toBe(403);
    expect((await (await act("plain", "boss", "post", "/jigsaw-users/plain/logons/codes")).r).status).toBe(403);
  });

  it("changes and deletes the accounts of others, the same way", async () => {
    const { call, users } = await setup();
    expect((await call("put", "/jigsaw-users/plain", "pub", "pub").send({ name: "By a publisher" })).status).toBe(403);
    expect((await call("put", "/jigsaw-users/plain", "boss", "boss").send({ name: "Renamed", username: "renamed" })).status).toBe(200);
    expect((await users.get("plain"))?.name).toBe("Renamed");
    expect((await call("delete", "/jigsaw-users/plain", "boss", "boss")).status).toBe(204);
  });

  it("is accepted on every call and on every item, also a call that names no account at all", async () => {
    const { call, make, settings, users } = await setup();
    const secret = (await make("plain", "plain", { visibility: "owner" })).body as JigsawSpec;
    const open = (await make("pub", "pub")).body as JigsawSpec;
    // no `X-Jigsaw-User` at all: the login is what counts
    expect((await call("get", `/jigsaw/${secret.id}`, undefined, "boss")).status).toBe(200); // another's private jigsaw
    expect((await call("put", `/jigsaw/${open.id}`, undefined, "boss").send({ ...settings, ownerUid: "pub", name: "By an admin login" })).status).toBe(200);
    expect((await call("put", "/jigsaw-users/plain", undefined, "boss").send({ name: "Renamed with no header" })).status).toBe(200);
    expect((await call("put", "/jigsaw-levels/pub", undefined, "boss").send({ level: "user" })).status).toBe(200);
    expect((await call("delete", `/jigsaw/${secret.id}`, undefined, "boss")).status).toBe(204);
    expect((await users.get("plain"))?.name).toBe("Renamed with no header");
    // the same calls with a login that is no admin's: nothing of it
    expect((await call("put", "/jigsaw-levels/pub", undefined, "pub").send({ level: "admin" })).status).toBe(403);
    expect((await call("delete", `/jigsaw/${open.id}`, undefined, "plain")).status).toBe(403);
  });

  it("has nothing else to carry: a call that says it is an admin in a header of its own is no more than a call without it", async () => {
    const { call } = await setup();
    // the old extra header is not known any more: only the login counts, so it grants nothing to a login that is no admin's
    expect((await call("put", "/jigsaw-users/plain", "plain", "pub").set("X-Jigsaw-Admin", "boss").send({ name: "No" })).status).toBe(403);
    expect((await call("put", "/jigsaw-users/plain", "plain", "plain").set("X-Jigsaw-Admin", "nobody").send({ name: "Own" })).status).toBe(200); // the account's own login, whatever header comes
  });
});

describe("an admin in an account has the rights of an admin there", () => {
  const inside = async (account: string) => {
    const { call, make, settings, users } = await setup();
    const asAdmin = (method: "get" | "put" | "post" | "delete", path: string) => call(method, path, account, "boss"); // the admin's own login is all that comes
    return { asAdmin, call, make, settings, users };
  };

  it("makes a public jigsaw as a plain account, which that account alone cannot", async () => {
    for (const account of ["plain", "owner"]) {
      // `plain` needs a login, `owner` needs none: the admin's rights do not depend on that
      const { asAdmin, call, settings } = await inside(account);
      const own = { ...settings, ownerUid: account };
      expect((await call("post", "/jigsaw", account, account === "plain" ? "plain" : undefined).send(own)).status).toBe(403);
      expect((await asAdmin("post", "/jigsaw").send(own)).status).toBe(201);
    }
  });

  it("sees the private jigsaws of every account, changes the accounts of others and sets levels", async () => {
    const { asAdmin, make, settings, users } = await inside("plain");
    const theirs = (await make("pub", "pub", { visibility: "owner" })).body as JigsawSpec;
    expect((await asAdmin("get", `/jigsaw/${theirs.id}`)).status).toBe(200);
    expect((await asAdmin("put", `/jigsaw/${theirs.id}`).send({ ...settings, ownerUid: "pub", visibility: "owner", name: "Edited by an admin in plain" })).status).toBe(200);
    expect((await asAdmin("put", "/jigsaw-users/pub").send({ name: "Pub renamed" })).status).toBe(200);
    expect((await users.get("pub"))?.name).toBe("Pub renamed");
    expect((await asAdmin("put", "/jigsaw-levels/pub").send({ level: "user" })).status).toBe(200);
    expect((await users.get("pub"))?.level).toBeUndefined();
  });

  it("is only for the login of an admin: the account has no such rights with its own login", async () => {
    const { call, make } = await inside("plain");
    const theirs = (await make("pub", "pub", { visibility: "owner" })).body as JigsawSpec;
    expect((await call("get", `/jigsaw/${theirs.id}`, "plain", "plain")).status).toBe(404);
    expect((await call("put", "/jigsaw-levels/pub", "plain", "plain").send({ level: "user" })).status).toBe(403);
  });
});

describe("another account of an admin's own login", () => {
  it("is the person's own account, with its own level: no admin rights there (choosing it is not going into somebody else's account)", async () => {
    const { call, make, settings, users } = await setup();
    await users.changeLogons("plain", () => ["fb-plain", "fb-boss"]); // the admin's login is verified for `plain` too
    const theirs = (await make("pub", "pub", { visibility: "owner" })).body as JigsawSpec;
    const own = { ...settings, ownerUid: "plain" };
    expect((await call("post", "/jigsaw", "plain", "boss").send(own)).status).toBe(403); // a plain account cannot make a public jigsaw
    expect((await call("get", `/jigsaw/${theirs.id}`, "plain", "boss")).status).toBe(404); // nor see another's private one
    expect((await call("put", "/jigsaw-levels/pub", "plain", "boss").send({ level: "user" })).status).toBe(403); // nor set levels
    expect((await call("post", "/jigsaw", "boss", "boss").send({ ...settings, ownerUid: "boss" })).status).toBe(201); // the admin account of the same login is still an admin
    expect((await call("post", "/jigsaw", "free", "boss").send({ ...settings, ownerUid: "free" })).status).toBe(201); // and going into an account the login is not verified for is too
  });
});

describe("the page knows an admin's login from the session", () => {
  it("tells the level of each account the login is verified for, so the page knows the login is an admin's: nothing is stored", async () => {
    const { call } = await setup();
    const admin = await call("get", "/session", undefined, "boss");
    expect(admin.status).toBe(200);
    expect(admin.body.users).toEqual([expect.objectContaining({ id: "boss", level: "admin" })]);
    const publisher = await call("get", "/session", undefined, "pub");
    expect(publisher.body.users).toEqual([expect.objectContaining({ id: "pub", level: "publisher" })]);
    const plain = await call("get", "/session", undefined, "plain");
    expect(plain.body.users[0]).not.toHaveProperty("level"); // a user: nothing kept
  });
});

describe("the front page and a private picture of a verified account", () => {
  it("is found by its own owner when signed in, and by nobody else: not a visitor, not another account, not an admin", async () => {
    const { call, make } = await setup();
    const secret = (await make("plain", "plain", { visibility: "owner", name: "Only mine" })).body as JigsawSpec;
    const open = (await make("pub", "pub", { name: "For everybody" })).body as JigsawSpec;
    const found = async (as?: string, token?: string) => (await call("get", "/jigsaw-search", as, token)).body.items.map((j: JigsawSpec) => j.id) as string[];
    expect(await found("plain", "plain")).toEqual(expect.arrayContaining([secret.id, open.id])); // the owner, signed in: both
    expect(await found()).toEqual([open.id]); // a visitor: the public one
    expect(await found("plain")).toEqual([open.id]); // the account without its login: not its private ones
    expect(await found("pub", "pub")).toEqual([open.id]); // another account
    expect(await found("boss", "boss")).toEqual([open.id]); // an admin does not find it on the front page either
    const popular = async (as?: string, token?: string) => (await call("get", "/jigsaw-popular", as, token)).body.map((j: JigsawSpec) => j.id) as string[];
    expect(await popular("plain", "plain")).toContain(secret.id);
    expect(await popular("pub", "pub")).not.toContain(secret.id);
  });
});

describe("an account that has just been made an admin", () => {
  it("can change the accounts of others at once: the gate does not keep the account as it was before it was an admin", async () => {
    const users = memoryUsers("me", "other");
    await users.changeLogons("me", () => ["fb-boss"]);
    await users.changeLogons("other", () => ["fb-pub"]);
    const app = createJigsawApp({ users, plays: memoryPlays(), jigsaw: memoryJigsaws(), viewKeySecret: TEST_KEY_SECRET, logons: { verifier, accounts, directory } });
    const rename = () => request(app).put("/jigsaw/api/jigsaw-users/other").set("X-Jigsaw-User", "me").set("Authorization", "Bearer boss").send({ name: "Renamed" });
    expect((await rename()).status).toBe(403); // no admin yet, and `me` is not one: it is locked to other sign-ins
    // there is no admin at all, so `me` may make itself one (and the gate has just looked at `me`)
    const made = await request(app).put("/jigsaw/api/jigsaw-levels/me").set("X-Jigsaw-User", "me").set("Authorization", "Bearer boss").send({ level: "admin" });
    expect(made.status).toBe(200);
    expect((await rename()).status).toBe(200); // now an admin: at once, not after the gate has forgotten the old answer
    expect((await users.get("other"))?.name).toBe("Renamed");
  });
});

describe("an admin's login cannot leak (every way I could think of to get admin rights without being an admin)", () => {
  const rename = (call: Awaited<ReturnType<typeof setup>>["call"], as: string | undefined, token: string | undefined) => call("put", "/jigsaw-users/plain", as, token).send({ name: "Taken" });

  it("is refused at once when the admin is demoted, or the login is taken off the admin account (nothing is kept)", async () => {
    const { call, users } = await setup();
    expect((await rename(call, "plain", "boss2")).status).toBe(200); // boss2 is an admin
    await users.update("boss2", { level: "user" }); // demoted (by hand in the store, as another instance of the function would see it)
    expect((await rename(call, "plain", "boss2")).status).toBe(403);
    await users.update("boss2", { level: "admin" });
    expect((await rename(call, "plain", "boss2")).status).toBe(200);
    await users.changeLogons("boss2", () => []); // the login is taken off: the account is open again and has no level
    expect((await rename(call, "plain", "boss2")).status).toBe(403);
  });

  it("is not given by a login that is verified for no account, a login that is no admin's, a bad token, or no token", async () => {
    const { call } = await setup();
    expect((await rename(call, "plain", "stranger")).status).toBe(403); // a good login, verified for nobody
    expect((await rename(call, "plain", "pub")).status).toBe(403); // a publisher's login
    expect((await rename(call, "plain", "not-a-token")).status).toBe(401); // a bad token is no token
    expect((await rename(call, "plain", undefined)).status).toBe(401);
    expect((await rename(call, undefined, "stranger")).status).toBe(403); // no account named: the account is in the address
  });

  it("is not given by anything the client says about itself: no header makes a call an admin's", async () => {
    const { call } = await setup();
    for (const claim of [{ "X-Jigsaw-Admin": "boss" }, { "X-Jigsaw-Level": "admin" }, { "X-Jigsaw-Role": "admin" }, { "X-Admin": "true" }]) {
      expect((await rename(call, "plain", "stranger").set(claim)).status).toBe(403);
      expect((await rename(call, "plain", "pub").set(claim)).status).toBe(403);
    }
    expect((await call("put", "/jigsaw-levels/pub", "pub", "pub").set({ "X-Jigsaw-Admin": "boss" }).send({ level: "admin" })).status).toBe(403);
    expect((await call("put", "/jigsaw-users/boss", "pub", "pub").send({ name: "Taken" })).status).toBe(403); // not by acting as the admin account either
  });

  it("does not open the logins of any account, so no admin login can be added to an account that is not its own", async () => {
    const { call } = await setup();
    for (const [method, path] of [["get", "/jigsaw-users/plain/logons"], ["put", "/jigsaw-users/plain/logons"], ["post", "/jigsaw-users/plain/logons/codes"], ["delete", "/jigsaw-users/plain/logons/ref"]] as const) {
      expect((await call(method, path, "plain", "boss")).status).toBe(403);
    }
  });

  it("is never kept between calls: an admin's call and another's, at the same moment and one after the other, do not touch each other", async () => {
    const { call, make } = await setup();
    const secret = (await make("plain", "plain", { visibility: "owner" })).body as JigsawSpec;
    const calls = Array.from({ length: 24 }, (_, i) => (i % 2 === 0 ? call("get", `/jigsaw/${secret.id}`, "pub", "boss") : call("get", `/jigsaw/${secret.id}`, "pub", "pub")));
    const answers = (await Promise.all(calls)).map((r) => r.status);
    answers.forEach((status, i) => expect(status).toBe(i % 2 === 0 ? 200 : 404)); // an admin's login sees it, the publisher's login does not, whatever the order
    expect((await call("get", `/jigsaw/${secret.id}`, "pub", "pub")).status).toBe(404); // and after all of them
  });

  it("never lets a call through when the database cannot say whether the login is an admin's (503)", async () => {
    const users = memoryUsers("plain", "other");
    await users.changeLogons("plain", () => ["fb-plain"]);
    const down = { ...users, linkedTo: async () => { throw new Error("the database is not there"); } };
    const app = createJigsawApp({ users: down, plays: memoryPlays(), jigsaw: memoryJigsaws(), viewKeySecret: TEST_KEY_SECRET, logons: { verifier, accounts, directory } });
    const res = await request(app).put("/jigsaw/api/jigsaw-users/plain").set("X-Jigsaw-User", "plain").set("Authorization", "Bearer boss").send({ name: "Taken" });
    expect(res.status).toBe(503);
    expect((await users.get("plain"))?.name).toBe("Plain");
  });
});

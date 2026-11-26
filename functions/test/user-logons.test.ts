import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import type { AccountDirectory, AccountStore, TokenVerifier } from "../src/logons";
import type { LinkCodeStore } from "../src/logons/link-codes";
import { LOGONS_MAX, JigsawUsers, LinkCodes, LogonAccounts } from "../src/models";
import type { JigsawUserSpec, LogonToken } from "../src/models";
import { TEST_KEY_SECRET, memoryPlays, memoryUsers } from "./memory-plays";

// A jigsaw user is verified by a list of Firebase accounts (at most 7). Any one of them is enough to act as the user; a user with none is used as before, with no login. The token comes with every call
// and the user the call acts as decides whether it is needed. No test calls Firebase: tokens, the directory of logins and the link codes are fakes.

const tokenOf = (uid: string, provider = "google.com"): LogonToken => ({ uid, email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: provider } });
const KNOWN: Record<string, LogonToken> = { a: tokenOf("fb-a"), b: tokenOf("fb-b"), c: tokenOf("fb-c") };

const fakeVerifier: TokenVerifier = {
  async verify(idToken) {
    const token = KNOWN[idToken];
    if (!token) throw new Error("bad token");
    return token;
  },
};

function fakeDirectory() {
  const state = { dead: new Set<string>(), asked: 0, failing: false };
  const directory: AccountDirectory = {
    async gone(uids) {
      state.asked++;
      if (state.failing) throw new Error("Firebase is not there");
      return uids.filter((u) => state.dead.has(u));
    },
  };
  return { state, directory };
}

function memoryCodes(): LinkCodeStore {
  const codes = new Map<string, { hash: string; expiresAt: number }>();
  return {
    async create(userId, hash, expiresAt) {
      codes.set(userId, { hash, expiresAt }); // one code at a time
    },
    async consume(userId, hash, now) {
      const code = codes.get(userId);
      if (!code || code.hash !== hash) return false;
      codes.delete(userId);
      return code.expiresAt > now;
    },
  };
}

/** what the accounts say about themselves (the account ids do not appear in it, so a test can see that they never reach the page) */
const PEOPLE: Record<string, { name: string | null; email: string; provider: string; photoURL: string | null }> = {
  "fb-a": { name: "Alice", email: "alice@example.com", provider: "google.com", photoURL: "https://photos.example.com/alice.png" },
  "fb-b": { name: null, email: "bob@example.com", provider: "password", photoURL: null },
};

const accounts: AccountStore = {
  async sync(token) {
    return { account: LogonAccounts.stored(token, undefined, () => "stamp"), created: true };
  },
  async read(uids) {
    return Object.fromEntries(uids.filter((uid) => PEOPLE[uid]).map((uid) => [uid, { provider: PEOPLE[uid].provider, email: PEOPLE[uid].email, verifiedPhone: null, displayName: PEOPLE[uid].name, photoURL: PEOPLE[uid].photoURL }]));
  },
};

const noJigsaws: JigsawStore = { list: async () => [], get: async () => null, add: async () => { throw new Error("not used"); }, update: async () => null, remove: async () => false };

function setup() {
  const users = memoryUsers("u1", "u2", "u3");
  const { state, directory } = fakeDirectory();
  const clock = { now: 1_000_000 };
  const app = createJigsawApp({ users, plays: memoryPlays(), jigsaw: noJigsaws, viewKeySecret: TEST_KEY_SECRET, now: () => clock.now, logons: { verifier: fakeVerifier, accounts, codes: memoryCodes(), directory, now: () => clock.now } });
  /** u1 is verified by these accounts from the start */
  const protect = (id: string, ...uids: string[]) => users.changeLogons(id, () => uids);
  const logonsOf = async (id: string) => JigsawUsers.logonsOf(await users.get(id));
  const call = (method: "get" | "put" | "post" | "patch" | "delete", path: string, auth?: string, as?: string) => {
    const r = request(app)[method](`/jigsaw/api${path}`);
    if (auth) r.set("Authorization", `Bearer ${auth}`);
    if (as) r.set("X-Jigsaw-User", as);
    return r;
  };
  return { app, users, directory: state, clock, protect, logonsOf, call };
}

describe("JigsawUsers (the verified accounts of a user)", () => {
  it("has at most seven, each once, and nothing that is not an account id", () => {
    expect(LOGONS_MAX).toBe(7);
    expect(JigsawUsers.logonsOf({ firebaseUids: ["a", "a", "b", "", 5, null, "c"] })).toEqual(["a", "b", "c"]);
    expect(JigsawUsers.logonsOf({ firebaseUids: Array.from({ length: 12 }, (_, i) => `x${i}`) })).toHaveLength(7);
    expect(JigsawUsers.logonsOf({})).toEqual([]);
    expect(JigsawUsers.logonsOf(null)).toEqual([]);
  });

  it("is open to anybody when it has no verified account, and to those with one of them when it has", () => {
    expect(JigsawUsers.requiresLogon({})).toBe(false);
    expect(JigsawUsers.mayAct({}, undefined)).toBe(true);
    expect(JigsawUsers.mayAct({ firebaseUids: [] }, "x")).toBe(true);
    expect(JigsawUsers.requiresLogon({ firebaseUids: ["a", "b"] })).toBe(true);
    expect(JigsawUsers.mayAct({ firebaseUids: ["a", "b"] }, "a")).toBe(true);
    expect(JigsawUsers.mayAct({ firebaseUids: ["a", "b"] }, "b")).toBe(true);
    expect(JigsawUsers.mayAct({ firebaseUids: ["a", "b"] }, "c")).toBe(false);
    expect(JigsawUsers.mayAct({ firebaseUids: ["a", "b"] }, undefined)).toBe(false);
  });

  it("adds an account (once), refuses an eighth, and takes one away", () => {
    expect(JigsawUsers.withLogon(["a"], "b")).toEqual({ list: ["a", "b"] });
    expect(JigsawUsers.withLogon(["a", "b"], "b")).toEqual({ list: ["a", "b"] });
    const full = Array.from({ length: LOGONS_MAX }, (_, i) => `x${i}`);
    expect(JigsawUsers.withLogon(full, "y")).toHaveProperty("error");
    expect(JigsawUsers.withLogon(full, "x3")).toEqual({ list: full }); // one that is there is still fine
    expect(JigsawUsers.withoutLogon(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("tells the page that a user is protected, and never which accounts", () => {
    const user: JigsawUserSpec = { id: "u", username: "u", name: "U", language: "en", createdAt: 1, firebaseUids: ["secret-uid"] };
    const open = JigsawUsers.publicOf(user);
    expect(open).toMatchObject({ protected: true });
    expect(JSON.stringify(open)).not.toMatch(/secret-uid|firebaseUids/);
    const own = JigsawUsers.ownerView(user);
    expect(own).toMatchObject({ protected: true });
    expect(JSON.stringify(own)).not.toMatch(/secret-uid|firebaseUids/);
    expect(JigsawUsers.publicOf({ ...user, firebaseUids: undefined })).not.toHaveProperty("protected");
  });

  it("reads the accounts back from a document, and only those", () => {
    expect(JigsawUsers.fromStored("id", { username: "u", name: "U", firebaseUids: ["a", "a", 3 as never] } as never).firebaseUids).toEqual(["a"]);
    expect(JigsawUsers.fromStored("id", { username: "u", name: "U" } as never)).not.toHaveProperty("firebaseUids");
  });
});

describe("the link code and what says which login it is", () => {
  it("is ten letters and digits that are not mistaken for each other, shown in two groups and read in any case", () => {
    expect(LinkCodes.error("ABCDE-FGHJK")).toBe("");
    expect(LinkCodes.error("abcde fghjk")).toBe("");
    expect(LinkCodes.normalise(" abcde-fghjk ")).toBe("ABCDEFGHJK");
    for (const bad of ["ABCDEFGHJ", "ABCDEFGHJKL", "ABCDE-FGHJ0", "ABCDE-FGHJO", 5, undefined, ""]) expect(LinkCodes.error(bad)).not.toBe("");
    expect(LinkCodes.shown("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
  });

  it("says which login it is: the kind, the name, the address and the picture", () => {
    expect(LogonAccounts.shown({ provider: "google.com", displayName: "Karin Hansen", email: "karin@example.com", photoURL: "https://lh3.example.com/p.png" })).toEqual({ provider: "google.com", name: "Karin Hansen", email: "karin@example.com", phone: null, photoURL: "https://lh3.example.com/p.png" });
    expect(LogonAccounts.shown({ provider: "password", email: "a@b.no", displayName: "   " })).toEqual({ provider: "password", name: null, email: "a@b.no", phone: null, photoURL: null });
  });

  it("shows only the last four digits of a phone number", () => {
    expect(LogonAccounts.shown({ provider: "phone", verifiedPhone: "+47 926 55 195" })).toMatchObject({ phone: "***5195", email: null, name: null });
    expect(LogonAccounts.shown({ provider: "phone", verifiedPhone: "12" }).phone).toBeNull();
  });

  it("puts only an https address in as a picture", () => {
    for (const bad of ["http://x/p.png", "javascript:alert(1)", "data:image/png;base64,AAAA", "//x/p.png", "", null, undefined]) expect(LogonAccounts.shown({ photoURL: bad as never }).photoURL).toBeNull();
  });

  it("says nothing about an account that is not known (its document is gone)", () => {
    expect(LogonAccounts.shown(null)).toEqual({ provider: null, name: null, email: null, phone: null, photoURL: null });
    expect(LogonAccounts.shown(undefined)).toEqual({ provider: null, name: null, email: null, phone: null, photoURL: null });
  });
});

describe("the gate: a user with verified accounts is used only by one of them", () => {
  it("lets a user with no verified account be used with no token, with a good one and with a bad one, as before", async () => {
    const { call } = setup();
    for (const auth of [undefined, "a", "nonsense"]) expect((await call("get", "/jigsaw-users/u1/plays", auth, "u1")).status).toBe(200);
  });

  it("answers 401 logon-required for a user that needs a login, with no token or a bad one", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a", "fb-b");
    for (const auth of [undefined, "nonsense"]) {
      const res = await call("get", "/jigsaw-users/u1/plays", auth, "u1");
      expect(res.status).toBe(401);
      expect(res.body.code).toBe("logon-required");
    }
  });

  it("lets a user that needs a login LOOK without it: public reads are answered for nobody, what is the user's own and entering a round still need the login", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    // looking: the list of jigsaws, the search, the rounds of a jigsaw (nobody is asked for)
    for (const path of ["/jigsaw", "/jigsaw/j1/plays"]) {
      const res = await call("get", path, undefined, "u1");
      expect(res.status, path).not.toBe(401);
      expect(res.status, path).not.toBe(403);
    }
    // the user's own, and opening a round, need the login
    for (const path of ["/jigsaw-users/u1/plays", "/jigsaw-rounds", "/jigsaw/j1/plays/p1"]) {
      const res = await call("get", path, undefined, "u1");
      expect(res.status, path).toBe(401);
      expect(res.body.code, path).toBe("logon-required");
    }
    // changing anything and starting a round need it too
    expect((await call("post", "/jigsaw/j1/plays", undefined, "u1").send({ userId: "u1" })).status).toBe(401);
    expect((await call("put", "/jigsaw/j1", undefined, "u1").send({})).status).toBe(401);
    // the right login is let through as before
    expect((await call("get", "/jigsaw-users/u1/plays", "a", "u1")).status).toBe(200);
  });

  it("needs the login also for the saves a page sends as it is left (they are changes of a round)", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    const save = (auth?: string) => call("patch", "/jigsaw/j1/plays/p1/positions", auth, "u1").send({ moves: [], elapsedMs: 1000 });
    const without = await save();
    expect(without.status).toBe(401);
    expect(without.body.code).toBe("logon-required");
    expect((await save("a")).status).toBe(404); // through the gate: there is just no such jigsaw here
  });

  it("lets any one of the verified accounts through, and answers 403 wrong-logon for another good token", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a", "fb-b");
    expect((await call("get", "/jigsaw-users/u1/plays", "a", "u1")).status).toBe(200);
    expect((await call("get", "/jigsaw-users/u1/plays", "b", "u1")).status).toBe(200);
    const other = await call("get", "/jigsaw-users/u1/plays", "c", "u1");
    expect(other.status).toBe(403);
    expect(other.body.code).toBe("wrong-logon");
  });

  it("also guards the routes of one user by the user in the address, whatever the header says", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    expect((await call("put", "/jigsaw-users/u1").send({ name: "Changed" })).status).toBe(401);
    expect((await call("put", "/jigsaw-users/u1", undefined, "u2").send({ name: "Changed" })).status).toBe(401); // acting as another user does not help
    expect((await call("put", "/jigsaw-users/u1", "c").send({ name: "Changed" })).status).toBe(403);
    expect((await call("put", "/jigsaw-users/u1", "a").send({ name: "Changed" })).body.name).toBe("Changed");
    expect((await call("put", "/jigsaw-users/u2").send({ name: "Open" })).status).toBe(200); // a user with no account: as before
  });

  it("leaves open what is public: the list of users, one user and making a user, never with the verified accounts", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    const list = await call("get", "/jigsaw-users", undefined, "u1");
    expect(list.status).toBe(200);
    expect(list.body.find((u: JigsawUserSpec) => u.id === "u1")).toMatchObject({ protected: true });
    expect(list.body.find((u: JigsawUserSpec) => u.id === "u2")).not.toHaveProperty("protected");
    expect(JSON.stringify(list.body)).not.toMatch(/fb-a|firebaseUids/);
    expect((await call("get", "/jigsaw-users/u1", undefined, "u1")).body).toMatchObject({ protected: true });
    expect((await call("post", "/jigsaw-users", undefined, "u1").send({ username: "newone", name: "New" })).status).toBe(201);
  });

  it("does not let a user be made, or changed, with accounts that come in the body", async () => {
    const { call, logonsOf } = setup();
    const made = await call("post", "/jigsaw-users").send({ username: "sneaky", name: "S", firebaseUids: ["fb-x"], protected: true });
    expect(made.status).toBe(201);
    expect(made.body).not.toHaveProperty("protected");
    expect(await logonsOf(made.body.id)).toEqual([]);
    await call("put", "/jigsaw-users/u2").send({ name: "Still open", firebaseUids: ["fb-x"] });
    expect(await logonsOf("u2")).toEqual([]);
  });

  it("is a 503, never a way through, when Firebase cannot be asked, and nothing is taken from anybody", async () => {
    const { call, protect, directory, logonsOf } = setup();
    await protect("u1", "fb-a");
    directory.failing = true;
    expect((await call("get", "/jigsaw-users/u1/plays", undefined, "u1")).status).toBe(503);
    expect(await logonsOf("u1")).toEqual(["fb-a"]);
  });
});

describe("the accounts that are gone", () => {
  it("takes a dead account from the list when it is found out, and the user stays protected by the one that is left", async () => {
    const { call, protect, directory, logonsOf } = setup();
    await protect("u1", "fb-a", "fb-b");
    directory.dead.add("fb-a");
    expect((await call("get", "/jigsaw-users/u1/plays", "b", "u1")).status).toBe(200); // a good token needs no question about the others
    expect(directory.asked).toBe(0);
    expect((await call("get", "/jigsaw-users/u1/plays", undefined, "u1")).status).toBe(401); // found out here: the user is still protected
    expect(await logonsOf("u1")).toEqual(["fb-b"]);
  });

  it("frees the user, with everything it has, when every account it had is gone", async () => {
    const { call, protect, directory, logonsOf, users } = setup();
    await protect("u1", "fb-a", "fb-b");
    directory.dead.add("fb-a").add("fb-b");
    expect((await call("get", "/jigsaw-users/u1/plays", undefined, "u1")).status).toBe(200);
    expect(await logonsOf("u1")).toEqual([]);
    expect(await users.get("u1")).toMatchObject({ id: "u1", name: "U1", username: "u1" });
    expect((await call("get", "/jigsaw-users/u1")).body).not.toHaveProperty("protected");
  });

  it("asks about the accounts of a user once a minute, not at every call", async () => {
    const { call, protect, directory, clock } = setup();
    await protect("u1", "fb-a");
    for (let i = 0; i < 3; i++) expect((await call("get", "/jigsaw-users/u1/plays", undefined, "u1")).status).toBe(401);
    expect(directory.asked).toBe(1);
    clock.now += 61_000;
    await call("get", "/jigsaw-users/u1/plays", undefined, "u1");
    expect(directory.asked).toBe(2);
  });

  it("frees the users in the list that are shown, so a free user is not shown with a lock", async () => {
    const { call, protect, directory, logonsOf } = setup();
    await protect("u1", "fb-a");
    await protect("u2", "fb-b");
    directory.dead.add("fb-a");
    const list = await call("get", "/jigsaw-users");
    expect(list.body.find((u: JigsawUserSpec) => u.id === "u1")).not.toHaveProperty("protected");
    expect(list.body.find((u: JigsawUserSpec) => u.id === "u2")).toMatchObject({ protected: true });
    expect(await logonsOf("u1")).toEqual([]);
  });

  it("shows the list as it is when Firebase cannot be asked", async () => {
    const { call, protect, directory } = setup();
    await protect("u1", "fb-a");
    directory.failing = true;
    const list = await call("get", "/jigsaw-users");
    expect(list.status).toBe(200);
    expect(list.body.find((u: JigsawUserSpec) => u.id === "u1")).toMatchObject({ protected: true });
  });
});

describe("verifying an account for a user (/jigsaw-users/:id/logons)", () => {
  it("needs a login signed in for every route", async () => {
    const { call } = setup();
    for (const [method, path] of [["get", "/jigsaw-users/u1/logons"], ["put", "/jigsaw-users/u1/logons"], ["post", "/jigsaw-users/u1/logons/codes"], ["post", "/jigsaw-users/u1/logons/redeem"], ["delete", "/jigsaw-users/u1/logons/abc"]] as const) expect((await call(method, path)).status).toBe(401);
  });

  it("verifies the account that is signed in for a user that has none, and then the user needs a login", async () => {
    const { call, logonsOf } = setup();
    const res = await call("put", "/jigsaw-users/u1/logons", "a");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ linked: true, count: 1 });
    expect(await logonsOf("u1")).toEqual(["fb-a"]);
    expect((await call("get", "/jigsaw-users/u1/plays", undefined, "u1")).status).toBe(401);
    expect((await call("put", "/jigsaw-users/u1/logons", "a")).body.count).toBe(1); // the same account again is the same
    expect((await call("put", "/jigsaw-users/u1/logons", "b")).status).toBe(403); // another account cannot take a user that is protected
  });

  it("lets one account be verified for several users", async () => {
    const { call, users } = setup();
    await call("put", "/jigsaw-users/u1/logons", "a");
    await call("put", "/jigsaw-users/u2/logons", "a");
    expect((await users.linkedTo("fb-a")).map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(await users.linkedTo("fb-b")).toEqual([]);
  });

  it("lists the logins with their kind, name, address and picture, the one that is signed in marked, and never by their ids", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a", "fb-b", "fb-gone");
    const res = await call("get", "/jigsaw-users/u1/logons", "a");
    expect(res.body.max).toBe(7);
    expect(res.body.items).toEqual([
      { ref: expect.stringMatching(/^[0-9a-f]{12}$/), you: true, provider: "google.com", name: "Alice", email: "alice@example.com", phone: null, photoURL: "https://photos.example.com/alice.png" },
      { ref: expect.stringMatching(/^[0-9a-f]{12}$/), you: false, provider: "password", name: null, email: "bob@example.com", phone: null, photoURL: null },
      { ref: expect.stringMatching(/^[0-9a-f]{12}$/), you: false, provider: null, name: null, email: null, phone: null, photoURL: null }, // an account whose document is gone says nothing
    ]);
    expect(JSON.stringify(res.body)).not.toMatch(/fb-a|fb-b|fb-gone/);
  });

  it("makes a link code for a user that has verified accounts, and not for one that has none", async () => {
    const { call, protect } = setup();
    expect((await call("post", "/jigsaw-users/u2/logons/codes", "a")).status).toBe(409);
    await protect("u1", "fb-a");
    const res = await call("post", "/jigsaw-users/u1/logons/codes", "a");
    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    expect((await call("post", "/jigsaw-users/u1/logons/codes", "c")).status).toBe(403); // an account that is not one of its logins cannot make one
  });

  it("verifies a second account with the code, once, and any way of writing it", async () => {
    const { call, protect, logonsOf } = setup();
    await protect("u1", "fb-a");
    const { code } = (await call("post", "/jigsaw-users/u1/logons/codes", "a")).body;
    expect((await call("get", "/jigsaw-users/u1/plays", "b", "u1")).status).toBe(403); // not yet
    const res = await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: code.toLowerCase().replace("-", " ") });
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(await logonsOf("u1")).toEqual(["fb-a", "fb-b"]);
    expect((await call("get", "/jigsaw-users/u1/plays", "b", "u1")).status).toBe(200);
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "c").send({ code })).status).toBe(400); // used
  });

  it("refuses a code that is wrong, not a code, for another user or has run out", async () => {
    const { call, protect, clock, logonsOf } = setup();
    await protect("u1", "fb-a");
    await protect("u2", "fb-a");
    const { code } = (await call("post", "/jigsaw-users/u1/logons/codes", "a")).body;
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: "AAAAA-AAAAA" })).status).toBe(400);
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: "short" })).status).toBe(400);
    expect((await call("post", "/jigsaw-users/u2/logons/redeem", "b").send({ code })).status).toBe(400); // the code of u1 is not u2's
    clock.now += (LinkCodes.MINUTES + 1) * 60_000;
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code })).status).toBe(400);
    expect(await logonsOf("u1")).toEqual(["fb-a"]);
  });

  it("lets a new code take the old one away", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    const first = (await call("post", "/jigsaw-users/u1/logons/codes", "a")).body.code;
    const second = (await call("post", "/jigsaw-users/u1/logons/codes", "a")).body.code;
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: first })).status).toBe(400);
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: second })).status).toBe(200);
  });

  it("waits after ten wrong codes", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    for (let i = 0; i < 10; i++) expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: "AAAAA-AAAAA" })).status).toBe(400);
    expect((await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code: "AAAAA-AAAAA" })).status).toBe(429);
  });

  it("holds seven accounts and refuses the eighth, with the same message for a code and for a link", async () => {
    const { call, protect, logonsOf } = setup();
    await protect("u1", "fb-a", "x1", "x2", "x3", "x4", "x5", "x6");
    expect(await logonsOf("u1")).toHaveLength(7);
    const { code } = (await call("post", "/jigsaw-users/u1/logons/codes", "a")).body;
    const res = await call("post", "/jigsaw-users/u1/logons/redeem", "b").send({ code });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/at most 7/);
    expect(await logonsOf("u1")).toHaveLength(7);
  });

  it("takes one login away and leaves the others, any verified account may; the last one makes the user free", async () => {
    const { call, protect, logonsOf } = setup();
    await protect("u1", "fb-a", "fb-b");
    const items = (await call("get", "/jigsaw-users/u1/logons", "a")).body.items as { ref: string }[];
    expect((await call("delete", "/jigsaw-users/u1/logons/nosuchref", "a")).status).toBe(404);
    expect((await call("delete", `/jigsaw-users/u1/logons/${items[1].ref}`, "c")).status).toBe(403); // an account that is not one of them cannot
    expect((await call("delete", `/jigsaw-users/u1/logons/${items[1].ref}`, "a")).body.count).toBe(1);
    expect(await logonsOf("u1")).toEqual(["fb-a"]);
    expect((await call("get", "/jigsaw-users/u1/plays", "b", "u1")).status).toBe(403); // the one taken away is out
    expect((await call("delete", `/jigsaw-users/u1/logons/${items[0].ref}`, "a")).body.count).toBe(0);
    expect(await logonsOf("u1")).toEqual([]);
    expect((await call("get", "/jigsaw-users/u1/plays", undefined, "u1")).status).toBe(200); // free again
  });

  it("makes a user that is verified for the account signed in, with the account from the token", async () => {
    const { call, logonsOf } = setup();
    const res = await call("post", "/jigsaw-users", "a").send({ username: "linked", name: "Linked", linkLogon: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ protected: true, name: "Linked" });
    expect(JSON.stringify(res.body)).not.toMatch(/fb-a|firebaseUids/);
    expect(await logonsOf(res.body.id)).toEqual(["fb-a"]);
    expect((await call("post", "/jigsaw-users").send({ username: "nolink", name: "N", linkLogon: true })).status).toBe(401); // the wish for a login needs one
    const plain = await call("post", "/jigsaw-users", "a").send({ username: "plain", name: "P" });
    expect(await logonsOf(plain.body.id)).toEqual([]); // no wish, no link, even when signed in
  });

  it("tells the page which users the account that signs in is verified for", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a", "fb-b");
    await protect("u3", "fb-a");
    expect((await call("post", "/session", "a")).body.users).toEqual([
      { id: "u1", name: "U1", username: "u1" },
      { id: "u3", name: "U3", username: "u3" },
    ]);
    expect((await call("post", "/session", "b")).body.users).toEqual([{ id: "u1", name: "U1", username: "u1" }]);
    expect((await call("post", "/session", "c")).body.users).toEqual([]);
  });

  it("tells it again to an account that has been signed in since before, with a GET, and without a login of it", async () => {
    const { call, protect } = setup();
    await protect("u1", "fb-a");
    expect((await call("get", "/session")).status).toBe(401);
    expect((await call("get", "/session", "a")).body).toEqual({ users: [{ id: "u1", name: "U1", username: "u1" }] });
  });
});

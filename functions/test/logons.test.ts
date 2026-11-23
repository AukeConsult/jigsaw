import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { AccountStore, TokenVerifier } from "../src/logons";
import { LogonAccounts } from "../src/models";
import type { LogonAccount, LogonToken } from "../src/models";
import { memoryUsers } from "./memory-plays";

/** a verifier that knows some tokens by their text: what Firebase says about them */
function fakeVerifier(known: Record<string, LogonToken>): TokenVerifier {
  return {
    async verify(idToken) {
      const token = known[idToken];
      if (!token) throw new Error("bad token");
      return token;
    },
  };
}

/** the accounts in memory, kept the way the Firestore store keeps them (the document is what the model says, plus what is already in it) */
function memoryAccounts(): AccountStore & { docs: Map<string, Record<string, unknown>> } {
  const docs = new Map<string, Record<string, unknown>>();
  let n = 0;
  return {
    docs,
    async sync(token) {
      const before = docs.get(token.uid);
      const account = LogonAccounts.stored(token, before, () => `stamp-${++n}`);
      docs.set(token.uid, { ...(before ?? {}), ...account, loginCount: ((before?.loginCount as number | undefined) ?? 0) + 1 });
      return { account: account as LogonAccount, created: !before };
    },
  };
}

const google: LogonToken = { uid: "u1", email: "Karin@Example.com", email_verified: true, name: "Karin Hansen", picture: "https://x/p.png", firebase: { sign_in_provider: "google.com" } };
const phone: LogonToken = { uid: "u2", phone_number: "+47 926 55 195", firebase: { sign_in_provider: "phone" } };

function setup(known: Record<string, LogonToken>) {
  const accounts = memoryAccounts();
  const app = createJigsawApp({ users: memoryUsers("anna"), logons: { verifier: fakeVerifier(known), accounts } });
  return { app, accounts };
}

describe("LogonAccounts (what a login says about an account)", () => {
  it("keeps what the login proves, and the address in small letters", () => {
    const a = LogonAccounts.stored(google, undefined, () => "s");
    expect(a).toMatchObject({ uid: "u1", email: "Karin@Example.com", emailLower: "karin@example.com", emailVerified: true, displayName: "Karin Hansen", provider: "google.com", accountId: "s" });
    expect(a.phone).toBeUndefined();
  });

  it("does not call an address verified when the token does not say so", () => {
    expect(LogonAccounts.stored({ uid: "u", email: "a@b.no", email_verified: false }, undefined, () => "s").emailVerified).toBe(false);
    expect(LogonAccounts.stored({ uid: "u", email: "a@b.no" }, undefined, () => "s").emailVerified).toBe(false);
  });

  it("takes the confirmed phone number as the contact number, with its key of the last 8 digits", () => {
    const a = LogonAccounts.stored(phone, undefined, () => "s");
    expect(a).toMatchObject({ verifiedPhone: "+47 926 55 195", phone: "+47 926 55 195", phoneKey: "92655195", email: null, displayName: null });
  });

  it("leaves a name the person chose and the stamp as they are", () => {
    const a = LogonAccounts.stored(google, { displayName: "  Kari  ", accountId: "old" }, () => "new");
    expect(a.displayName).toBe("Kari");
    expect(a.accountId).toBe("old");
  });

  it("a name that is only spaces is no name: the one of the login is used", () => {
    expect(LogonAccounts.stored(google, { displayName: "   " }, () => "s").displayName).toBe("Karin Hansen");
  });

  it("gives the page no stamp", () => {
    expect(LogonAccounts.publicOf(LogonAccounts.stored(google, undefined, () => "s"))).not.toHaveProperty("accountId");
  });
});

describe("POST /jigsaw/api/session", () => {
  it("answers 401 without a token and with a token that is not good", async () => {
    const { app, accounts } = setup({ good: google });
    expect((await request(app).post("/jigsaw/api/session")).status).toBe(401);
    expect((await request(app).post("/jigsaw/api/session").set("Authorization", "Bearer nope")).status).toBe(401);
    expect(accounts.docs.size).toBe(0);
  });

  it("makes the account at the first login and says so", async () => {
    const { app, accounts } = setup({ good: google });
    const res = await request(app).post("/jigsaw/api/session").set("Authorization", "Bearer good");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, created: true, accountId: "stamp-1", user: { uid: "u1", name: "Karin Hansen", emailVerified: true } });
    expect(accounts.docs.get("u1")).toMatchObject({ uid: "u1", loginCount: 1 });
  });

  it("keeps the same account and stamp at the next login, and counts it", async () => {
    const { app, accounts } = setup({ good: google });
    await request(app).post("/jigsaw/api/session").set("Authorization", "Bearer good");
    const res = await request(app).post("/jigsaw/api/session").set("Authorization", "Bearer good");
    expect(res.body).toMatchObject({ created: false, accountId: "stamp-1" });
    expect(accounts.docs.get("u1")).toMatchObject({ loginCount: 2 });
  });

  it("does not touch what Seven Friends keeps in the same document", async () => {
    const { app, accounts } = setup({ good: google });
    accounts.docs.set("u1", { uid: "u1", displayName: "Kari", accountId: "sf-stamp", earlyAdopter: true, setup: "done" });
    const res = await request(app).post("/jigsaw/api/session").set("Authorization", "Bearer good");
    expect(res.body).toMatchObject({ created: false, accountId: "sf-stamp", user: { name: "Kari" } });
    expect(accounts.docs.get("u1")).toMatchObject({ earlyAdopter: true, setup: "done", displayName: "Kari" });
  });

  it("does not change the users of the jigsaw", async () => {
    const { app } = setup({ good: google });
    await request(app).post("/jigsaw/api/session").set("Authorization", "Bearer good");
    const users = await request(app).get("/jigsaw/api/jigsaw-users");
    expect(users.status).toBe(200);
    expect(users.body).toHaveLength(1); // only the user of the jigsaw: the signed-in person is not among them
  });
});

import { createHash } from "node:crypto";
import express from "express";
import type { UserStore } from "../jigsaw/jigsaw-users";
import { JigsawUsers, LOGONS_MAX, LinkCodes, LogonAccounts, UserLogon } from "../models";
import { AccountStore } from "./account-store";
import { LinkCodeStore, hashOf, newCode } from "./link-codes";
import { TokenVerifier, requireAuth, tokenOf } from "./require-auth";

// The logins of one jigsaw user, `/jigsaw-users/:id/logons` (the gate has already seen to it that the person is signed in with one of the user's accounts, except for `/redeem`):
//   GET /                the verified logins, each as {ref, you, provider, name, email, phone, photoURL}, and how many there can be;
//   PUT /                verifies the account that is signed in for the user (a user with no verified account: whoever acts as it may; 409 when there are `LOGONS_MAX`);
//   POST /codes          makes a link code (only for a user that has verified accounts: a second login is added with it);
//   POST /redeem {code}  the account that is signed in is verified for the user, with the code that a login of the user made;
//   DELETE /:ref         takes one login away (the last one makes the user free, as before there was a login).
// What is kept for a login is the UID of its Firebase account, in the list of the user; what says which login it is (the kind, the name, the address, the picture) is read from the account when it is shown.

/** How many wrong codes a user's redeem takes before it waits, and for how long (milliseconds): a code is long, but it is asked for by anybody who is signed in. */
const WRONG_CODES = 10;
const WRONG_FOR_MS = 10 * 60_000;

/** What a removal asks for: a short hash of the UID, so the page never has the accounts' own ids. */
export const refOf = (uid: string): string => createHash("sha256").update(uid).digest("hex").slice(0, 12);

export interface LinkDeps {
  verifier: TokenVerifier;
  users: UserStore;
  accounts: AccountStore;
  codes: LinkCodeStore;
  /** a change of the accounts of a user is made: the gate reads it again */
  changed: (userId: string) => void;
  now: () => number;
}

export function linkRouter(deps: LinkDeps): express.Router {
  const router = express.Router({ mergeParams: true });
  const wrong = new Map<string, { count: number; since: number }>();
  const idOf = (req: express.Request) => String((req.params as { id?: string }).id);
  const bad = (res: express.Response, error: string, status = 400) => void res.status(status).json({ error });

  router.use((req, res, next) => {
    const error = JigsawUsers.idError(idOf(req));
    return error ? bad(res, error) : next();
  });
  router.use(requireAuth(deps.verifier)); // every route here is for an account that is signed in

  router.get("/", async (req, res) => {
    const user = await deps.users.get(idOf(req));
    if (!user) return bad(res, "No such account.", 404);
    const uids = JigsawUsers.logonsOf(user);
    const accounts = await deps.accounts.read(uids);
    const items: UserLogon[] = uids.map((uid) => ({ ref: refOf(uid), you: uid === tokenOf(res).uid, ...LogonAccounts.shown(accounts[uid]) }));
    res.json({ items, max: LOGONS_MAX });
  });

  router.put("/", async (req, res) => {
    const uid = tokenOf(res).uid;
    const done = await deps.users.changeLogons(idOf(req), (now) => {
      const next = JigsawUsers.withLogon(now, uid);
      return "error" in next ? next : next.list;
    });
    deps.changed(idOf(req));
    if (!done) return bad(res, "No such account.", 404);
    if (!Array.isArray(done)) return bad(res, done.error, 409);
    res.json({ linked: true, count: done.length });
  });

  router.post("/codes", async (req, res) => {
    const user = await deps.users.get(idOf(req));
    if (!user) return bad(res, "No such account.", 404);
    if (!JigsawUsers.requiresLogon(user)) return bad(res, "This account has no login yet: verify your login for it directly.", 409);
    const code = newCode();
    const expiresAt = deps.now() + LinkCodes.MINUTES * 60_000;
    await deps.codes.create(user.id, hashOf(code), expiresAt);
    res.status(201).json({ code: LinkCodes.shown(code), expiresAt });
  });

  router.post("/redeem", async (req, res) => {
    const id = idOf(req);
    const body = (req.body ?? {}) as { code?: unknown };
    const error = LinkCodes.error(body.code);
    if (error) return bad(res, error);
    const tries = wrong.get(id);
    if (tries && deps.now() - tries.since < WRONG_FOR_MS && tries.count >= WRONG_CODES) return bad(res, "Too many wrong codes: wait a while and ask for a new one.", 429);
    if (!(await deps.codes.consume(id, hashOf(body.code as string), deps.now()))) {
      const fresh = !tries || deps.now() - tries.since >= WRONG_FOR_MS;
      if (wrong.size > 5000) wrong.clear();
      wrong.set(id, { count: fresh ? 1 : tries.count + 1, since: fresh ? deps.now() : tries.since });
      return bad(res, "That code is not right, or it has run out: ask for a new one.", 400);
    }
    wrong.delete(id);
    const uid = tokenOf(res).uid;
    const done = await deps.users.changeLogons(id, (now) => {
      const next = JigsawUsers.withLogon(now, uid);
      return "error" in next ? next : next.list;
    });
    deps.changed(id);
    if (!done) return bad(res, "No such account.", 404);
    if (!Array.isArray(done)) return bad(res, done.error, 409);
    res.json({ linked: true, count: done.length });
  });

  router.delete("/:ref", async (req, res) => {
    const ref = req.params.ref;
    let removed = false;
    const done = await deps.users.changeLogons(idOf(req), (now) => {
      const uid = now.find((u) => refOf(u) === ref);
      removed = uid !== undefined;
      return uid === undefined ? now : JigsawUsers.withoutLogon(now, uid);
    });
    deps.changed(idOf(req));
    if (!done) return bad(res, "No such account.", 404);
    if (!Array.isArray(done) || !removed) return bad(res, "No such login.", 404);
    res.json({ count: done.length });
  });

  return router;
}

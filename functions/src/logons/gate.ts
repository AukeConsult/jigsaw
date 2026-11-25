import { Request, RequestHandler } from "express";
import type { UserStore } from "../jigsaw/jigsaw-users";
import { JigsawUserSpec, JigsawUsers, LogonToken, UserLevels } from "../models";
import { AccountDirectory } from "./account-directory";
import { TokenVerifier } from "./require-auth";

// The gate in front of the API: a jigsaw user that has verified Firebase accounts is used only by somebody signed in with one of them. The token is sent with every call (when somebody is signed
// in) and this decides, from the user the call acts as, whether it is needed: a user with no verified account ignores it, as before. The user a call acts as is the one in the header `X-Jigsaw-User`
// and, for the routes of one user (`/jigsaw-users/:id/...`), the user in the address.
//   - no token (or a bad one) for a user that needs a login: 401 `logon-required`;
//   - a good token for an account that is not one of the user's: 403 `wrong-logon`;
//   - a question that cannot be answered (Firebase is not there): 503, never a way through.
// An admin can act as any account: the key is the admin's own login, the Bearer token that comes with every call. When that login is verified for an account that is a real admin (it needs a login, and
// has the level), the call is answered as the account in `X-Jigsaw-User` (or in the address), without the login of that account. The logins of the account (`/jigsaw-users/:id/logons`) are not opened that way.
// A verified account that no longer exists in Firebase is taken from the list when it is found out (an account deleted in Seven Friends, say); a user whose every account is gone is free again, with
// everything it has.

/** How long a user is kept (milliseconds): a call with a header is a lookup of the user, and a change of its accounts is seen by this instance at once and by the others within this time. */
const USER_KEEP_MS = 10_000;
/** How long it is known that the accounts of a user were all there (milliseconds). */
const ALIVE_KEEP_MS = 60_000;

export interface Gate {
  gate: RequestHandler;
  /** In front of the list of users: takes the accounts that are gone from the users that have them, so a user that is free again is not shown with a lock. */
  sweepList: RequestHandler;
  /** A change of the accounts of this user is made: it is read again at the next call. */
  forget(userId: string): void;
}

/** The routes that need no user, or whose answer is public: nobody acts as a user by asking them. */
function open(req: Request): boolean {
  const p = req.path;
  const read = req.method === "GET" || req.method === "HEAD";
  if (p === "/health" || p === "/session" || p.startsWith("/session/")) return true;
  if (req.method === "POST" && /^\/jigsaw-users\/?$/.test(p)) return true; // making a user
  if (read && /^\/jigsaw-users\/[^/]+\/picture\/?$/.test(p)) return true; // the picture of an account is a picture, as open as its name: an image in a list cannot carry a token
  if (req.method === "POST" && /^\/jigsaw-users\/[^/]+\/logons\/redeem\/?$/.test(p)) return true; // a login that is not verified yet uses a link code
  return read && (/^\/jigsaw-users\/?$/.test(p) || p.startsWith("/jigsaw-users/by-username/") || /^\/jigsaw-users\/[^/]+\/?$/.test(p)); // who the users are, to choose from
}

/**
 * A read that is not about the user (a jigsaw, its picture, the search, the rounds of a jigsaw): it can be answered for nobody, so a user that needs a login but is not signed in can still LOOK.
 * What is the user's own is not here (the routes of one user, the favorites, "your jigsaws") and neither is opening a round (`/jigsaw/:id/plays/:playId`): those need the login.
 */
function looking(req: Request): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") return false;
  const p = req.path;
  if (/^\/jigsaw-users(\/|$)/.test(p) || p.startsWith("/jigsaw-favorites") || p.startsWith("/jigsaw-rounds") || p.startsWith("/jigsaw-search/mine") || p.startsWith("/session")) return false;
  if (/^\/jigsaw\/[^/]+\/plays\/[^/]+/.test(p)) return false; // entering a round
  return true;
}

/** The routes of the logins of one account (`/jigsaw-users/:id/logons`): they stay the account's own, an admin's login does not get into them. */
function ownLogins(req: Request): boolean {
  return /^\/jigsaw-users\/[^/]+\/logons(\/|$)/.test(req.path);
}

/** The users a call acts as: the one in the header, and the one in the address of a route of one user. */
function actingAs(req: Request): string[] {
  const ids: string[] = [];
  const header = req.get("X-Jigsaw-User");
  if (header && !JigsawUsers.idError(header)) ids.push(header);
  const path = /^\/jigsaw-users\/([^/]+)(?:\/|$)/.exec(req.path)?.[1];
  if (path && path !== "by-username" && !JigsawUsers.idError(path) && !ids.includes(path)) ids.push(path);
  return ids;
}

export function createGate(deps: { verifier: TokenVerifier; users: UserStore; directory: AccountDirectory; now?: () => number }): Gate {
  const now = deps.now ?? Date.now;
  const known = new Map<string, { at: number; user: JigsawUserSpec | null }>();
  const allThere = new Map<string, number>();
  let listSweptAt = 0;

  const forget = (userId: string) => {
    known.delete(userId);
    allThere.delete(userId);
  };

  /**
   * Whether this login is verified for an account that is a real admin (an account that needs a login and has the level, `UserLevels.of`), worked out from the accounts of the login. **Never kept**: it is asked of the database at every call that
   * carries a login, so a demoted admin, or a login taken off an admin account, is refused at once, also by another instance of the function (a kept answer would be a window in which a login that is
   * no admin's any more still is). When the database cannot answer, the call fails (503): there is no way through.
   */
  /** The accounts this login is verified for (asked of the database each time, never kept). */
  const accountsOfLogin = (uid: string) => deps.users.linkedTo(uid);

  const userOf = async (id: string): Promise<JigsawUserSpec | null> => {
    const same = known.get(id);
    if (same && now() - same.at < USER_KEEP_MS) return same.user;
    if (known.size > 2000) known.clear();
    const user = await deps.users.get(id);
    known.set(id, { at: now(), user });
    return user;
  };

  /** Takes the accounts that are gone from the list of the user: the user as it is then (it may be free). */
  const sweep = async (user: JigsawUserSpec): Promise<JigsawUserSpec | null> => {
    const at = allThere.get(user.id);
    if (at !== undefined && now() - at < ALIVE_KEEP_MS) return user; // they were all there a moment ago
    const gone = await deps.directory.gone(JigsawUsers.logonsOf(user));
    if (!gone.length) {
      allThere.set(user.id, now());
      return user;
    }
    await deps.users.changeLogons(user.id, (current) => current.filter((uid) => !gone.includes(uid)));
    forget(user.id);
    return userOf(user.id);
  };

  const gate: RequestHandler = async (req, res, next) => {
    if (open(req)) return next();
    try {
      let proof: LogonToken | null | undefined; // undefined: not looked at yet
      const token = async (): Promise<LogonToken | null> => {
        if (proof !== undefined) return proof;
        const bearer = /^Bearer (.+)$/.exec(req.get("Authorization") ?? "")?.[1];
        proof = null;
        if (bearer) {
          try {
            proof = await deps.verifier.verify(bearer);
          } catch {
            /* a token that is not good is no token */
          }
        }
        return proof;
      };
      // An admin: the login that comes (the Bearer token, the admin's own key) is verified for an account that is a real admin. Then the call is answered as the account it acts as, with the rights of an
      // admin (`res.locals.byAdmin`: every level is admin for this call, `intoAccount`), whatever login that account needs. The logins of the account are not opened that way.
      let viaAdmin = false;
      if (req.get("Authorization") && !ownLogins(req)) {
        const who = await token();
        const own = who ? await accountsOfLogin(who.uid) : [];
        viaAdmin = own.some((u) => UserLevels.isAdmin(UserLevels.of(u)));
        // For the whole call: every level is admin for it, also when no account is named. **Not** when the call acts as another account the login is verified for and that is no admin: that is the person's own
        // account, with its own level (choosing it is not going into somebody else's account). The page shows the same (`JigsawUserService.admin`).
        const named = actingAs(req);
        if (viaAdmin && (!named.length || named.some((id) => { const mine = own.find((u) => u.id === id); return !mine || UserLevels.isAdmin(UserLevels.of(mine)); }))) res.locals.byAdmin = true;
      }
      for (const id of actingAs(req)) {
        if (viaAdmin) continue;
        const user = await userOf(id);
        if (!user || !JigsawUsers.requiresLogon(user)) continue;
        const who = await token();
        if (who && JigsawUsers.mayAct(user, who.uid)) continue;
        const after = await sweep(user); // every account it had may be gone: then it is free
        if (!JigsawUsers.requiresLogon(after)) continue;
        if (looking(req)) {
          // only looking: it is answered for nobody (the private jigsaws of that user stay private), and no login is asked for
          delete req.headers["x-jigsaw-user"];
          return next();
        }
        return void (who
          ? res.status(403).json({ error: "This account belongs to other logins: sign in with one of them.", code: "wrong-logon" })
          : res.status(401).json({ error: "This account needs a login: sign in first.", code: "logon-required" }));
      }
      next();
    } catch (err) {
      console.error("Could not tell who may act as a user", err);
      res.status(503).json({ error: "Try again." });
    }
  };

  const sweepList: RequestHandler = async (_req, _res, next) => {
    if (now() - listSweptAt >= ALIVE_KEEP_MS) {
      listSweptAt = now();
      try {
        const all = await deps.users.list();
        const uids = [...new Set(all.flatMap((u) => JigsawUsers.logonsOf(u)))];
        const gone = uids.length ? await deps.directory.gone(uids) : [];
        for (const user of all) {
          const lost = JigsawUsers.logonsOf(user).filter((uid) => gone.includes(uid));
          if (!lost.length) continue;
          await deps.users.changeLogons(user.id, (current) => current.filter((uid) => !lost.includes(uid)));
          forget(user.id);
        }
      } catch (err) {
        console.error("Could not look for logins that are gone (the list is given as it is)", err);
      }
    }
    next();
  };

  return { gate, sweepList, forget };
}

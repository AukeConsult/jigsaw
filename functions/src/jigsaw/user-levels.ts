import { AsyncLocalStorage } from "node:async_hooks";
import express from "express";
import { JigsawUsers, UserLevel, UserLevels } from "../models";
import type { UserStore } from "./jigsaw-users";
import { apiRouter, askerOf, bad } from "../common/http";
import { TtlCache } from "../common/ttl-cache";

// The level of the account that asks (the header `X-Jigsaw-User`; the gate has seen that the login may act as it when it needs one), and the route an admin sets levels with.

/** How long a level is kept (milliseconds): a list of jigsaws asks for it once for each jigsaw, and a change made on another instance is seen within this time. */
const KEEP_MS = 10_000;

/**
 * The call that is being answered comes with an admin's login (the gate has seen that the Bearer token is verified for an account that is a real admin: `res.locals.byAdmin`): for this call every
 * question about a level is answered `admin`, whatever account the call acts as and also when it names none, so the login of an admin is accepted on every call and on every item. It is kept for the call
 * only (`AsyncLocalStorage`), never for an account.
 */
const byAdmin = new AsyncLocalStorage<true>();

/** In front of the routes, after the gate: runs the rest of the call as an admin's, when the gate said it is. */
export const intoAccount: express.RequestHandler = (_req, res, next) => (res.locals.byAdmin ? byAdmin.run(true, next) : next());

export interface Levels {
  /** The level the account really has (`UserLevels.of`: `user` for nobody, for an account that does not exist and for one that needs no login). */
  of(id: string | undefined): Promise<UserLevel>;
  /** The level of this account was changed here: it is read again at the next question. */
  forget(id: string): void;
}

export function userLevels(users: Pick<UserStore, "get">, now: () => number = Date.now): Levels {
  const known = new TtlCache<UserLevel>(KEEP_MS, 2000, now);
  return {
    async of(id) {
      if (byAdmin.getStore()) return "admin"; // the call comes with an admin's login: every level is admin for it (see `byAdmin`)
      if (!id || JigsawUsers.idError(id)) return "user";
      return known.get(id, async () => UserLevels.of(await users.get(id)));
    },
    forget: (id) => known.forget(id),
  };
}

/**
 * `/jigsaw-levels`: PUT /:id {level} gives an account a level. Only an admin does it (403 otherwise), **but while there is no admin at all any account that asks (the header names one) may**, so the first
 * admin can be made from the page; the account that gets a level above `user` must have a verified login (409), and the last admin cannot step down (409). GET /open says whether there is no admin
 * (`{ open: true }`): the page shows its admin menu to everybody then. It is not under `/jigsaw-users/:id`, so the gate asks for the login of the one who asks and not for the login of the account that is changed.
 */
export function userLevelRouter(users: UserStore, levels: Levels, onChanged: (userId: string) => void): express.Router {
  const router = apiRouter();
  const noAdmin = async () => !UserLevels.hasAdmin(await users.list());
  router.get("/open", async (_req, res) => void res.json({ open: await noAdmin() }));
  router.put("/:id", async (req, res) => {
    const me = askerOf(req);
    const allowed = UserLevels.isAdmin(await levels.of(me)) || (!!me && !JigsawUsers.idError(me) && !!(await users.get(me)) && (await noAdmin()));
    if (!allowed) return bad(res, "Only an admin can set levels.", 403);
    const idError = JigsawUsers.idError(req.params.id);
    if (idError) return bad(res, idError);
    const level = (req.body as { level?: unknown } | undefined)?.level;
    if (!UserLevels.is(level)) return bad(res, UserLevels.error(level));
    const target = await users.get(req.params.id);
    if (!target) return bad(res, "No such account.", 404);
    const notVerified = UserLevels.setError(target, level);
    if (notVerified) return bad(res, notVerified, 409);
    const otherAdmins = UserLevels.otherAdmins(await users.list(), target.id);
    const why = UserLevels.changeError(UserLevels.of(target), level, otherAdmins);
    if (why) return bad(res, why, 409);
    const changed = await users.update(target.id, { level });
    levels.forget(target.id);
    onChanged(target.id); // the gate keeps an account 10 seconds: an account that is an admin now must not be refused as what it was before
    if (!changed || changed === "taken") return bad(res, "No such account.", 404);
    res.json(JigsawUsers.publicOf(changed));
  });
  return router;
}

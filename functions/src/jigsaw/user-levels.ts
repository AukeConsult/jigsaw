import { AsyncLocalStorage } from "node:async_hooks";
import express from "express";
import { JigsawUsers, UserLevel, UserLevels } from "../models";
import type { UserStore } from "./jigsaw-users";

// The level of the account that asks (the header `X-Jigsaw-User`; the gate has seen that the login may act as it when it needs one), and the route an admin sets levels with.

/** How long a level is kept (milliseconds): a list of jigsaws asks for it once for each jigsaw, and a change made on another instance is seen within this time. */
const KEEP_MS = 10_000;

/**
 * The account an admin has gone into, for the call that is being answered (set by `intoAccount` after the gate has seen that the admin's login is a real admin's): for that account `Levels.of` says
 * `admin` during this call, so an admin in an account has every right of an admin there. It is kept for the call only (`AsyncLocalStorage`), never for the account.
 */
const adminInto = new AsyncLocalStorage<string>();

/** In front of the routes, after the gate: runs the rest of the call with the account the gate said an admin is in. */
export const intoAccount: express.RequestHandler = (_req, res, next) => {
  const id = res.locals.adminInto as string | undefined;
  return id ? adminInto.run(id, next) : next();
};

export interface Levels {
  /** The level the account really has (`UserLevels.of`: `user` for nobody, for an account that does not exist and for one that needs no login). */
  of(id: string | undefined): Promise<UserLevel>;
  /** The level of this account was changed here: it is read again at the next question. */
  forget(id: string): void;
}

export function userLevels(users: Pick<UserStore, "get">, now: () => number = Date.now): Levels {
  const known = new Map<string, { at: number; level: UserLevel }>();
  return {
    async of(id) {
      if (!id || JigsawUsers.idError(id)) return "user";
      if (adminInto.getStore() === id) return "admin"; // an admin has gone into this account for this call
      const same = known.get(id);
      if (same && now() - same.at < KEEP_MS) return same.level;
      if (known.size > 2000) known.clear();
      const level = UserLevels.of(await users.get(id));
      known.set(id, { at: now(), level });
      return level;
    },
    forget: (id) => void known.delete(id),
  };
}

/**
 * `/jigsaw-levels`: PUT /:id {level} gives an account a level. Only an admin does it (403 otherwise), **but while there is no admin at all any account that asks (the header names one) may**, so the first
 * admin can be made from the page; the account that gets a level above `user` must have a verified login (409), and the last admin cannot step down (409). GET /open says whether there is no admin
 * (`{ open: true }`): the page shows its admin menu to everybody then. It is not under `/jigsaw-users/:id`, so the gate asks for the login of the one who asks and not for the login of the account that is changed.
 */
export function userLevelRouter(users: UserStore, levels: Levels, onChanged: (userId: string) => void = () => undefined): express.Router {
  const router = express.Router();
  const noAdmin = async () => !UserLevels.hasAdmin(await users.list());
  router.get("/open", async (_req, res) => void res.json({ open: await noAdmin() }));
  router.put("/:id", async (req, res) => {
    const bad = (error: string, status = 400) => void res.status(status).json({ error });
    const me = req.get("X-Jigsaw-User");
    const allowed = UserLevels.isAdmin(await levels.of(me)) || (!!me && !JigsawUsers.idError(me) && !!(await users.get(me)) && (await noAdmin()));
    if (!allowed) return bad("Only an admin can set levels.", 403);
    const idError = JigsawUsers.idError(req.params.id);
    if (idError) return bad(idError);
    const level = (req.body as { level?: unknown } | undefined)?.level;
    if (!UserLevels.is(level)) return bad(UserLevels.error(level));
    const target = await users.get(req.params.id);
    if (!target) return bad("No such account.", 404);
    const notVerified = UserLevels.setError(target, level);
    if (notVerified) return bad(notVerified, 409);
    const otherAdmins = (await users.list()).filter((u) => u.id !== target.id && UserLevels.isAdmin(UserLevels.of(u))).length;
    const why = UserLevels.changeError(UserLevels.of(target), level, otherAdmins);
    if (why) return bad(why, 409);
    const changed = await users.update(target.id, { level });
    levels.forget(target.id);
    onChanged(target.id); // the gate keeps an account 10 seconds: an account that is an admin now must not be refused as what it was before
    if (!changed || changed === "taken") return bad("No such account.", 404);
    res.json(JigsawUsers.publicOf(changed));
  });
  return router;
}

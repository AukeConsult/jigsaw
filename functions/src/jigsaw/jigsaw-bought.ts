import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { AccountLimits, BoughtPackage, BoughtPackages, JIGSAW_BOUGHT, JIGSAW_USERS, PackageItem, Verifiable } from "../models";
import { apiRouter, askerOf, bad } from "../common/http";
import { TtlCache } from "../common/ttl-cache";

// The packages a person has got or bought: `jigsaw-users/<id>/bought-packages`. No money is taken (payment is not built, see `BoughtPackages`).

/** Where they are kept (Firestore in the app, a memory store in the tests). */
export interface BoughtStore {
  list(userId: string): Promise<BoughtPackage[]>;
  /** keeps one; the id of the document is the package, so the same package is kept once */
  add(userId: string, bought: BoughtPackage): Promise<void>;
}

export function firestoreBoughtStore(): BoughtStore {
  const of = (userId: string) => getFirestore().collection(JIGSAW_USERS).doc(userId).collection(JIGSAW_BOUGHT);
  return {
    async list(userId) {
      const snap = await of(userId).get();
      return snap.docs.map((d) => BoughtPackages.stored(d.data())).filter((b): b is BoughtPackage => b !== null);
    },
    async add(userId, bought) {
      await of(userId).doc(bought.packageId).set(bought);
    },
  };
}

/** How long what an account has is kept (milliseconds): a list of pictures asks for it once for each picture of a package. */
const KEEP_MS = 5_000;

/** What the accounts have, as the app asks: the ids of the packages, read once for a few seconds and again after one is got here. */
export function boughtPackages(store: BoughtStore, now: () => number) {
  const kept = new TtlCache<ReadonlySet<string>>(KEEP_MS, 2000, now);
  const ids = (userId: string | undefined): Promise<ReadonlySet<string>> =>
    userId ? kept.get(userId, () => store.list(userId).then((all) => new Set(all.map((b) => b.packageId)))) : Promise.resolve(new Set<string>());
  return {
    ids,
    /** whether the account has got the package */
    has: async (userId: string | undefined, packageId: string) => (await ids(userId)).has(packageId),
    async add(userId: string, bought: BoughtPackage): Promise<void> {
      await store.add(userId, bought);
      kept.forget(userId);
    },
  };
}

export type Bought = ReturnType<typeof boughtPackages>;

export interface BoughtDeps {
  bought: Bought;
  /** the package, when it may be got by this account now (it is there, right, active and the account may see it); null otherwise */
  packageFor(packageId: string, me: string): Promise<PackageItem | null>;
  /** the account, with what says whether it is verified; null when there is no such account */
  accountOf(userId: string): Promise<Verifiable | null>;
  isAdmin(me: string | undefined): Promise<boolean>;
  now: () => number;
}

/**
 * The packages of one account, `/jigsaw-users/:id/bought-packages`: GET the ids, PUT `/:packageId` to get (a free one) or buy (a priced one) a package. Only the account itself (or an admin) asks: the
 * header `X-Jigsaw-User` is that account (the gate has seen that the login may act as it, when it needs one). A package that is had already is left as it was.
 */
export function boughtRouter(deps: BoughtDeps): express.Router {
  const router = apiRouter({ mergeParams: true });

  router.use(async (req, res, next) => {
    const id = (req.params as { id: string }).id;
    const me = askerOf(req);
    if (me !== id && !(await deps.isAdmin(me))) return bad(res, "These are another account's packages.", 403);
    const account = await deps.accountOf(id);
    if (!account) return bad(res, "No such account.", 404);
    res.locals.account = account;
    next();
  });

  router.get("/", async (req, res) => {
    res.json({ packageIds: [...(await deps.bought.ids((req.params as { id: string }).id))] });
  });

  router.put("/:packageId", async (req, res) => {
    const { id, packageId } = req.params as { id: string; packageId: string };
    if (await deps.bought.has(id, packageId)) return void res.json({ packageId }); // what is had stays, also of an account that is not verified
    const limit = (await deps.isAdmin(askerOf(req))) ? "" : AccountLimits.packageError(res.locals.account as Verifiable);
    if (limit) return bad(res, limit, 403);
    const pack = await deps.packageFor(packageId, id);
    if (!pack) return bad(res, "No such package.", 404);
    await deps.bought.add(id, BoughtPackages.of(pack, deps.now()));
    res.status(201).json({ packageId });
  });

  return router;
}

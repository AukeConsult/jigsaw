import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { DocumentStore, documentStore, findById } from "../common/document-store";
import { AiUsage, FeedItemData, FeedItemInput, FeedItems, JIGSAW, JigsawIndex, JigsawLanguages, JigsawSummary, JigsawVisibilities, StoredFeedKind, SUMMARY_FIELDS, TokenUsages, UserLevels } from "../models";
import { AiFailed, AiUnavailable } from "../common/openai-chat";
import { Translator } from "./translator";
import type { Levels } from "./user-levels";
import { apiRouter, askerOf, bad } from "../common/http";

// The tiles of the home page that are not pictures. Each kind has its own collection (`jigsaw-info`, `jigsaw-offers`), its own routes (`feedManageRouter`: a publisher or an admin adds, changes and deletes
// their own) and, for now, no more than that; what is shown on the home page is decided when the collections are read (`jigsawFeedRouter`: `GET /jigsaw-feed`), where a rule of who is shown what can
// be added later without touching the collections or the pages. The words of a tile are in every language: the author writes the master language and the AI makes the others when it is saved.

/** Where the tiles of one kind are kept (Firestore in the app, a memory store in the tests). */
export type FeedStore = DocumentStore<FeedItemInput, FeedItemData>;

/** The tiles of one kind in a Firestore collection: the newest 500; a document is read as the model says (a kind that is not this collection's is read as this collection's). */
export function firestoreFeedStore(collection: string, kind: StoredFeedKind): FeedStore {
  return documentStore<FeedItemInput, FeedItemData>(
    () => getFirestore().collection(collection),
    500,
    (id, doc) => FeedItems.stored({ ...doc, id, kind }) as FeedItemData,
  );
}

/** What is saved of a tile: not its id and not the time it was made (the store keeps those). */
const inputOf = (data: FeedItemData): FeedItemInput => {
  const { id: _id, createdAt: _createdAt, ...input } = data; // eslint-disable-line @typescript-eslint/no-unused-vars
  return input;
};

/** The pictures of a package: ordinary pictures (the collection `jigsaw`) whose `packageId` is the package. */
export interface PackagePictures {
  /** the pictures of the package, the newest first, as the lists have them */
  list(packageId: string): Promise<JigsawSummary[]>;
}

/** The pictures of a package in the Firestore collection `jigsaw`: one equality on one field, so no composite index is needed. */
export function firestorePackagePictures(collection: string = JIGSAW): PackagePictures {
  return {
    async list(packageId) {
      const snap = await getFirestore().collection(collection).where("packageId", "==", packageId).select(...SUMMARY_FIELDS).get();
      return snap.docs.map((d) => JigsawIndex.summaryOf(d.id, (d.data() ?? {}) as Record<string, unknown>)).sort((a, b) => b.createdAt - a.createdAt);
    },
  };
}

/** The pictures that anybody may see: not the private and not the hidden ones. */
const shownPictures = (all: readonly JigsawSummary[]) => all.filter((p) => !JigsawVisibilities.restricted(p.visibility));

export interface FeedDeps {
  levels: Levels;
  translator: Translator;
  /** keeps what a call used for the account that pays for it (the token use); a failure here never fails the save */
  keepUsage?(userId: string, usage: ReturnType<typeof TokenUsages.record>): Promise<unknown>;
  now: () => number;
}

/** How the translation of a save went: nothing to make, made, the AI could not be asked (no settings), or it failed. The tile is saved in every case. */
export type TranslationResult = "none" | "done" | "unavailable" | "failed";

/**
 * The routes of one kind of tile, for a publisher or an admin (`/jigsaw-info`, `/jigsaw-offers`): the list with a search and a status, one tile, and add, change and delete. **A publisher sees and changes
 * their own, an admin any** (`FeedItems.mayChange`). Every save checks the tile with the one rule (`error()`), and has the AI make the words of the languages that have none or are out of date
 * (`FeedItems.toTranslate`) from the master language; if that cannot be done the tile is saved as it is and the answer says so.
 */
export function feedManageRouter(kind: StoredFeedKind, store: FeedStore, deps: FeedDeps, pictures?: PackagePictures): express.Router {
  const router = apiRouter();
  const byId = (id: string) => findById(store, id);

  /** who asks, when they may publish: an account with a level of publisher or admin */
  const who: express.RequestHandler = async (req, res, next) => {
    const me = askerOf(req);
    const level = await deps.levels.of(me);
    if (!me || !UserLevels.mayPublish(level)) return bad(res, "Only a publisher or an admin can do this.", 403);
    res.locals.me = me;
    res.locals.admin = UserLevels.isAdmin(level);
    next();
  };
  router.use(who);

  /** The words of the languages that are missing or out of date are made by the AI; the tile as it is then, how it went, and what the call used (kept for who saves once the tile has its id). */
  const translated = async (data: FeedItemData): Promise<{ data: FeedItemData; result: TranslationResult; spent?: { usage: AiUsage; status: "ok" | "failed" } }> => {
    const to = FeedItems.toTranslate(data);
    const master = data.texts.find((t) => t.language === data.masterLanguage);
    if (!to.length || !master) return { data, result: "none" };
    try {
      const answer = await deps.translator.translate({ title: master.title, text: master.text, label: master.label }, data.masterLanguage, to);
      return { data: FeedItems.withTranslations(data, answer.made), result: "done", ...(answer.usage ? { spent: { usage: answer.usage, status: "ok" as const } } : {}) };
    } catch (err) {
      if (err instanceof AiUnavailable) return { data, result: "unavailable" };
      return { data, result: "failed", ...(err instanceof AiFailed && err.usage ? { spent: { usage: err.usage, status: "failed" as const } } : {}) };
    }
  };

  /** What a call used is kept for the account that saved; a failure here never fails the save. */
  const keep = async (payer: string, feedId: string, spent: { usage: AiUsage; status: "ok" | "failed" } | undefined) => {
    if (spent && deps.keepUsage) await deps.keepUsage(payer, TokenUsages.record(spent.usage, { userId: payer, kind: "translate", feedId, status: spent.status, applied: spent.status === "ok", now: deps.now() })).catch(() => undefined);
  };

  /** The language the author says they write in must be one of the languages (nothing said: the one the tile has, or English). */
  const languageError = (body: Record<string, unknown>) => (body["masterLanguage"] === undefined || JigsawLanguages.is(body["masterLanguage"]) ? "" : JigsawLanguages.error(body["masterLanguage"]));

  /** The tile of the address when whoever asks may change it; else the answer says why not (`notYours`) and nothing is given. */
  const mine = async (req: express.Request, res: express.Response, notYours: string): Promise<FeedItemData | null> => {
    const { me, admin } = res.locals as { me: string; admin: boolean };
    const data = await byId(String(req.params.id));
    if (!data) bad(res, "No such tile.", 404);
    else if (!FeedItems.mayChange(data, me, admin)) bad(res, notYours, 403);
    else return data;
    return null;
  };

  /** Why what was sent cannot be saved as this tile ('' when it can). */
  const sentError = (body: Record<string, unknown>, made: FeedItemData): string =>
    languageError(body) || FeedItems.visibilityError(body["visibility"]) || (kind === "package" ? FeedItems.categoriesError(body["categories"]) : "") || FeedItems.of(made).error();

  router.get("/", async (req, res) => {
    const { me, admin } = res.locals as { me: string; admin: boolean };
    const now = deps.now();
    const search = typeof req.query.search === "string" ? req.query.search : "";
    const status = typeof req.query.status === "string" ? req.query.status : "";
    const items = (await store.list())
      .filter((d) => d.kind === kind && FeedItems.mayChange(d, me, admin) && FeedItems.matches(d, search) && (!status || FeedItems.of(d).status(now) === status));
    res.json({ items, now });
  });

  router.get("/:id", async (req, res) => {
    const data = await mine(req, res, "This is not yours.");
    if (data) res.json({ item: data, now: deps.now() });
  });

  router.post("/", async (req, res) => {
    const { me } = res.locals as { me: string };
    const body = (req.body ?? {}) as Record<string, unknown>;
    const made = FeedItems.edited(null, kind, body, me, deps.now());
    const error = sentError(body, { ...made, id: "new" });
    if (error) return bad(res, error, 400);
    const { data, result, spent } = await translated(made);
    const saved = await store.add(inputOf(data));
    await keep(me, saved.id, spent);
    res.status(201).json({ item: saved, translation: result });
  });

  router.put("/:id", async (req, res) => {
    const { me } = res.locals as { me: string };
    const before = await mine(req, res, "Only its owner can change it.");
    if (!before) return;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const made = FeedItems.edited(before, kind, body, me, deps.now());
    const error = sentError(body, made);
    if (error) return bad(res, error, 400);
    const { data, result, spent } = await translated(made);
    const saved = await store.update(before.id, inputOf(data));
    if (!saved) return bad(res, "No such tile.", 404);
    await keep(me, saved.id, spent);
    res.json({ item: saved, translation: result });
  });

  // a package: its pictures (the owner's page shows them, the upload makes them, each is linked to the package)
  if (pictures) {
    router.get("/:id/pictures", async (req, res) => {
      const data = await mine(req, res, "This is not yours.");
      if (data) res.json({ pictures: await pictures.list(data.id) });
    });
  }

  router.delete("/:id", async (req, res) => {
    const before = await mine(req, res, "Only its owner can delete it.");
    if (!before) return;
    if (pictures && (await pictures.list(before.id)).length) return bad(res, "This package still has pictures: delete them first.", 409); // none is left without its package
    await store.remove(before.id);
    res.status(204).end();
  });

  return router;
}

/** How many pictures of a package are named to a tile, to show one of them. */
const COVER_IDS = 8;

/** Up to `count` of the items, chosen at random (the order is not kept). */
function sampled<T>(items: readonly T[], count: number, random: () => number): T[] {
  const left = [...items];
  const out: T[] = [];
  while (out.length < count && left.length) out.push(left.splice(Math.floor(random() * left.length), 1)[0]);
  return out;
}

/** What the page of a package asks about the person: what they have got, the package even when it is not on the home page any more, and whether they are an admin. */
export interface PackageAccess {
  ids(me: string | undefined): Promise<ReadonlySet<string>>;
  find(packageId: string): Promise<FeedItemData | null>;
  isAdmin(me: string | undefined): Promise<boolean>;
}

/**
 * What the home page shows of the tiles that are not pictures: the collections are read and each tile that is right and whose time it is, is given (`GET /jigsaw-feed`, open to every visitor). This is where
 * a rule of who is shown what, or how many offers, will be added; the collections and their pages do not change for it. **A package comes with how many pictures it holds and the ids of a few of them,
 * chosen at random each time**, so the tile can show one; `GET /jigsaw-feed/package/:id` gives a package with all its pictures, for its page, and says whether the person has got it (`bought`) and may play
 * its pictures (`mayPlay`: they have it, own it or are an admin). A package that is active is there for everybody who may see it; one a person has got stays there for them also when it is not.
 */
export function jigsawFeedRouter(
  sources: readonly (() => Promise<readonly object[]>)[],
  now: () => number,
  pictures?: PackagePictures,
  random: () => number = Math.random,
  access?: PackageAccess,
): express.Router {
  const router = apiRouter();
  const read = async (me: string | undefined) => FeedItems.shown((await Promise.all(sources.map((source) => source()))).flat() as Record<string, unknown>[], now(), me);
  /** the tile as it is sent: a package with its count and a few ids */
  const sent = async (item: ReturnType<typeof FeedItems.of>): Promise<FeedItemData> => {
    if (item.kind !== "package" || !pictures) return item.data;
    const found = shownPictures(await pictures.list(item.id));
    return { ...item.data, pictureCount: found.length, coverIds: sampled(found, COVER_IDS, random).map((p) => p.id) };
  };
  router.get("/", async (req, res) => {
    try {
      const me = askerOf(req);
      const items = await read(me);
      // the packages the person has got say so (asked only when there is a package to ask about)
      const mine = access && me && items.some((i) => i.kind === "package") ? await access.ids(me) : new Set<string>();
      res.json({ items: await Promise.all(items.map(async (item) => ({ ...(await sent(item)), ...(item.kind === "package" && mine.has(item.id) ? { had: true } : {}) }))) });
    } catch (err) {
      console.error("Could not read the tiles of the home page", err);
      bad(res, "Try again.", 503);
    }
  });
  /** a package a person has got, also when it is not on the home page any more (null: it is deleted) */
  const keptPackage = async (id: string) => {
    const kept = access ? await access.find(id) : null;
    const data = kept ? FeedItems.stored(kept as unknown as Record<string, unknown>) : null;
    return data?.kind === "package" ? FeedItems.of(data) : null;
  };
  // the packages a person has got, as tiles: for the list of them (My pictures)
  router.get("/mine", async (req, res) => {
    try {
      const me = askerOf(req);
      const ids = access && me ? [...(await access.ids(me))] : [];
      const shown = ids.length ? await read(me) : [];
      const found = await Promise.all(ids.map(async (id) => shown.find((i) => i.kind === "package" && i.id === id) ?? (await keptPackage(id))));
      const items = found.filter((item): item is NonNullable<typeof item> => !!item);
      res.json({ items: await Promise.all(items.map(async (item) => ({ ...(await sent(item)), had: true }))) });
    } catch (err) {
      console.error("Could not read the packages of a person", err);
      bad(res, "Try again.", 503);
    }
  });
  router.get("/package/:id", async (req, res) => {
    try {
      const me = askerOf(req);
      const bought = !!access && (await access.ids(me)).has(req.params.id);
      let item = (await read(me)).find((i) => i.kind === "package" && i.id === req.params.id);
      if (!item && bought) item = (await keptPackage(req.params.id)) ?? undefined; // what a person has got stays theirs to look at
      if (!item || !pictures) return bad(res, "No such package.", 404);
      const mayPlay = bought || (!!me && item.ownerUid === me) || (!!access && (await access.isAdmin(me)));
      res.json({ item: await sent(item), pictures: shownPictures(await pictures.list(item.id)), bought, mayPlay });
    } catch (err) {
      console.error("Could not read a package", err);
      bad(res, "Try again.", 503);
    }
  });
  return router;
}

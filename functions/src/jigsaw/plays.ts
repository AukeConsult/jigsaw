import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { PieceStore } from "./jigsaw-pieces";
import { JIGSAW_MAX_SIDE, JigsawSpec, JIGSAW, PLAYS, PLAY_POSITIONS_DOC, PLAY_STATE, PieceMove, PlayPositions, PlaySpec, Plays } from "../models";

// The plays of a jigsaw: one game each, `jigsaw/<id>/plays/<play id>`, with the positions of its pieces in one document under it, `state/positions`. A play can only
// choose the look (see `Plays.overridesError`); the difficulty, the size, the picture and the pieces are the jigsaw's.

/** The most plays of one jigsaw that are listed for a user. */
const LIST_LIMIT = 100;

/** The play and where its pieces are, together. */
export interface PlayRecord {
  play: PlaySpec;
  positions: PlayPositions;
}

/** Where the plays are kept (Firestore in the app, memory in the tests). */
export interface PlayStore {
  /** Makes a play (its id is made here); the positions are kept with it. */
  create(jigsawId: string, play: Omit<PlaySpec, "id">, positions: PlayPositions): Promise<PlaySpec>;
  /** the plays of a jigsaw, newest first; of one user when a user is given */
  list(jigsawId: string, userId?: string): Promise<PlaySpec[]>;
  get(jigsawId: string, playId: string): Promise<PlayRecord | null>;
  /** Changes a play as one step (nothing happens in between, so two saves do not lose each other): `change` gets the play as it is and returns it as it is to be; null when there is no such play. */
  update(jigsawId: string, playId: string, change: (current: PlayRecord) => PlayRecord): Promise<PlayRecord | null>;
  remove(jigsawId: string, playId: string): Promise<boolean>;
  /** whether the jigsaw has been played (it has at least one play in which a piece has been moved: a round that is only opened is not a play yet) */
  has(jigsawId: string): Promise<boolean>;
  /** how many rounds have been played on the jigsaw (a round nobody has moved a piece in is not counted) */
  count(jigsawId: string): Promise<number>;
  /** takes away the rounds nobody has moved a piece in (the jigsaw is changed, so their pieces are out of date) */
  removeFresh(jigsawId: string): Promise<void>;
  /** takes all the plays of a jigsaw away (the jigsaw is deleted) */
  removeAll(jigsawId: string): Promise<void>;
}

/** The plays in the subcollection of the jigsaw document. */
export function firestorePlayStore(): PlayStore {
  const db = () => getFirestore();
  const plays = (jigsawId: string) => db().collection(JIGSAW).doc(jigsawId).collection(PLAYS);
  const positionsRef = (jigsawId: string, playId: string) => plays(jigsawId).doc(playId).collection(PLAY_STATE).doc(PLAY_POSITIONS_DOC);
  const readPlay = (id: string, data: unknown): PlaySpec => ({ id, ...(Plays.stored(data as Omit<PlaySpec, "id">) as Omit<PlaySpec, "id">) });

  return {
    async create(jigsawId, play, positions) {
      const ref = plays(jigsawId).doc();
      const batch = db().batch();
      batch.set(ref, Plays.stored(play));
      batch.set(positionsRef(jigsawId, ref.id), { data: Plays.positionsToText(positions) });
      await batch.commit();
      return { id: ref.id, ...Plays.stored(play) };
    },
    async list(jigsawId, userId) {
      const snap = await (userId ? plays(jigsawId).where("userId", "==", userId) : plays(jigsawId)).get(); // no index needed: one equality, sorted here
      return snap.docs
        .map((d) => readPlay(d.id, d.data()))
        .sort((a, b) => Plays.lastActive(b) - Plays.lastActive(a))
        .slice(0, LIST_LIMIT);
    },
    async get(jigsawId, playId) {
      const [play, state] = await Promise.all([plays(jigsawId).doc(playId).get(), positionsRef(jigsawId, playId).get()]);
      if (!play.exists) return null;
      return { play: readPlay(playId, play.data()), positions: Plays.positionsFromText(state.data()?.data) };
    },
    async update(jigsawId, playId, change) {
      const ref = plays(jigsawId).doc(playId);
      const stateRef = positionsRef(jigsawId, playId);
      return db().runTransaction(async (tx) => {
        const [play, state] = await Promise.all([tx.get(ref), tx.get(stateRef)]);
        if (!play.exists) return null;
        const next = change({ play: readPlay(playId, play.data()), positions: Plays.positionsFromText(state.data()?.data) });
        tx.set(ref, Plays.stored(next.play));
        tx.set(stateRef, { data: Plays.positionsToText(next.positions) });
        return { play: { id: playId, ...Plays.stored(next.play) }, positions: next.positions };
      });
    },
    async remove(jigsawId, playId) {
      const ref = plays(jigsawId).doc(playId);
      if (!(await ref.get()).exists) return false;
      await db().recursiveDelete(ref);
      return true;
    },
    async has(jigsawId) {
      return (await plays(jigsawId).get()).docs.some((d) => !d.data().fresh);
    },
    async count(jigsawId) {
      return (await plays(jigsawId).get()).docs.filter((d) => !d.data().fresh).length;
    },
    async removeFresh(jigsawId) {
      const snap = await plays(jigsawId).where("fresh", "==", true).get(); // one equality: no index needed
      await Promise.all(snap.docs.map((d) => db().recursiveDelete(d.ref)));
    },
    async removeAll(jigsawId) {
      await db().recursiveDelete(plays(jigsawId));
    },
  };
}

/** A game of a user, with the jigsaw it is a game of (enough to show it in a list). */
export interface UserGame {
  play: PlaySpec;
  jigsaw: { id: string; name: string };
}

/**
 * The games of one user over all the jigsaws, `/jigsaw-users/:id/plays`: GET: the rounds worked on last first. Each jigsaw is asked for the user's games (one equality on the plays of that
 * jigsaw, so no index is needed); a jigsaw the user has not played adds nothing. At most `LIST_LIMIT` games.
 */
export function userPlaysRouter(plays: PlayStore, deps: { jigsaws: () => Promise<JigsawSpec[]>; userOf: (userId: string) => Promise<{ id: string } | null> }): express.Router {
  const router = express.Router({ mergeParams: true });
  router.get("/", async (req, res) => {
    const userId = String((req.params as { id?: string }).id);
    const error = Plays.userIdError(userId);
    if (error) return void res.status(400).json({ error });
    if (!(await deps.userOf(userId))) return void res.status(404).json({ error: "No such user." });
    const jigsaws = await deps.jigsaws();
    const games = (await Promise.all(jigsaws.map(async (j) => (await plays.list(j.id, userId)).map((play): UserGame => ({ play, jigsaw: { id: j.id, name: j.name } })))))
      .flat()
      .filter((g) => !g.play.fresh) // a round nobody has moved a piece in is not listed
      .sort((a, b) => Plays.lastActive(b.play) - Plays.lastActive(a.play))
      .slice(0, LIST_LIMIT);
    res.json(games);
  });
  return router;
}

/** Where the plays come from: the jigsaw a play belongs to, and its pieces (the cut, which all plays share). */
export interface PlayDeps {
  jigsaw: (id: string) => Promise<JigsawSpec | null>;
  pieces: PieceStore;
  /** the user with this UID, or null (a play is played by a user that exists: it keeps the UID and the name of the user) */
  userOf: (userId: string) => Promise<{ id: string; name: string } | null>;
  /** the time now, in milliseconds (the tests give their own) */
  now?: () => number;
}

/**
 * The plays of a jigsaw, `/jigsaw/:id/plays`:
 *  GET /summary: {played}, whether anyone has started a game of it. GET ?userId=: its plays (of that user), newest first. POST {userId}: starts a play for the user with that UID (the play keeps the UID and the name of the user) (the pieces are scattered).
 *  GET: the plays of all the users can be read (a round of another player can be looked at). Changing or deleting a round needs the header `X-Jigsaw-User` to be its player (403 otherwise).
 *  GET /:playId: the play, the settings it is played with, and the pieces as it has them (without the graphics).
 *  PATCH /:playId/settings {overrides}: the look this play chooses (the line and the colours; null takes a choice away); anything else, the difficulty too, is refused (400).
 *  PATCH /:playId/positions {moves, storeWidth?, elapsedMs?}: where pieces are now (how wide the store of this game has grown to, and how long it has been played: that only grows); how many are in place and whether the game is solved follows from that. DELETE /:playId.
 */
export function playsRouter(plays: PlayStore, deps: PlayDeps): express.Router {
  const router = express.Router({ mergeParams: true });
  const bad = (res: express.Response, error: string, status = 400) => void res.status(status).json({ error });
  const now = () => (deps.now ?? Date.now)();
  const idOf = (req: express.Request) => String(req.params.id);

  /** the jigsaw of the request, or the answer that there is none */
  const jigsawOf = async (req: express.Request, res: express.Response): Promise<JigsawSpec | null> => {
    const jigsaw = await deps.jigsaw(idOf(req));
    if (!jigsaw) bad(res, "No such jigsaw.", 404);
    return jigsaw;
  };

  /**
   * A round can be looked at by anyone but changed only by its player: the request says who it is from in the header `X-Jigsaw-User` (the UID), and it has to be the
   * player of the round. There is no sign-in yet, so the header can be written by anyone: this keeps the app honest, it is not a lock. A real one comes with sign-in.
   */
  const ownRound: express.RequestHandler = async (req, res, next) => {
    const record = await plays.get(idOf(req), String(req.params.playId));
    if (record && req.get("X-Jigsaw-User") !== record.play.userId) return bad(res, "This round belongs to someone else: you can look at it, but not change it.", 403);
    next(); // no such round: the handler says so
  };

  router.get("/", async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    if (userId !== undefined) {
      const error = Plays.userIdError(userId);
      if (error) return bad(res, error);
    }
    res.json((await plays.list(idOf(req), userId)).filter((p) => !p.fresh)); // a round nobody has moved a piece in is not listed
  });

  router.post("/", async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const userId = (req.body as { userId?: unknown } | undefined)?.userId;
    const error = Plays.userIdError(userId);
    if (error) return bad(res, error);
    const user = await deps.userOf(userId as string);
    if (!user) return bad(res, "No such user: choose a user first.", 404);
    // opening a jigsaw again does not make another round: the player's round with no piece moved in it is the one to go on with
    const waiting = (await plays.list(jigsaw.id, user.id)).find((p) => p.fresh);
    if (waiting) return void res.status(200).json(waiting);
    const started = Plays.start(jigsaw, { id: user.id, name: user.name }, await deps.pieces.list(jigsaw.id), now());
    if ("error" in started) return bad(res, started.error, 409);
    res.status(201).json(await plays.create(jigsaw.id, started.play, started.positions));
  });

  router.get("/summary", async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    res.json({ played: await plays.has(idOf(req)) }); // whether anyone has started a game of it: if not, the whole jigsaw can still be edited
  });

  router.get("/:playId", async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const record = await plays.get(jigsaw.id, req.params.playId);
    if (!record) return bad(res, "No such play.", 404);
    const pieces = await deps.pieces.list(jigsaw.id);
    res.json({ play: record.play, settings: Plays.effective(jigsaw, record.play), pieces: Plays.piecesOf(pieces, record.positions) });
  });

  router.patch("/:playId/settings", ownRound, async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const change = (req.body as { overrides?: unknown } | undefined)?.overrides;
    const error = Plays.overridesError(change);
    if (error) return bad(res, error);
    const saved = await plays.update(jigsaw.id, req.params.playId, (cur) => ({ ...cur, play: { ...cur.play, overrides: Plays.changed(cur.play.overrides, change as never) } }));
    if (!saved) return bad(res, "No such play.", 404);
    res.json({ play: saved.play, settings: Plays.effective(jigsaw, saved.play) });
  });

  router.patch("/:playId/positions", ownRound, async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const { moves, storeWidth, elapsedMs } = (req.body ?? {}) as { moves?: unknown; storeWidth?: unknown; elapsedMs?: unknown };
    const error = Plays.movesError(moves);
    if (error) return bad(res, error);
    if (elapsedMs !== undefined) {
      const late = Plays.elapsedError(elapsedMs);
      if (late) return bad(res, late);
    }
    if (storeWidth !== undefined && !(typeof storeWidth === "number" && Number.isInteger(storeWidth) && storeWidth >= 0 && storeWidth <= JIGSAW_MAX_SIDE)) {
      return bad(res, `The store must be a whole number of pixels from 0 to ${JIGSAW_MAX_SIDE} wide.`);
    }
    const pieces = await deps.pieces.list(jigsaw.id);
    const saved = await plays.update(jigsaw.id, req.params.playId, (cur) => {
      const next = Plays.moved(cur.play, pieces, cur.positions, moves as PieceMove[], now());
      const grown = typeof storeWidth === "number" ? { ...next, play: { ...next.play, storeWidth } } : next; // the store of this game grew (pieces were collected over the whole frame)
      return typeof elapsedMs === "number" ? { ...grown, play: Plays.withElapsed(grown.play, elapsedMs) } : grown; // the time played so far
    });
    if (!saved) return bad(res, "No such play.", 404);
    res.json({ moved: (moves as PieceMove[]).length, matched: saved.play.matched, total: saved.play.total, status: saved.play.status });
  });

  router.delete("/:playId", ownRound, async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    if (!(await plays.remove(idOf(req), req.params.playId))) return bad(res, "No such play.", 404);
    res.status(204).end();
  });

  return router;
}

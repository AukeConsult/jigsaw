import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { PieceStore } from "./jigsaw-pieces";
import { JIGSAW_MAX_SIDE, JigsawPiece, JigsawPieces, JigsawSpec, JIGSAW, PLAYS, PLAY_PIECES, PLAY_POSITIONS_DOC, PLAY_STATE, PieceMove, PlayChoice, PlayPositions, PlaySpec, Plays } from "../models";

// The plays of a jigsaw: one game each, `jigsaw/<id>/plays/<play id>`, with the positions of its pieces in one document under it, `state/positions`. A play can only
// choose the look (see `Plays.overridesError`); the difficulty, the size, the picture and the pieces are the jigsaw's.

/** The most plays of one jigsaw that are listed for a user. */
const LIST_LIMIT = 100;
/** How many pieces are written in one Firestore batch. */
const PIECES_BATCH = 400;

/** The play and where its pieces are, together. */
export interface PlayRecord {
  play: PlaySpec;
  positions: PlayPositions;
}

/** Where the plays are kept (Firestore in the app, memory in the tests). */
export interface PlayStore {
  /** Makes a play (its id is made here); the positions are kept with it, and the pieces of the cut it has of its own (a round of a picture) under it. */
  create(jigsawId: string, play: Omit<PlaySpec, "id">, positions: PlayPositions, pieces?: JigsawPiece[]): Promise<PlaySpec>;
  /** the pieces of the cut a round has of its own (`play.cut`), by number: the documents under the round, the same as the pieces under a jigsaw (without graphics) */
  roundPieces(jigsawId: string, playId: string): Promise<JigsawPiece[]>;
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
  const piecesRef = (jigsawId: string, playId: string) => plays(jigsawId).doc(playId).collection(PLAY_PIECES);
  const readPlay = (id: string, data: unknown): PlaySpec => ({ id, ...(Plays.stored(data as Omit<PlaySpec, "id">) as Omit<PlaySpec, "id">) });

  return {
    async create(jigsawId, play, positions, pieces) {
      const ref = plays(jigsawId).doc();
      // the pieces of its own cut first (in batches: a batch holds 500 writes), then the round itself, so a round is never there without its pieces
      for (let i = 0; i < (pieces?.length ?? 0); i += PIECES_BATCH) {
        const chunk = db().batch();
        for (const piece of pieces!.slice(i, i + PIECES_BATCH)) chunk.set(piecesRef(jigsawId, ref.id).doc(piece.id), JigsawPieces.stored(piece));
        await chunk.commit();
      }
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
    async roundPieces(jigsawId, playId) {
      const snap = await piecesRef(jigsawId, playId).get();
      return snap.docs.map((d) => d.data() as JigsawPiece).sort((a, b) => a.number - b.number);
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
  /** `imageKey`: the key of the pictures, for a jigsaw that is private or hidden and that whoever asks may see (see `ImageAccess`); output only */
  jigsaw: { id: string; name: string; imageKey?: string };
}

/**
 * The games of one user over all the jigsaws, `/jigsaw-users/:id/plays`: GET: the rounds worked on last first. Each jigsaw is asked for the user's games (one equality on the plays of that
 * jigsaw, so no index is needed); a jigsaw the user has not played adds nothing. At most `LIST_LIMIT` games.
 */
/** Moves that would pull apart pieces that stick together (see `Plays.bondsError`): they are refused, 409. */
class BondBroken extends Error {}

export function userPlaysRouter(
  plays: PlayStore,
  deps: {
    jigsaws: () => Promise<JigsawSpec[]>;
    userOf: (userId: string) => Promise<{ id: string } | null>;
    /** the key of the pictures of a jigsaw for whoever asks (`me`), or nothing when the jigsaw is not private or hidden or they may not see it: the games listed are another user's too, so this is asked, not assumed */
    imageKeyFor?: (jigsaw: JigsawSpec, me: string | undefined) => Promise<string | undefined>;
  },
): express.Router {
  const router = express.Router({ mergeParams: true });
  router.get("/", async (req, res) => {
    const userId = String((req.params as { id?: string }).id);
    const error = Plays.userIdError(userId);
    if (error) return void res.status(400).json({ error });
    if (!(await deps.userOf(userId))) return void res.status(404).json({ error: "No such account." });
    const jigsaws = await deps.jigsaws();
    const me = req.get("X-Jigsaw-User");
    const games = (await Promise.all(jigsaws.map(async (j) => {
      const own = await plays.list(j.id, userId);
      const imageKey = own.length && deps.imageKeyFor ? await deps.imageKeyFor(j, me) : undefined;
      return own.map((play): UserGame => ({ play, jigsaw: { id: j.id, name: j.name, ...(imageKey ? { imageKey } : {}) } }));
    })))
      .flat()
      .filter((g) => !g.play.fresh) // a round nobody has moved a piece in is not listed
      .sort((a, b) => Plays.lastActive(b.play) - Plays.lastActive(a.play))
      .slice(0, LIST_LIMIT)
      .map((g) => ({ ...g, play: Plays.publicOf(g.play) }));
    res.json(games);
  });
  return router;
}

/** Where the plays come from: the jigsaw a play belongs to, and its pieces (the cut, which all plays share). */
export interface PlayDeps {
  jigsaw: (id: string) => Promise<JigsawSpec | null>;
  pieces: PieceStore;
  /** the user with this UID, or null (a play is played by a user that exists: it keeps the UID and the name of the user) */
  userOf: (userId: string) => Promise<{ id: string; name: string; firebaseUids?: string[] } | null>;
  /** the time now, in milliseconds (the tests give their own) */
  now?: () => number;
  /** numbers from 0 up to 1 for the cut of a picture (the tests give their own) */
  random?: () => number;
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
    res.locals.round = record?.play; // already read: the pieces of the round are found from it without another read
    next(); // no such round: the handler says so
  };

  /** the pieces a round is played with: those of the cut it has of its own (a round of a picture), else the jigsaw's, as always */
  const piecesOf = (jigsaw: JigsawSpec, round: PlaySpec | undefined): Promise<JigsawPiece[]> => (round?.cut ? plays.roundPieces(jigsaw.id, round.id) : deps.pieces.list(jigsaw.id));

  router.get("/", async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    if (userId !== undefined) {
      const error = Plays.userIdError(userId);
      if (error) return bad(res, error);
    }
    res.json((await plays.list(idOf(req), userId)).filter((p) => !p.fresh).map(Plays.publicOf)); // a round nobody has moved a piece in is not listed
  });

  router.post("/", async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const userId = (req.body as { userId?: unknown } | undefined)?.userId;
    const error = Plays.userIdError(userId);
    if (error) return bad(res, error);
    const user = await deps.userOf(userId as string);
    if (!user) return bad(res, "No such account: choose an account first.", 404);
    // a picture is cut in the round: the person chooses the number of pieces and the difficulty (a ready jigsaw has its own and refuses a choice)
    const body = req.body as { columns?: unknown; rows?: unknown; snapPercent?: unknown; timed?: unknown };
    const asked = body.columns !== undefined || body.rows !== undefined || body.snapPercent !== undefined ? { columns: body.columns, rows: body.rows, snapPercent: body.snapPercent, ...(body.timed !== undefined ? { timed: body.timed } : {}) } : undefined;
    const wrong = Plays.choiceError(jigsaw, asked);
    if (wrong) return bad(res, wrong);
    // a jigsaw that the user has solved is not played again by them (it can be looked at, or the solved round deleted)
    const theirs = await plays.list(jigsaw.id, user.id);
    if (asked) return startOfPicture(res, jigsaw, user, asked as PlayChoice, theirs);
    if (theirs.some((p) => p.status === "solved")) return bad(res, "You have solved this jigsaw: it cannot be played again.", 409);
    // opening a jigsaw again does not make another round: the player's round with no piece moved in it is the one to go on with
    const waiting = theirs.find((p) => p.fresh);
    if (waiting) return void res.status(200).json(Plays.publicOf(waiting));
    const started = Plays.start(jigsaw, { id: user.id, name: user.name }, await deps.pieces.list(jigsaw.id), now());
    if ("error" in started) return bad(res, started.error, 409);
    // a login of the account that plays marks the round (its UID is kept for later use, and the page is told only that the round is protected)
    const marked = Plays.marked(started.play, user, res.locals.logonUid as string | undefined);
    res.status(201).json(Plays.publicOf(await plays.create(jigsaw.id, marked, started.positions)));
  });

  /** Starts a round of a picture: not at a size the user has solved, not while another is going; a round only opened is gone on with when the choice is the same and replaced when it is not. */
  const startOfPicture = async (res: express.Response, jigsaw: JigsawSpec, user: { id: string; name: string; firebaseUids?: string[] }, choice: PlayChoice, theirs: PlaySpec[]) => {
    const blocked = Plays.blockedBy(theirs, choice.columns * choice.rows) || Plays.goingError(theirs);
    if (blocked) return bad(res, blocked, 409);
    const waiting = theirs.filter((p) => p.fresh);
    const same = waiting.find((p) => p.cut?.columns === choice.columns && p.cut?.rows === choice.rows && p.snapPercent === choice.snapPercent && (p.timed === false) === (choice.timed === false));
    if (same) return void res.status(200).json(Plays.publicOf(same));
    await Promise.all(waiting.map((p) => plays.remove(jigsaw.id, p.id))); // nothing was moved in them: nothing is lost
    const started = Plays.startOwn(jigsaw, { id: user.id, name: user.name }, choice, now(), deps.random);
    if ("error" in started) return bad(res, started.error, 409);
    const marked = Plays.marked(started.play, user, res.locals.logonUid as string | undefined);
    res.status(201).json(Plays.publicOf(await plays.create(jigsaw.id, marked, started.positions, started.pieces)));
  };

  router.get("/summary", async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    res.json({ played: await plays.has(idOf(req)) }); // whether anyone has started a game of it: if not, the whole jigsaw can still be edited
  });

  router.get("/:playId", async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const record = await plays.get(jigsaw.id, req.params.playId);
    if (!record) return bad(res, "No such play.", 404);
    const pieces = await piecesOf(jigsaw, record.play);
    const layout = Plays.jigsawFor(jigsaw, record.play);
    // a round of a picture says the size of its picture area, its grid and its store (it has a cut of its own); another round is answered as it was
    res.json({ play: Plays.publicOf(record.play), settings: Plays.effective(jigsaw, record.play), pieces: Plays.piecesOf(pieces, record.positions), ...(record.play.cut ? { layout: { width: layout.width, height: layout.height, gridSize: layout.gridSize, storeWidth: layout.storeWidth } } : {}) });
  });

  // starts this round over: the pieces are scattered anew and the time is back to nothing (the same round, not another one)
  router.post("/:playId/restart", ownRound, async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const round = res.locals.round as PlaySpec | undefined;
    const pieces = await piecesOf(jigsaw, round);
    const layout = round ? Plays.jigsawFor(jigsaw, round) : jigsaw; // the picture area of the round's own cut
    let failed = "";
    let solved = false;
    const saved = await plays.update(jigsaw.id, req.params.playId, (cur) => {
      if (cur.play.status === "solved") {
        solved = true; // a solved round stays solved: it is not played over
        return cur;
      }
      const again = Plays.restart(cur.play, layout, pieces, now());
      if ("error" in again) {
        failed = again.error;
        return cur;
      }
      return again;
    });
    if (solved) return bad(res, "This round is solved: it cannot be played over.", 409);
    if (failed) return bad(res, failed, 409);
    if (!saved) return bad(res, "No such play.", 404);
    res.json({ matched: saved.play.matched, total: saved.play.total, status: saved.play.status });
  });

  router.patch("/:playId/settings", ownRound, async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const change = (req.body as { overrides?: unknown } | undefined)?.overrides;
    const error = Plays.overridesError(change);
    if (error) return bad(res, error);
    const saved = await plays.update(jigsaw.id, req.params.playId, (cur) => ({ ...cur, play: { ...cur.play, overrides: Plays.changed(cur.play.overrides, change as never) } }));
    if (!saved) return bad(res, "No such play.", 404);
    res.json({ play: Plays.publicOf(saved.play), settings: Plays.effective(jigsaw, saved.play) });
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
    const pieces = await piecesOf(jigsaw, res.locals.round as PlaySpec | undefined);
    let saved;
    try {
      saved = await plays.update(jigsaw.id, req.params.playId, (cur) => {
      const next = Plays.moved(cur.play, pieces, cur.positions, moves as PieceMove[], now());
      const broken = Plays.bondsError(pieces, cur.positions, next.positions); // a bond between pieces is never broken
      if (broken) throw new BondBroken(broken);
      const grown = typeof storeWidth === "number" ? { ...next, play: { ...next.play, storeWidth } } : next; // the store of this game grew (pieces were collected over the whole frame)
      return typeof elapsedMs === "number" ? { ...grown, play: Plays.withElapsed(grown.play, elapsedMs) } : grown; // the time played so far
      });
    } catch (err) {
      if (err instanceof BondBroken) return bad(res, err.message, 409);
      throw err;
    }
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

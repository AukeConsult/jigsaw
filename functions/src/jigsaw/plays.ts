import { getFirestore } from "firebase-admin/firestore";
import express from "express";
import { documentExists } from "./jigsaw-image";
import { PieceStore } from "./jigsaw-pieces";
import { CutShapes, JIGSAW_MAX_SIDE, JigsawPiece, JigsawPieces, JigsawSpec, JIGSAW, PLAYS, PLAY_PIECES, PLAY_POSITIONS_DOC, PLAY_STATE, PieceMove, PlayChoice, PlayPositions, PlaySpec, Plays, PlayLookSetup } from "../models";
import { apiRouter, askerOf, bad } from "../common/http";

// The plays of a jigsaw: one game each, `jigsaw/<id>/plays/<play id>`, with the positions of its pieces in one document under it, `state/positions`.

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
  /** the pieces of the cut a round has of its own (`play.cut`), by number: the documents under the round, the same as the pieces under a jigsaw */
  roundPieces(jigsawId: string, playId: string): Promise<JigsawPiece[]>;
  /** the plays of a jigsaw, newest first; of one user when a user is given */
  list(jigsawId: string, userId?: string): Promise<PlaySpec[]>;
  /** the rounds of one user on every jigsaw, each with the jigsaw it is on: one question, not one for each jigsaw */
  listOfUser(userId: string): Promise<{ jigsawId: string; play: PlaySpec }[]>;
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

  /** Counted by Firestore, not read: all the rounds minus those that are only opened (`fresh` is only stored when it is true, so the rest are the played ones). Nothing is sent but two numbers. */
  const playedCount = async (jigsawId: string): Promise<number> => {
    const [all, fresh] = await Promise.all([plays(jigsawId).count().get(), plays(jigsawId).where("fresh", "==", true).count().get()]);
    return all.data().count - fresh.data().count;
  };

  const store: PlayStore = {
    async create(jigsawId, play, positions, pieces) {
      const ref = plays(jigsawId).doc();
      // the pieces of its own cut first (in batches: a batch holds 500 writes), then the round itself, so a round is never there without its pieces
      const chunks: JigsawPiece[][] = [];
      for (let i = 0; i < (pieces?.length ?? 0); i += PIECES_BATCH) chunks.push(pieces!.slice(i, i + PIECES_BATCH));
      await Promise.all(
        chunks.map((list) => {
          const chunk = db().batch();
          for (const piece of list) chunk.set(piecesRef(jigsawId, ref.id).doc(piece.id), JigsawPieces.stored(piece));
          return chunk.commit();
        }),
      );
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
    async listOfUser(userId) {
      try {
        // all the `plays` of the database with this user, in one question (it needs the index of `plays.userId` over the whole collection group, see `firestore.indexes.json`);
        // the jigsaw is the document above the collection, and only the plays under a jigsaw are the ones wanted
        const snap = await db().collectionGroup(PLAYS).where("userId", "==", userId).get();
        return snap.docs.flatMap((d) => {
          const jigsaw = d.ref.parent.parent;
          return jigsaw?.parent.id === JIGSAW ? [{ jigsawId: jigsaw.id, play: readPlay(d.id, d.data()) }] : [];
        });
      } catch (err) {
        if ((err as { code?: number }).code !== 9) throw err; // 9: the index is not deployed yet (`npm run sync:firestore`): ask each jigsaw instead, which needs none
        const ids = (await db().collection(JIGSAW).select().get()).docs.map((d) => d.id);
        const each = await Promise.all(ids.map(async (jigsawId) => (await store.list(jigsawId, userId)).map((play) => ({ jigsawId, play }))));
        return each.flat();
      }
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
      if (!(await documentExists(ref))) return false;
      await db().recursiveDelete(ref);
      return true;
    },
    async has(jigsawId) {
      return (await playedCount(jigsawId)) > 0;
    },
    count: playedCount,
    async removeFresh(jigsawId) {
      const snap = await plays(jigsawId).where("fresh", "==", true).select().get(); // one equality: no index needed; only the references are wanted
      await Promise.all(snap.docs.map((d) => db().recursiveDelete(d.ref)));
    },
    async removeAll(jigsawId) {
      await db().recursiveDelete(plays(jigsawId));
    },
  };
  return store;
}

/** A game of a user, with the jigsaw it is a game of (enough to show it in a list). */
export interface UserGame {
  play: PlaySpec;
  /** `imageKey`: the key of the pictures, for a jigsaw that is private or hidden and that whoever asks may see (see `ImageAccess`); output only */
  jigsaw: { id: string; name: string; imageKey?: string };
}

/**
 * The games of one user over all the jigsaws, `/jigsaw-users/:id/plays`: GET: the rounds worked on last first, from one question over the plays of every jigsaw (`PlayStore.listOfUser`).
 * A game on a jigsaw that is not among the newest (the ones that are named) is left out. At most `LIST_LIMIT` games.
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
  const router = apiRouter({ mergeParams: true });
  router.get("/", async (req, res) => {
    const userId = String((req.params as { id?: string }).id);
    const error = Plays.userIdError(userId);
    if (error) return bad(res, error);
    // the account, the jigsaws (to name them) and the rounds of the user over all the jigsaws are asked for at the same time
    const [user, jigsaws, rounds] = await Promise.all([deps.userOf(userId), deps.jigsaws(), plays.listOfUser(userId)]);
    if (!user) return bad(res, "No such account.", 404);
    const me = askerOf(req);
    const named = new Map(jigsaws.map((j) => [j.id, j]));
    const shown = rounds
      .filter((r) => !r.play.fresh && named.has(r.jigsawId) && Plays.mayLookAt(r.play, me)) // a round nobody has moved a piece in is not listed; a private round is its player's
      .sort((a, b) => Plays.lastActive(b.play) - Plays.lastActive(a.play))
      .slice(0, LIST_LIMIT);
    // the key of the pictures is asked once for each jigsaw that has a game to show, at the same time
    const keys = new Map(await Promise.all([...new Set(shown.map((r) => r.jigsawId))].map(async (id) => [id, deps.imageKeyFor ? await deps.imageKeyFor(named.get(id)!, me) : undefined] as const)));
    const games = shown.map((r): UserGame => {
      const imageKey = keys.get(r.jigsawId);
      return { play: Plays.publicOf(r.play), jigsaw: { id: r.jigsawId, name: named.get(r.jigsawId)!.name, ...(imageKey ? { imageKey } : {}) } };
    });
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
  /** whether the account that asks may change and delete the rounds of others too (an admin) */
  mayManage?: (me: string | undefined) => Promise<boolean>;
  /** whether this PLAYER may start a round of it as far as packages go: a picture of a package is for its owner, the owner of the package (to try it out) and an account that has the package. Nobody else, an admin neither (`BoughtPackages.mayUse`) */
  mayStart?: (jigsaw: JigsawSpec, userId: string) => Promise<boolean>;
  /** numbers from 0 up to 1 for the cut of a picture (the tests give their own) */
  random?: () => number;
}

/**
 * The plays of a jigsaw, `/jigsaw/:id/plays`:
 *  GET /summary: {played, rounds, players}: whether anyone has started a game of it, how many rounds and by how many accounts. GET ?userId=: its plays (of that user), newest first. POST {userId}: starts a play for the user with that UID (the play keeps the UID and the name of the user) (the pieces are scattered); 403 when it is a picture of a package that player does not have.
 *  GET: the plays of all the users can be read (a round of another player can be looked at). Changing or deleting a round needs the header `X-Jigsaw-User` to be its player (403 otherwise).
 *  GET /:playId: the play, the settings it is played with, and the pieces as it has them.
 *  PATCH /:playId/positions {moves, storeWidth?, elapsedMs?}: where pieces are now (how wide the store of this game has grown to, and how long it has been played: that only grows); how many are in place and whether the game is solved follows from that. DELETE /:playId.
 */
export function playsRouter(plays: PlayStore, deps: PlayDeps): express.Router {
  const router = apiRouter({ mergeParams: true });
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
    const me = askerOf(req);
    if (record && me !== record.play.userId && !(await deps.mayManage?.(me))) return bad(res, "This round belongs to someone else: you can look at it, but not change it.", 403);
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
    const me = askerOf(req);
    const admin = !!(await deps.mayManage?.(me));
    res.json((await plays.list(idOf(req), userId)).filter((p) => !p.fresh && Plays.mayLookAt(p, me, admin)).map(Plays.publicOf)); // a round nobody has moved a piece in is not listed; a private one is its player's
  });

  router.post("/", async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const userId = (req.body as { userId?: unknown } | undefined)?.userId;
    const error = Plays.userIdError(userId);
    if (error) return bad(res, error);
    const user = await deps.userOf(userId as string);
    if (!user) return bad(res, "No such account: choose an account first.", 404);
    // a round of a picture of a package is only for a player who has it: asked for the player of the round, not for who sends the request
    if (deps.mayStart && !(await deps.mayStart(jigsaw, user.id))) return bad(res, "This picture is in a package you do not have: add the package to your pictures first.", 403);
    // a picture is cut in the round: the person chooses the number of pieces and the difficulty (a ready jigsaw has its own and refuses a choice)
    const body = req.body as { columns?: unknown; rows?: unknown; snapPercent?: unknown; timed?: unknown; private?: unknown; cutShape?: unknown };
    if (res.locals.privateRound) body.private = true; // started through a link to a private picture: nobody else looks at it
    const asked = body.columns !== undefined || body.rows !== undefined || body.snapPercent !== undefined ? { columns: body.columns, rows: body.rows, snapPercent: body.snapPercent, ...(body.timed !== undefined ? { timed: body.timed } : {}), ...(body.private !== undefined ? { private: body.private } : {}), ...(body.cutShape !== undefined ? { cutShape: body.cutShape } : {}) } : undefined;
    const wrong = Plays.choiceError(jigsaw, asked) || Plays.privateError(body.private);
    if (wrong) return bad(res, wrong);
    // a jigsaw that the user has solved is not played again by them (it can be looked at, or the solved round deleted)
    const theirs = await plays.list(jigsaw.id, user.id);
    if (asked) return startOfPicture(res, jigsaw, user, asked as PlayChoice, theirs);
    if (theirs.some((p) => p.status === "solved")) return bad(res, "You have solved this jigsaw: it cannot be played again.", 409);
    // opening a jigsaw again does not make another round: the player's round with no piece moved in it is the one to go on with
    const waiting = theirs.find((p) => p.fresh);
    if (waiting) return void res.status(200).json(Plays.publicOf(waiting));
    const started = Plays.start(jigsaw, { id: user.id, name: user.name }, await deps.pieces.list(jigsaw.id), Date.now());
    if ("error" in started) return bad(res, started.error, 409);
    await keepStarted(res, jigsaw.id, user, started, body.private);
  });

  /** Keeps a round that was just started, private when that was asked, and answers 201 with it. A login of the account that plays marks it (its UID is kept for later use; the page is told only that the round is protected). */
  const keepStarted = async (res: express.Response, jigsawId: string, user: { id: string; name: string; firebaseUids?: string[] }, started: { play: Omit<PlaySpec, "id">; positions: PlayPositions; pieces?: JigsawPiece[] }, isPrivate: unknown): Promise<void> => {
    const marked = Plays.withPrivacy(Plays.marked(started.play, user, res.locals.logonUid as string | undefined), isPrivate);
    res.status(201).json(Plays.publicOf(await plays.create(jigsawId, marked, started.positions, started.pieces)));
  };

  /** Changes the play of the round of the address (not where its pieces are), and answers with it. */
  const changePlay = async (req: express.Request, res: express.Response, change: (play: PlaySpec) => PlaySpec): Promise<void> => {
    const saved = await plays.update(idOf(req), String(req.params.playId), (cur) => ({ ...cur, play: change(cur.play) }));
    if (!saved) return bad(res, "No such play.", 404);
    res.json(Plays.publicOf(saved.play));
  };

  /** Starts a round of a picture: not at a size the user has solved, not while another is going; a round only opened is gone on with when the choice is the same and replaced when it is not. */
  const startOfPicture = async (res: express.Response, jigsaw: JigsawSpec, user: { id: string; name: string; firebaseUids?: string[] }, choice: PlayChoice, theirs: PlaySpec[]) => {
    const blocked = Plays.blockedBy(theirs, choice.columns * choice.rows) || Plays.goingError(theirs);
    if (blocked) return bad(res, blocked, 409);
    const waiting = theirs.filter((p) => p.fresh);
    const same = waiting.find((p) => p.cut?.columns === choice.columns && p.cut?.rows === choice.rows && p.snapPercent === choice.snapPercent && (p.timed === false) === (choice.timed === false) && (p.private === true) === (choice.private === true) && CutShapes.of(p.cut?.shape) === CutShapes.of(choice.cutShape));
    if (same) return void res.status(200).json(Plays.publicOf(same));
    await Promise.all(waiting.map((p) => plays.remove(jigsaw.id, p.id))); // nothing was moved in them: nothing is lost
    const started = Plays.startOwn(jigsaw, { id: user.id, name: user.name }, choice, Date.now(), deps.random);
    if ("error" in started) return bad(res, started.error, 409);
    await keepStarted(res, jigsaw.id, user, started, choice.private);
  };

  router.get("/summary", async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    // whether anyone has started a game of it (if not, the whole jigsaw can still be edited), and how many: numbers only, so the private rounds are counted too; a round nobody has moved a piece in is none
    const all = (await plays.list(idOf(req))).filter((p) => !p.fresh);
    res.json({ played: all.length > 0, rounds: all.length, players: new Set(all.map((p) => p.userId)).size });
  });

  router.get("/:playId", async (req, res) => {
    const jigsaw = await jigsawOf(req, res);
    if (!jigsaw) return;
    const record = await plays.get(jigsaw.id, req.params.playId);
    if (!record) return bad(res, "No such play.", 404);
    if (!Plays.mayLookAt(record.play, askerOf(req), !!(await deps.mayManage?.(askerOf(req))))) return bad(res, "No such play.", 404); // a private round is its player's
    const pieces = await piecesOf(jigsaw, record.play);
    const layout = Plays.jigsawFor(jigsaw, record.play);
    // a round of a picture says the size of its picture area, its grid and its store (it has a cut of its own); another round is answered as it was
    res.json({ play: Plays.publicOf(record.play), settings: Plays.effective(jigsaw, record.play), pieces: Plays.piecesOf(pieces, record.positions), ...(record.play.cut ? { layout: { width: layout.width, height: layout.height, gridSize: layout.gridSize } } : {}) });
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
      const again = Plays.restart(cur.play, layout, pieces, Date.now());
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
      const next = Plays.moved(cur.play, pieces, cur.positions, moves as PieceMove[], Date.now());
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

  // PATCH /:playId/privacy {private}: the player makes the round private (only they see it) or public again
  router.patch("/:playId/privacy", ownRound, async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    const flag = (req.body as { private?: unknown } | undefined)?.private;
    if (typeof flag !== "boolean") return bad(res, "Say whether the round is private: yes or no.");
    await changePlay(req, res, (play) => Plays.withPrivacy(play, flag));
  });

  // PATCH /:playId/look {look}: the table and the sound of this round only, or {look: null}: the round follows its player's preference again
  router.patch("/:playId/look", ownRound, async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    const look = (req.body as { look?: unknown } | undefined)?.look;
    const wrong = Plays.lookError(look);
    if (wrong) return bad(res, wrong, 400);
    await changePlay(req, res, (play) => Plays.withLook(play, look as PlayLookSetup | null));
  });

  router.delete("/:playId", ownRound, async (req, res) => {
    if (!(await jigsawOf(req, res))) return;
    if (!(await plays.remove(idOf(req), req.params.playId))) return bad(res, "No such play.", 404);
    res.status(204).end();
  });

  return router;
}

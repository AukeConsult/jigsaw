import { PlayLookSetup, PlayLooks } from './play-look';
import { JigsawSettings, JigsawSpec } from './jigsaw-settings';
import { JigsawKinds } from './jigsaw-kind';
import { DIFFICULTIES } from './jigsaw-search';
import { JigsawCut, JigsawPiece, JigsawPieces, PieceChoice, PieceMove, JIGSAW_MAX_PIECES } from './jigsaw';
import { STICK_TOLERANCE_PX } from './puzzle';
import { JigsawUsers } from './jigsaw-user';
import { CutShape, CutShapes } from './cut-shape';

// A play: one game of a jigsaw, by one user. The jigsaw is what is fixed (its picture, size, grid and the cut into pieces, and the defaults of difficulty and look);
// a play holds what a person changes while playing: where the pieces are, how far the game has come, and the few settings a player may choose for themselves.
// A play can NOT change anything that has to do with the size, the picture or the pieces: those are the jigsaw's, and every play of it shares them. Nor can it choose
// the difficulty: that is a setting of the jigsaw too (its `snapPercent`), the same in every round, and it follows the jigsaw when the jigsaw is edited.

/** The subcollection of a jigsaw that holds its plays: `jigsaw/<id>/plays/<play id>`; the positions of a play are `…/state/positions` (one document). */
export const PLAYS = 'plays';
export const PLAY_STATE = 'state';
export const PLAY_POSITIONS_DOC = 'positions';

/** The most time a round can have been played, in milliseconds (a month: a number that is not made up by a bug or a joke). */
export const PLAY_MAX_ELAPSED_MS = 30 * 24 * 60 * 60 * 1000;

/** The longest id of a user. */
export const PLAY_MAX_USER_ID = 128;

/** The settings a play may have of its own: the look (the line and the colours), never anything else. Nothing writes them now (see `TODO.md`, "Future account settings"); a round that has them keeps them. */
export const PLAY_OVERRIDE_KEYS = ['lineWidth', 'lineColor', 'backColor'] as const;
export type PlayOverrideKey = (typeof PLAY_OVERRIDE_KEYS)[number];
export type PlayOverrides = Partial<Pick<JigsawSpec, PlayOverrideKey>>;

export type PlayStatus = 'active' | 'solved';

/** The cut a round of a picture has of its own: how many pieces across and down, and the side of a piece in pixels (the picture area is `columns * grid` wide and `rows * grid` high). */
export interface PlayCut {
  columns: number;
  rows: number;
  grid: number;
  /** what the tabs look like; none: classic */
  shape?: CutShape;
}

/** What a person chooses when a round of a picture starts: the cut (a whole number of columns and rows), the difficulty (the snap range, in percent of the grid) and whether the round is timed. */
export interface PlayChoice {
  columns: number;
  rows: number;
  snapPercent: number;
  /** `false`: no clock in this round (left out: it follows the picture, which has a clock unless it says it has none) */
  timed?: boolean;
  /** what the tabs look like (`CutShapes`; left out: classic) */
  cutShape?: CutShape;
  /** `true`: a private round (see `PlaySpec.private`) */
  private?: boolean;
}

/** The subcollection of a round that holds the pieces of its own cut: `jigsaw/<id>/plays/<play id>/pieces/<piece id>` (the same documents as `JIGSAW_PIECES` under a jigsaw). */
export const PLAY_PIECES = 'pieces';

/** One game of a jigsaw. */
export interface PlaySpec {
  id: string;
  jigsawId: string;
  /** who plays it: the UID of the user (never the user name, which can be changed); the plays of a user are found by it */
  userId: string;
  /** the name of that user when the game was started (a copy, to show who played it; the user is found by `userId`) */
  userName: string;
  status: PlayStatus;
  /** milliseconds since 1970 */
  startedAt: number;
  /** when a piece was last moved in this round (milliseconds since 1970); a round from before it has none, and `Plays.lastActive` falls back to when it was started */
  updatedAt?: number;
  /** when the last piece was put in place (milliseconds since 1970); without it the game is not solved */
  solvedAt?: number;
  /** how many pieces are in their own place, of how many there are */
  matched: number;
  total: number;
  /** how long the round has been played, in milliseconds: the time it has been open on the screen of its player (without it, nothing is known: a round from before the clock) */
  elapsedMs?: number;
  /** how wide the store frame of this game is (it depends on the screen, and grows when the pieces are collected over the whole frame) */
  storeWidth: number;
  /**
   * SERVER ONLY, never in what the API tells the page (`Plays.publicOf` takes it away): the UID of the Firebase login that started the round, kept for later use. A round is only marked when the
   * account that plays is one of the logins of the jigsaw account; a round of an open account has none.
   */
  logonUid?: string;
  /** what the page is told instead of the login: the round was started by a login of its account, so it is protected by that account */
  protected?: boolean;
  /** the round is made but nobody has moved a piece yet (looking at it and going back does not make a round): it is not listed, and not counted as played, until the first piece is moved */
  fresh?: boolean;
  /** a round of a picture: the cut it was started with (its pieces are the documents under it); a round of a ready jigsaw has none and inherits the cut of the jigsaw */
  cut?: PlayCut;
  /** a round of a picture: the difficulty it was started with (the snap range in percent of the grid); without it the round follows the jigsaw's */
  snapPercent?: number;
  /** a round of a picture: `false` when it was started without a clock (left out: the round follows the picture) */
  timed?: false;
  /** a private round: only its player sees it (not in the list of rounds on the front page, nor in the rounds of the jigsaw for the others); without it the round is public */
  private?: true;
  /** the table, pieces, effects and sound of this round only, over the player's own preference (`PlayLooks`); without it the round follows the preference */
  look?: PlayLookSetup;
  /** the look this play has chosen (the jigsaw's is used until the player changes it); never the difficulty, which is the jigsaw's */
  overrides: PlayOverrides;
}

/** Where the pieces of a play are: the id of a piece -> [centre across, centre down, layer]. Kept as one document, not one for each piece. */
export type PlayPositions = Record<string, [number, number, number]>;

/** The settings the round is played with: the difficulty is the jigsaw's; the look is the play's own choice, or else the jigsaw's, or else what the model says. */
export interface PlaySettings {
  snapPercent: number;
  lineWidth: number;
  lineColor: string;
  backColor: string;
}

export class Plays {
  /** The reason a user id is not allowed, or ''. */
  static userIdError(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value) || value.length > PLAY_MAX_USER_ID) return 'A play needs the id of its account (letters, digits and _ . : -).';
    return '';
  }

  /** The settings a play is played with. */
  static effective(jigsaw: Pick<JigsawSpec, PlayOverrideKey | 'snapPercent'>, play: Pick<PlaySpec, 'overrides'> & { snapPercent?: number }): PlaySettings {
    const own = play.overrides;
    return {
      snapPercent: play.snapPercent ?? jigsaw.snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT, // the round's own difficulty when it was chosen for a picture, else the jigsaw's
      lineWidth: own.lineWidth ?? jigsaw.lineWidth ?? JigsawSettings.DEFAULT_LINE_WIDTH,
      lineColor: own.lineColor ?? jigsaw.lineColor ?? JigsawSettings.DEFAULT_LINE_COLOR,
      backColor: own.backColor ?? jigsaw.backColor ?? JigsawSettings.DEFAULT_BACK_COLOR,
    };
  }

  /**
   * The jigsaw as this round plays it: what a cut of its own and a difficulty of its own say wins over the jigsaw's (the size of the picture area, the grid, the difficulty, how wide the store is),
   * everything else is the jigsaw's. A round with none of its own (every round of a ready jigsaw) gets the jigsaw itself, the same object.
   */
  static jigsawFor<J extends Pick<JigsawSpec, 'width' | 'height' | 'gridSize' | 'snapPercent' | 'storeWidth'>>(jigsaw: J, play: Pick<PlaySpec, 'cut' | 'snapPercent' | 'storeWidth' | 'timed'>): J {
    if (!play.cut && play.snapPercent === undefined && play.timed === undefined) return jigsaw;
    const { cut } = play;
    return {
      ...jigsaw,
      ...(cut ? { width: cut.columns * cut.grid, height: cut.rows * cut.grid, gridSize: cut.grid, storeWidth: play.storeWidth } : {}),
      ...(play.snapPercent !== undefined ? { snapPercent: play.snapPercent } : {}),
      ...(play.timed === false ? { timed: false } : {}), // a round without a clock has none, whatever the picture says
    };
  }

  /**
   * The reason a choice at the start of a round is not allowed, or ''. A picture needs one: a number of pieces from `JigsawCut.pieceChoices` for the shape of its picture, and one of the
   * difficulties. A ready jigsaw has its cut and difficulty already, so a choice for it is refused.
   */
  static choiceError(jigsaw: Pick<JigsawSpec, 'kind' | 'width' | 'height'>, choice: unknown): string {
    if (!JigsawKinds.isPicture(jigsaw)) return choice === undefined ? '' : 'This jigsaw is ready cut: the number of pieces and the difficulty are its own.';
    if (!choice || typeof choice !== 'object') return 'Choose the number of pieces and the difficulty.';
    const c = choice as Partial<PlayChoice>;
    if (!JigsawCut.pieceChoices(jigsaw.width, jigsaw.height).some((o) => o.columns === c.columns && o.rows === c.rows)) return 'Choose one of the numbers of pieces that are offered for this picture.';
    if (!DIFFICULTIES.some((d) => d.percent === c.snapPercent)) return 'Choose the difficulty: hard, medium or easy.';
    if (c.timed !== undefined && typeof c.timed !== 'boolean') return 'Say whether the round is timed: yes or no.';
    if (c.cutShape !== undefined && !CutShapes.is(c.cutShape)) return 'Choose one of the shapes of the pieces.';
    return Plays.privateError(c.private);
  }

  /** The reason a choice of a private or public round is not allowed, or '': true (private), false or nothing (public). */
  static privateError(value: unknown): string {
    return value === undefined || typeof value === 'boolean' ? '' : 'Say whether the round is private: yes or no.';
  }

  /** The round with its privacy: private when `isPrivate` is true, public when it is false (the mark is taken away), else as it was. */
  static withPrivacy<T extends Omit<PlaySpec, 'id'>>(play: T, isPrivate: unknown): T {
    if (isPrivate === true) return { ...play, private: true as const };
    if (isPrivate === false) {
      const { private: _was, ...open } = play;
      return open as T;
    }
    return play;
  }

  /** The reason a round's own look and sound are not allowed, or '': a choice (see `PlayLooks.is`), or null (the round follows the player's preference). */
  static lookError(value: unknown): string {
    return value === null || PlayLooks.is(value) ? '' : 'Choose a table and the sound on or off, or nothing to follow your preference.';
  }

  /** The round with its own look and sound, or, for null, without any: it follows the preference of its player. */
  static withLook<T extends Omit<PlaySpec, 'id'>>(play: T, look: PlayLookSetup | null): T {
    const { look: _was, ...rest } = play;
    return (look ? { ...rest, look: PlayLooks.stored(look) } : rest) as T;
  }

  /** Whether the person who asks (`me`, the UID) may see the round: a public round by anybody, a private one by its player (an admin has a way too: `admin`). */
  static mayLookAt(play: Pick<PlaySpec, 'userId' | 'private'>, me: string | undefined, admin = false): boolean {
    return !play.private || admin || (!!me && play.userId === me);
  }

  /**
   * Starts a round of a picture with the cut and the difficulty the person chose: the picture area is made `columns * grid` wide and `rows * grid` high (`JigsawCut.layoutOf`), the picture is cut into
   * pieces, and the round is started with them (see `start`). The round keeps its cut and difficulty, and its pieces are given back to be kept under it. `error` when the choice is not allowed.
   */
  static startOwn(
    jigsaw: Pick<JigsawSpec, 'id' | 'kind' | 'width' | 'height'>,
    user: { id: string; name: string },
    choice: PlayChoice,
    now: number,
    random: () => number = Math.random,
  ): { play: Omit<PlaySpec, 'id'>; positions: PlayPositions; pieces: JigsawPiece[] } | { error: string } {
    const bad = Plays.choiceError(jigsaw, choice);
    if (bad) return { error: bad };
    const layout = JigsawCut.layoutOf(jigsaw.width, jigsaw.height, choice.columns, choice.rows);
    const shape = CutShapes.kept(choice.cutShape);
    const cutting = JigsawCut.cut(layout.width, layout.height, layout.grid, random, shape);
    if ('error' in cutting) return { error: cutting.error };
    const pieces = JigsawPieces.ofCut(cutting);
    const started = Plays.start({ id: jigsaw.id, width: layout.width, height: layout.height, gridSize: layout.grid }, user, pieces, now, random);
    if ('error' in started) return started;
    return { play: { ...started.play, cut: { columns: layout.columns, rows: layout.rows, grid: layout.grid, ...(shape ? { shape } : {}) }, snapPercent: choice.snapPercent, ...(choice.timed === false ? { timed: false as const } : {}) }, positions: started.positions, pieces };
  }

  /** The number of pieces to have chosen when the round is started: the offered one nearest to the one the person chose last time, one that is not in `avoid` (sizes already solved) if there is one; none when nothing is offered. */
  static choiceNear(options: readonly PieceChoice[], wanted: number, avoid: readonly number[] = []): PieceChoice | undefined {
    const open = options.filter((o) => !avoid.includes(o.count));
    const from = open.length ? open : options;
    return [...from].sort((a, b) => Math.abs(Math.log(a.count / wanted)) - Math.abs(Math.log(b.count / wanted)))[0];
  }

  /** The reason a user may not start a round at this size because they solved it at that size already, or '' (a number of pieces solved is not played twice, another is). Without a size (a ready jigsaw) any solved round blocks. */
  static blockedBy(rounds: readonly Pick<PlaySpec, 'status' | 'total'>[], total?: number): string {
    return rounds.some((p) => p.status === 'solved' && (total === undefined || p.total === total)) ? 'You have solved this jigsaw: it cannot be played again.' : '';
  }

  /** The reason a user may not start another round of a picture because one is going (a piece moved, not solved), or ''. A round that is only opened is replaced instead. */
  static goingError(rounds: readonly Pick<PlaySpec, 'status' | 'fresh'>[]): string {
    return rounds.some((p) => p.status !== 'solved' && !p.fresh) ? 'You have a round of this picture going: finish it or delete it to start another.' : '';
  }

  /** How many of the pieces are in their own place, of how many there are, for these positions. A piece that has no position is not in place. */
  static counts(pieces: readonly JigsawPiece[], positions: PlayPositions): { matched: number; total: number } {
    let matched = 0;
    for (const piece of pieces) {
      const at = positions[piece.id];
      if (at && JigsawPieces.matched({ col: piece.col, row: piece.row, size: piece.size, centerX: at[0], centerY: at[1] })) matched++;
    }
    return { matched, total: pieces.length };
  }

  /**
   * Starts a play: the pieces of the jigsaw are scattered over a store frame (as for a jigsaw that was just cut, see `JigsawCut.reshuffle`), and nothing is in place. The pieces are the jigsaw's (they are not changed); `error` when the jigsaw has too few pieces to play.
   */
  static start(
    jigsaw: Pick<JigsawSpec, 'id' | 'width' | 'height' | 'gridSize'>,
    user: { id: string; name: string },
    pieces: readonly JigsawPiece[],
    now: number,
    random: () => number = Math.random,
  ): { play: Omit<PlaySpec, 'id'>; positions: PlayPositions } | { error: string } {
    const shuffled = JigsawCut.reshuffle(pieces.map((p) => JigsawPieces.toPlaced(p)), jigsaw.width, jigsaw.height, jigsaw.gridSize, random);
    if ('error' in shuffled) return { error: shuffled.error };
    const positions: PlayPositions = {};
    for (const p of shuffled.placed) if (p.piece) positions[p.id] = [p.centerX, p.centerY, p.layer ?? 1];
    const { matched, total } = Plays.counts(pieces, positions);
    return {
      play: {
        jigsawId: jigsaw.id,
        userId: user.id,
        userName: user.name,
        status: matched === total ? 'solved' : 'active',
        startedAt: now,
        ...(matched === total ? { solvedAt: now } : {}),
        matched,
        total,
        storeWidth: shuffled.storeWidth,
        overrides: {},
        fresh: true,
      },
      positions,
    };
  }

  /**
   * Starts a round over: the same round (its player, its choices of look) with all the pieces scattered anew, no time played and the start time now. What the round chose is kept;
   * everything that came from playing it (the places, the time, being solved) is not.
   */
  static restart(
    play: PlaySpec,
    jigsaw: Pick<JigsawSpec, 'id' | 'width' | 'height' | 'gridSize'>,
    pieces: readonly JigsawPiece[],
    now: number,
    random: () => number = Math.random,
  ): { play: PlaySpec; positions: PlayPositions } | { error: string } {
    const started = Plays.start(jigsaw, { id: play.userId, name: play.userName }, pieces, now, random);
    if ('error' in started) return started;
    return { play: { ...started.play, id: play.id, overrides: play.overrides ?? {}, ...(play.cut ? { cut: play.cut } : {}), ...(play.snapPercent !== undefined ? { snapPercent: play.snapPercent } : {}), ...(play.timed === false ? { timed: false as const } : {}), ...(play.look ? { look: play.look } : {}) }, positions: started.positions };
  }

  /**
   * Saves where pieces were put: the positions with these moves made (a move of a piece that is not one of the jigsaw's is left out), and the play as it is then: how
   * many pieces are in place and whether it is solved (`solvedAt` is when it first was, and stays).
   */
  static moved(play: PlaySpec, pieces: readonly JigsawPiece[], positions: PlayPositions, moves: readonly PieceMove[], now: number): { play: PlaySpec; positions: PlayPositions } {
    const known = new Set(pieces.map((p) => p.id));
    const next: PlayPositions = { ...positions };
    for (const m of moves) if (known.has(m.id)) next[m.id] = [m.centerX, m.centerY, m.layer];
    const { matched, total } = Plays.counts(pieces, next);
    const solved = total > 0 && matched === total;
    const { solvedAt: _was, fresh: _fresh, ...rest } = play;
    const touched = moves.some((m) => known.has(m.id)); // the first piece that is moved makes it a round
    return {
      play: { ...rest, ...(touched ? { updatedAt: now } : play.updatedAt !== undefined ? { updatedAt: play.updatedAt } : {}), ...(play.fresh && !touched ? { fresh: true } : {}), matched, total, status: solved ? 'solved' : 'active', ...(solved ? { solvedAt: play.solvedAt ?? now } : {}) },
      positions: next,
    };
  }

  /**
   * The reason these moves would pull apart pieces that stick together, or '': two pieces that are next to each other in the picture and lie exactly where they belong in relation to each
   * other are bound, and a bond is never broken. Only pieces that are not bound to each other move on their own, so the places after the moves must keep every pair of neighbours that was bound
   * before, exactly (places are whole or half pixels).
   */
  static bondsError(pieces: readonly JigsawPiece[], before: PlayPositions, after: PlayPositions): string {
    const was = Plays.piecesOf(pieces, before);
    const now = new Map(Plays.piecesOf(pieces, after).map((p) => [p.id, p]));
    const at = new Map(was.map((p) => [`${p.col},${p.row}`, p]));
    const bound = (a: JigsawPiece, b: JigsawPiece, dc: number, dr: number) =>
      Math.abs(b.centerX - a.centerX - dc * a.size) <= STICK_TOLERANCE_PX && Math.abs(b.centerY - a.centerY - dr * a.size) <= STICK_TOLERANCE_PX;
    for (const a of was) {
      for (const [dc, dr] of [[1, 0], [0, 1]] as const) {
        const b = at.get(`${a.col + dc},${a.row + dr}`);
        if (!b || b.size !== a.size || !bound(a, b, dc, dr)) continue;
        const a2 = now.get(a.id);
        const b2 = now.get(b.id);
        if (a2 && b2 && !bound(a2, b2, dc, dr)) return 'Pieces that stick together can not be pulled apart: they move as one.';
      }
    }
    return '';
  }

  /** The pieces of the jigsaw as this play has them: where each is, on which layer, and whether it is in place. */
  static piecesOf(pieces: readonly JigsawPiece[], positions: PlayPositions): JigsawPiece[] {
    return pieces.map((p) => {
      const at = positions[p.id];
      return at ? JigsawPieces.stored({ ...p, centerX: at[0], centerY: at[1], layer: at[2] }) : p;
    });
  }

  /** When the round was last worked on: the last piece moved, else when it was solved or started (the newest rounds are those worked on last). */
  static lastActive(play: Pick<PlaySpec, 'updatedAt' | 'solvedAt' | 'startedAt'>): number {
    return play.updatedAt ?? play.solvedAt ?? play.startedAt;
  }

  /** The round as the API tells it: without the login that started it (`protected` says there was one). */
  static publicOf(play: PlaySpec): PlaySpec {
    const { logonUid, ...open } = play;
    return logonUid ? { ...open, protected: true } : open;
  }

  /** The round marked with the login that is playing it (a login of the account it is played by), for later use; unchanged when the login is not one of the account's. */
  static marked(play: Omit<PlaySpec, 'id'>, user: { firebaseUids?: unknown }, logonUid: string | undefined): Omit<PlaySpec, 'id'> {
    return logonUid && JigsawUsers.requiresLogon(user) && JigsawUsers.mayAct(user, logonUid) ? { ...play, logonUid } : play;
  }

  /** The reason a time played is not allowed, or ''. */
  static elapsedError(value: unknown): string {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > PLAY_MAX_ELAPSED_MS) return 'The time played must be a whole number of milliseconds, at most a month.';
    return '';
  }

  /** The play with this time played: the time only grows (a page that was left open in another tab, or a late request, never takes time away). */
  static withElapsed(play: PlaySpec, elapsedMs: number): PlaySpec {
    return { ...play, elapsedMs: Math.max(play.elapsedMs ?? 0, elapsedMs) };
  }

  /** The reason a list of moves is not allowed, or ''. */
  static movesError(moves: unknown): string {
    if (!Array.isArray(moves)) return 'Send the moves as a list.';
    if (moves.length > JIGSAW_MAX_PIECES) return `At most ${JIGSAW_MAX_PIECES} pieces fit in a jigsaw.`;
    for (const move of moves) {
      const error = JigsawPieces.moveError(move);
      if (error) return error;
    }
    return '';
  }

  /** The play as it is stored: only the known fields. */
  static stored(play: Omit<PlaySpec, 'id'>): Omit<PlaySpec, 'id'> {
    return {
      ...(typeof play.logonUid === 'string' && play.logonUid ? { logonUid: play.logonUid } : {}),
      jigsawId: play.jigsawId,
      userId: play.userId,
      userName: typeof play.userName === 'string' ? play.userName : '', // a game from before the name was kept has none
      status: play.status,
      startedAt: play.startedAt,
      ...(play.solvedAt !== undefined ? { solvedAt: play.solvedAt } : {}),
      ...(typeof play.updatedAt === 'number' ? { updatedAt: play.updatedAt } : {}),
      matched: play.matched,
      total: play.total,
      storeWidth: play.storeWidth,
      ...(play.fresh ? { fresh: true } : {}),
      ...(play.cut ? { cut: { columns: play.cut.columns, rows: play.cut.rows, grid: play.cut.grid, ...(CutShapes.kept(play.cut.shape) ? { shape: play.cut.shape } : {}) } } : {}),
      ...(typeof play.snapPercent === 'number' ? { snapPercent: play.snapPercent } : {}),
      ...(play.timed === false ? { timed: false as const } : {}),
      ...(play.private ? { private: true as const } : {}),
      ...(PlayLooks.is(play.look) ? { look: PlayLooks.stored(play.look) } : {}),
      ...(typeof play.elapsedMs === 'number' && play.elapsedMs > 0 ? { elapsedMs: play.elapsedMs } : {}),
      overrides: Object.fromEntries(PLAY_OVERRIDE_KEYS.filter((k) => play.overrides?.[k] !== undefined).map((k) => [k, play.overrides[k]])) as PlayOverrides,
    };
  }

  /** The positions as they are kept in the database: one string (it is one value, not a thousand fields that would each be indexed). */
  static positionsToText(positions: PlayPositions): string {
    return JSON.stringify(positions);
  }

  static positionsFromText(text: unknown): PlayPositions {
    try {
      const value = JSON.parse(typeof text === 'string' ? text : '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? (value as PlayPositions) : {};
    } catch {
      return {};
    }
  }
}

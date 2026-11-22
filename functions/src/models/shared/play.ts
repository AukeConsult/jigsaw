import { JigsawSettings, JigsawSpec } from './jigsaw-settings';
import { JigsawCut, JigsawPiece, JigsawPieces, PieceMove, JIGSAW_MAX_PIECES } from './jigsaw';

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

/** The settings a play may choose for itself: the look (the line and the colours). Nothing else, ever (see `Plays.overridesError`). */
export const PLAY_OVERRIDE_KEYS = ['lineWidth', 'lineColor', 'backColor'] as const;
export type PlayOverrideKey = (typeof PLAY_OVERRIDE_KEYS)[number];
export type PlayOverrides = Partial<Pick<JigsawSpec, PlayOverrideKey>>;
/** What a request that changes the settings of a play says: a value sets that setting for the play, null takes the choice away (the jigsaw's default is used again). */
export type PlayOverridesChange = { [K in PlayOverrideKey]?: NonNullable<JigsawSpec[K]> | null };

export type PlayStatus = 'active' | 'solved';

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
  /** the round is made but nobody has moved a piece yet (looking at it and going back does not make a round): it is not listed, and not counted as played, until the first piece is moved */
  fresh?: boolean;
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
    if (typeof value !== 'string' || !/^[A-Za-z0-9_.:-]+$/.test(value) || value.length > PLAY_MAX_USER_ID) return 'A play needs the id of its user (letters, digits and _ . : -).';
    return '';
  }

  /** The reason a change of the settings of a play is not allowed, or ''. Only the look can be chosen; anything else (the difficulty, the size, the picture, the pieces) is refused. */
  static overridesError(value: unknown): string {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 'Send the settings as an object.';
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (!(PLAY_OVERRIDE_KEYS as readonly string[]).includes(key)) return `A play can not change "${key}": only the look (the line and the colours) can be chosen for a play.`;
      if (v === null) continue;
      if (key === 'lineWidth' && !(typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= JigsawSettings.MAX_LINE_WIDTH)) return `The line must be a whole number of pixels from 0 to ${JigsawSettings.MAX_LINE_WIDTH}.`;
      if ((key === 'lineColor' || key === 'backColor') && !(typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v))) return `The ${key === 'lineColor' ? 'line' : 'background'} colour must be written as #rrggbb.`;
    }
    return '';
  }

  /** The settings of a play after a change that was checked (`overridesError` is ''): a value is set, null takes the choice away. */
  static changed(overrides: PlayOverrides, change: PlayOverridesChange): PlayOverrides {
    const next: Record<string, unknown> = { ...overrides };
    for (const [key, v] of Object.entries(change)) {
      if (v === null) delete next[key];
      else if (v !== undefined) next[key] = typeof v === 'string' ? v.toLowerCase() : v;
    }
    return next as PlayOverrides;
  }

  /** The settings a play is played with. */
  static effective(jigsaw: Pick<JigsawSpec, PlayOverrideKey | 'snapPercent'>, play: Pick<PlaySpec, 'overrides'>): PlaySettings {
    const own = play.overrides;
    return {
      snapPercent: jigsaw.snapPercent ?? JigsawSettings.DEFAULT_SNAP_PERCENT, // the difficulty is the jigsaw's
      lineWidth: own.lineWidth ?? jigsaw.lineWidth ?? JigsawSettings.DEFAULT_LINE_WIDTH,
      lineColor: own.lineColor ?? jigsaw.lineColor ?? JigsawSettings.DEFAULT_LINE_COLOR,
      backColor: own.backColor ?? jigsaw.backColor ?? JigsawSettings.DEFAULT_BACK_COLOR,
    };
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

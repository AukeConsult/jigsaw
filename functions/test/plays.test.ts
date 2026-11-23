import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import type { PieceStore } from "../src/jigsaw/jigsaw-pieces";
import { memoryPlays, memoryUsers } from "./memory-plays";
import { JigsawSettings, JigsawCut, JigsawPiece, JigsawPieces, JigsawUsers, PlayPositions, PlaySpec, Plays } from "../src/models";
import type { JigsawSpec } from "../src/models";

// ---- the stores in memory: what Firestore and Storage are in the app ----

function memoryJigsaws(): JigsawStore {
  const items: JigsawSpec[] = [];
  return {
    async list() {
      return [...items].reverse();
    },
    async add(input) {
      const saved = { id: `jig${items.length + 1}`, ...input, createdAt: items.length + 1 };
      items.push(saved);
      return saved;
    },
    async remove(id) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return false;
      items.splice(i, 1);
      return true;
    },
    async update(id, input) {
      const i = items.findIndex((x) => x.id === id);
      if (i < 0) return null;
      items[i] = { ...input, id, createdAt: items[i].createdAt };
      return items[i];
    },
  };
}

function memoryPieces(): PieceStore {
  const docs = new Map<string, JigsawPiece[]>();
  return {
    async list(id) {
      return [...(docs.get(id) ?? [])].sort((a, b) => a.number - b.number);
    },
    async replaceAll(id, pieces) {
      docs.set(id, pieces);
      return true;
    },
    async move() {
      return true;
    },
    async graphic() {
      return null;
    },
    async removeAll(id) {
      docs.delete(id);
    },
  };
}

/** requests as the user anna: changing or deleting a round needs the header that says whose it is */
const anna = (app: Parameters<typeof request>[0]) => request.agent(app).set("X-Jigsaw-User", "anna");

/** a jigsaw of 4 × 3 pieces with its pieces, in an app with memory stores */
/** A round as a player really makes one: it is started, and then a piece is moved (a round nobody has moved a piece in is not a round yet: it is not listed). */
async function started(app: Parameters<typeof request>[0], jigsawId: string, body: { userId: string; [key: string]: unknown }): Promise<PlaySpec> {
  const play = (await request(app).post(`/jigsaw/api/jigsaw/${jigsawId}/plays`).send(body)).body as PlaySpec;
  const detail = (await request(app).get(`/jigsaw/api/jigsaw/${jigsawId}/plays/${play.id}`)).body as { pieces: JigsawPiece[] };
  const first = detail.pieces[0];
  await request(app).patch(`/jigsaw/api/jigsaw/${jigsawId}/plays/${play.id}/positions`).set("X-Jigsaw-User", body.userId).send({ moves: [{ id: first.id, centerX: first.centerX, centerY: first.centerY, layer: first.layer }] });
  return (await request(app).get(`/jigsaw/api/jigsaw/${jigsawId}/plays/${play.id}`)).body.play as PlaySpec;
}

async function setup() {
  const jigsaws = memoryJigsaws();
  const pieces = memoryPieces();
  const plays = memoryPlays();
  let time = 1000;
  const app = createJigsawApp({ jigsaw: jigsaws, jigsawPieces: pieces, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna", "bo") });
  const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
  if ("error" in cut) throw new Error(cut.error);
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: cut.storeWidth, snapPercent: 25, lineWidth: 1, lineColor: "#212529", backColor: "#ffffff" };
  const made = (await request(app).post("/jigsaw/api/jigsaw").send(settings)).body as JigsawSpec;
  await pieces.replaceAll(made.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
  return { app, jigsaws, pieces, plays, made, settings, cut, tick: () => (time += 1000) };
}

const piece = (col: number, row: number, extra: Partial<JigsawPiece> = {}): JigsawPiece => ({ id: `piece-${col}-${row}`, number: row * 4 + col + 1, col, row, top: 0, right: 0, bottom: 0, left: 0, size: 50, centerX: 0, centerY: 0, layer: 1, matched: false, ...extra });

describe("what a play can choose", () => {
  it("is only the difficulty and the look: anything about the size, the picture or the pieces is refused", () => {
    for (const key of ["snapPercent", "width", "height", "gridSize", "storeWidth", "name", "author", "pictureName", "picture", "placed", "pieces", "frameWidth", "gridVisible"]) {
      expect(Plays.overridesError({ [key]: 1 })).toContain("can not change");
    }
    expect(Plays.overridesError({ lineWidth: 3, lineColor: "#aabbcc", backColor: "#112233" })).toBe("");
    expect(Plays.overridesError({ lineWidth: null, backColor: null })).toBe("");
  });

  it("is checked: the difficulty 0 to 100, the line 0 to 6, colours as #rrggbb", () => {
    for (const bad of [{ lineWidth: 7 }, { lineWidth: "2" }, { lineColor: "red" }, { backColor: "#fff" }]) expect(Plays.overridesError(bad)).not.toBe("");
    for (const bad of [null, "x", [], 5]) expect(Plays.overridesError(bad)).toContain("object");
  });

  it("is the play's own choice, else the jigsaw's, else the model's", () => {
    const jigsaw = { snapPercent: 10, lineWidth: undefined, lineColor: "#000000", backColor: undefined };
    expect(Plays.effective(jigsaw, { overrides: {} })).toEqual({ snapPercent: 10, lineWidth: JigsawSettings.DEFAULT_LINE_WIDTH, lineColor: "#000000", backColor: JigsawSettings.DEFAULT_BACK_COLOR });
    expect(Plays.effective(jigsaw, { overrides: { lineColor: "#ffffff" } })).toMatchObject({ snapPercent: 10, lineColor: "#ffffff" }); // the difficulty is the jigsaw's
    expect(Plays.changed({ lineColor: "#112233", lineWidth: 2 }, { lineColor: null, backColor: "#AABBCC" })).toEqual({ lineWidth: 2, backColor: "#aabbcc" });
  });
});

describe("the moves of a play", () => {
  const pieces = [piece(0, 0), piece(1, 0)];
  const play: PlaySpec = { id: "p", jigsawId: "j", userId: "u", userName: "U", status: "active", startedAt: 1, matched: 0, total: 2, storeWidth: 100, overrides: {} };

  it("keep when a piece was last moved, and the round worked on last comes first", () => {
    const moved = Plays.moved(play, pieces, {}, [{ id: "piece-0-0", centerX: 25, centerY: 25, layer: 1 }], 500);
    expect(moved.play.updatedAt).toBe(500);
    expect(Plays.moved(moved.play, pieces, moved.positions, [], 900).play.updatedAt).toBe(500); // nothing moved: it stays
    expect(Plays.stored(moved.play).updatedAt).toBe(500);
    expect(Plays.lastActive(play)).toBe(1); // a round from before it: when it was started
    expect(Plays.lastActive(moved.play)).toBe(500);
    expect(Plays.lastActive({ startedAt: 1, solvedAt: 700 })).toBe(700);
  });

  it("count the pieces that are in their own place, and the game is solved when all are, from then on", () => {
    const half = Plays.moved(play, pieces, {}, [{ id: "piece-0-0", centerX: 25, centerY: 25, layer: 1 }], 500);
    expect(half.play).toMatchObject({ matched: 1, total: 2, status: "active" });
    expect("solvedAt" in half.play).toBe(false);
    const done = Plays.moved(half.play, pieces, half.positions, [{ id: "piece-1-0", centerX: 75, centerY: 25, layer: 1 }], 600);
    expect(done.play).toMatchObject({ matched: 2, status: "solved", solvedAt: 600 });
    const again = Plays.moved(done.play, pieces, done.positions, [{ id: "piece-1-0", centerX: 75, centerY: 25, layer: 2 }], 900);
    expect(again.play.solvedAt).toBe(600);
    const undone = Plays.moved(done.play, pieces, done.positions, [{ id: "piece-1-0", centerX: 300, centerY: 25, layer: 2 }], 950);
    expect(undone.play).toMatchObject({ matched: 1, status: "active" });
    expect("solvedAt" in undone.play).toBe(false);
  });

  it("leave out a piece that is not the jigsaw's", () => {
    const moved = Plays.moved(play, pieces, {}, [{ id: "piece-9-9", centerX: 25, centerY: 25, layer: 1 }], 1);
    expect(moved.positions).toEqual({});
  });
});

describe("the plays of a jigsaw", () => {
  it("starts a play for a user: the pieces scattered, nothing in place, the difficulty copied from the jigsaw", async () => {
    const { app, made, plays } = await setup();
    const res = await request(app).post(`/jigsaw/api/jigsaw/${made.id}/plays`).send({ userId: "anna" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ jigsawId: made.id, userId: "anna", userName: "Anna", status: "active", matched: 0, total: 12, overrides: {} });
    expect(plays.all.get(made.id)!.size).toBe(1);
    const got = await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays/${res.body.id}`);
    expect(got.status).toBe(200);
    expect(got.body.pieces).toHaveLength(12);
    expect(got.body.settings).toEqual({ snapPercent: 25, lineWidth: 1, lineColor: "#212529", backColor: "#ffffff" });
  });

  it("is kept by the UID of the user, with the user's name as it was when the game started", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna", userName: "Somebody else" }));
    expect(play.userId).toBe("anna");
    expect(play.userName).toBe("Anna"); // the name comes from the user, not from the request
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays?userId=anna`)).body[0]).toMatchObject({ userId: "anna", userName: "Anna" });
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays?userId=Anna`)).body).toEqual([]); // the UID, not a spelling of the name
    expect(Plays.stored({ ...play, userName: undefined as unknown as string }).userName).toBe(""); // a game from before the name was kept
  });

  it("lets many users play the same jigsaw many times, each with their own positions", async () => {
    const { app, made, tick } = await setup();
    const start = async (userId: string) => (await started(app, made.id, { userId }));
    void tick;
    const a1 = await start("anna");
    const a2 = await start("anna");
    const b1 = await start("bo");
    expect(new Set([a1.id, a2.id, b1.id]).size).toBe(3);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays?userId=anna`)).body).toHaveLength(2);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays?userId=bo`)).body).toHaveLength(1);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays`)).body).toHaveLength(3);
    await anna(app).patch(`/jigsaw/api/jigsaw/${made.id}/plays/${a1.id}/positions`).send({ moves: [{ id: "piece-0-0", centerX: 25, centerY: 25, layer: 5 }] });
    const mine = (await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays/${a1.id}`)).body.pieces.find((p: JigsawPiece) => p.id === "piece-0-0");
    const theirs = (await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays/${b1.id}`)).body.pieces.find((p: JigsawPiece) => p.id === "piece-0-0");
    expect([mine.centerX, mine.centerY, mine.layer, mine.matched]).toEqual([25, 25, 5, true]);
    expect(theirs.matched).toBe(false);
  });

  it("checks the user and the jigsaw", async () => {
    const { app, made } = await setup();
    for (const userId of [undefined, "", "a b", "x".repeat(129), 5]) expect((await request(app).post(`/jigsaw/api/jigsaw/${made.id}/plays`).send({ userId })).status).toBe(400);
    expect((await request(app).post(`/jigsaw/api/jigsaw/nothing/plays`).send({ userId: "anna" })).status).toBe(404);
    const stranger = await request(app).post(`/jigsaw/api/jigsaw/${made.id}/plays`).send({ userId: "nobody" });
    expect(stranger.status).toBe(404); // a play is played by a user that exists
    expect(stranger.body.error).toContain("No such user");
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays/nothing`)).status).toBe(404);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays?userId=a%20b`)).status).toBe(400);
  });

  it("will not start a play of a jigsaw that has no pieces", async () => {
    const { app, pieces, made } = await setup();
    await pieces.removeAll(made.id);
    expect((await request(app).post(`/jigsaw/api/jigsaw/${made.id}/plays`).send({ userId: "anna" })).status).toBe(409);
  });

  it("keeps the settings a play chooses to that play, and refuses anything about size, picture or pieces", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    const other = (await started(app, made.id, { userId: "bo" }));
    const url = (p: PlaySpec) => `/jigsaw/api/jigsaw/${made.id}/plays/${p.id}/settings`;
    const set = await anna(app).patch(url(play)).send({ overrides: { lineWidth: 3, backColor: "#AABBCC" } });
    expect(set.status).toBe(200);
    expect(set.body.settings).toMatchObject({ snapPercent: 25, backColor: "#aabbcc", lineWidth: 3 });
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays/${other.id}`)).body.settings).toMatchObject({ snapPercent: 25, backColor: "#ffffff" });
    const back = await anna(app).patch(url(play)).send({ overrides: { backColor: null } });
    expect(back.body.settings.backColor).toBe("#ffffff");
    for (const bad of [{ width: 500 }, { gridSize: 10 }, { picture: "x" }, { pieces: [] }, { snapPercent: 40 }]) { // the difficulty is not a choice of a round
      expect((await anna(app).patch(url(play)).send({ overrides: bad })).status).toBe(400);
    }
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}`)).status).toBeLessThan(500);
  });

  it("lets only the owner take away all the rounds, which makes the jigsaw editable again", async () => {
    const { app, pieces, cut, settings } = await setup();
    const owned = (await request(app).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid: "anna" })).body as JigsawSpec;
    await pieces.replaceAll(owned.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
    await started(app, owned.id, { userId: "anna" });
    await started(app, owned.id, { userId: "bo" });
    expect((await request(app).put(`/jigsaw/api/jigsaw/${owned.id}`).set("X-Jigsaw-User", "anna").send({ ...settings, ownerUid: "anna", snapPercent: 40 })).status).toBe(409);
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${owned.id}/plays`).set("X-Jigsaw-User", "bo")).status).toBe(403); // not the owner
    expect((await request(app).get(`/jigsaw/api/jigsaw/${owned.id}/plays`)).body).toHaveLength(2);
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${owned.id}/plays`).set("X-Jigsaw-User", "anna")).status).toBe(204);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${owned.id}/plays`)).body).toEqual([]);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${owned.id}/plays/summary`)).body).toEqual({ played: false });
    expect((await request(app).put(`/jigsaw/api/jigsaw/${owned.id}`).set("X-Jigsaw-User", "anna").send({ ...settings, ownerUid: "anna", snapPercent: 40 })).status).toBe(200); // the difficulty can be changed again
    expect((await request(app).delete("/jigsaw/api/jigsaw/nothere/plays").set("X-Jigsaw-User", "anna")).status).toBe(404);
  });

  it("has the difficulty of the jigsaw (fixed once it is played) and follows its look until the play chooses its own", async () => {
    const { app, made, settings } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, snapPercent: 40 })).status).toBe(409);
    await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, backColor: "#000000" });
    const got = (await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays/${play.id}`)).body;
    expect(got.settings).toMatchObject({ snapPercent: 25, backColor: "#000000" });
  });

  it("solves the game when every piece is in place", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    const moves = Array.from({ length: 12 }, (_, i) => ({ id: `piece-${i % 4}-${Math.floor(i / 4)}`, centerX: (i % 4) * 50 + 25, centerY: Math.floor(i / 4) * 50 + 25, layer: i + 1 }));
    const res = await anna(app).patch(`/jigsaw/api/jigsaw/${made.id}/plays/${play.id}/positions`).send({ moves });
    expect(res.body).toMatchObject({ moved: 12, matched: 12, total: 12, status: "solved" });
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays?userId=anna`)).body[0]).toMatchObject({ status: "solved" });
    expect((await anna(app).patch(`/jigsaw/api/jigsaw/${made.id}/plays/${play.id}/positions`).send({ moves: [{ id: "piece-0-0", centerX: -5, centerY: 1, layer: 1 }] })).status).toBe(400);
    expect((await anna(app).patch(`/jigsaw/api/jigsaw/${made.id}/plays/${play.id}/positions`).send({ moves: "x" })).status).toBe(400);
  });

  it("keeps how wide the store of a game has grown to, with the positions", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    const url = `/jigsaw/api/jigsaw/${made.id}/plays/${play.id}`;
    expect((await anna(app).patch(`${url}/positions`).send({ moves: [], storeWidth: 640 })).status).toBe(200);
    expect((await request(app).get(`${url}`)).body.play.storeWidth).toBe(640);
    for (const bad of [-1, 1.5, "3", 100000]) expect((await anna(app).patch(`${url}/positions`).send({ moves: [], storeWidth: bad })).status).toBe(400);
  });

  it("tells whether anyone has played the jigsaw: only once a piece has been moved", async () => {
    const { app, made } = await setup();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: false });
    const opened = (await request(app).post(url).send({ userId: "anna" })).body as PlaySpec;
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: false }); // only opened: not played
    const play = await started(app, made.id, { userId: "anna" });
    expect(play.id).toBe(opened.id); // the round that was only opened is the one that is played
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: true });
    await anna(app).delete(`${url}/${play.id}`);
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: false });
    expect((await request(app).get("/jigsaw/api/jigsaw/nothing/plays/summary")).status).toBe(404);
  });

  it("does not make a round by opening the jigsaw: the round is not listed, and opening again does not make another, until a piece is moved", async () => {
    const { app, made } = await setup();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    const first = (await request(app).post(url).send({ userId: "anna" })).body as PlaySpec;
    const again = await request(app).post(url).send({ userId: "anna" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.id);
    expect((await request(app).get(url)).body).toEqual([]);
    expect((await request(app).get("/jigsaw/api/jigsaw-users/anna/plays")).body).toEqual([]);
    expect((await request(app).get(`${url}/${first.id}`)).status).toBe(200); // it can still be opened
    await anna(app).patch(`${url}/${first.id}/positions`).send({ moves: [] }); // nothing moved: still nothing
    expect((await request(app).get(url)).body).toEqual([]);
    const played = await started(app, made.id, { userId: "anna" });
    expect(played.fresh).toBeUndefined();
    expect((await request(app).get(url)).body).toHaveLength(1);
    expect((await request(app).post(url).send({ userId: "anna" })).status).toBe(201); // a new round after one that is played
    expect((await request(app).get(url)).body).toHaveLength(1); // that one is only opened
  });

  it("takes the rounds that are only opened away when the size of a jigsaw that has not been played is changed", async () => {
    const { app, made, plays } = await setup();
    const opened = (await request(app).post(`/jigsaw/api/jigsaw/${made.id}/plays`).send({ userId: "anna" })).body as PlaySpec;
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...made, width: 250 })).status).toBe(200);
    expect(await plays.get(made.id, opened.id)).toBeNull();
  });

  it("deletes one play and leaves the others", async () => {
    const { app, made } = await setup();
    const a = (await started(app, made.id, { userId: "anna" }));
    await started(app, made.id, { userId: "anna" });
    expect((await anna(app).delete(`/jigsaw/api/jigsaw/${made.id}/plays/${a.id}`)).status).toBe(204);
    expect((await anna(app).delete(`/jigsaw/api/jigsaw/${made.id}/plays/${a.id}`)).status).toBe(404);
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays`)).body).toHaveLength(1);
  });
});

describe("the time a round has been played", () => {
  it("is kept with the round, and only grows", async () => {
    const { app, made } = await setup();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    const play = await started(app, made.id, { userId: "anna" });
    expect(play.elapsedMs).toBeUndefined(); // the clock has not run yet
    const send = (elapsedMs: unknown) => anna(app).patch(`${url}/${play.id}/positions`).send({ moves: [], elapsedMs });
    expect((await send(12_000)).status).toBe(200);
    expect(((await request(app).get(`${url}/${play.id}`)).body.play as PlaySpec).elapsedMs).toBe(12_000);
    expect((await send(5_000)).status).toBe(200); // a late request does not take time away
    expect(((await request(app).get(`${url}/${play.id}`)).body.play as PlaySpec).elapsedMs).toBe(12_000);
    expect((await send(30_500)).status).toBe(200);
    expect(((await request(app).get(url)).body as PlaySpec[])[0].elapsedMs).toBe(30_500); // it is in the list of rounds
  });

  it("is a whole number of milliseconds, not more than a month, and only its player sets it", async () => {
    const { app, made } = await setup();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    const play = await started(app, made.id, { userId: "anna" });
    for (const bad of [-1, 1.5, "10", null, 31 * 24 * 3600 * 1000]) {
      expect((await anna(app).patch(`${url}/${play.id}/positions`).send({ moves: [], elapsedMs: bad })).status).toBe(400);
    }
    expect((await request(app).patch(`${url}/${play.id}/positions`).set("X-Jigsaw-User", "bo").send({ moves: [], elapsedMs: 5000 })).status).toBe(403);
  });
});

describe("a timed jigsaw", () => {
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [] };

  it("is timed unless it says it is not, and only knows yes and no", async () => {
    const app = createJigsawApp({ jigsaw: memoryJigsaws(), users: memoryUsers("anna"), plays: memoryPlays() });
    const timed = (await request(app).post("/jigsaw/api/jigsaw").send(settings)).body as JigsawSpec;
    expect(timed.timed).toBeUndefined(); // no word: timed
    const untimed = (await request(app).post("/jigsaw/api/jigsaw").send({ ...settings, timed: false })).body as JigsawSpec;
    expect(untimed.timed).toBe(false);
    expect((await request(app).post("/jigsaw/api/jigsaw").send({ ...settings, timed: "no" })).status).toBe(400);
    const back = (await request(app).put(`/jigsaw/api/jigsaw/${untimed.id}`).send({ ...settings, timed: true })).body as JigsawSpec;
    expect(back.timed).toBeUndefined(); // timed again: stored as none says
    expect(((await request(app).get("/jigsaw/api/jigsaw")).body as JigsawSpec[]).map((c) => c.timed)).toEqual([undefined, undefined]);
  });
});

describe("who sees a jigsaw", () => {
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [] };
  const app = () => createJigsawApp({ jigsaw: memoryJigsaws(), users: memoryUsers("anna", "bob"), plays: memoryPlays() });

  it("lists a jigsaw its owner keeps to themselves for the owner only; the others are listed for everyone", async () => {
    const a = app();
    await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, name: "Open", ownerUid: "anna" });
    await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, name: "Private", ownerUid: "anna", visibility: "owner" });
    await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, name: "Old" }); // from before owners: for everyone
    const names = async (who?: string) => ((await (who === undefined ? request(a).get("/jigsaw/api/jigsaw") : request(a).get("/jigsaw/api/jigsaw").set("X-Jigsaw-User", who))).body as JigsawSpec[]).map((c) => c.name).sort();
    expect(await names("anna")).toEqual(["Old", "Open", "Private"]);
    expect(await names("bob")).toEqual(["Old", "Open"]);
    expect(await names()).toEqual(["Old", "Open"]);
  });

  it("needs an owner to be private, only knows the two choices, and is changed by the owner only", async () => {
    const a = app();
    expect((await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, visibility: "owner" })).status).toBe(400);
    expect((await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid: "anna", visibility: "nobody" })).status).toBe(400);
    const made = (await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid: "anna", visibility: "owner" })).body as JigsawSpec;
    expect(made.visibility).toBe("owner");
    expect((await request(a).put(`/jigsaw/api/jigsaw/${made.id}`).set("X-Jigsaw-User", "bob").send({ ...settings, ownerUid: "anna", visibility: "everyone" })).status).toBe(404);
    const opened = await request(a).put(`/jigsaw/api/jigsaw/${made.id}`).set("X-Jigsaw-User", "anna").send({ ...settings, ownerUid: "anna", visibility: "everyone" });
    expect(opened.status).toBe(200);
    expect(opened.body.visibility).toBeUndefined();
    expect((await request(a).get("/jigsaw/api/jigsaw")).body).toHaveLength(1);
  });
});

describe("deleting a jigsaw", () => {
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [] };
  const app = () => createJigsawApp({ jigsaw: memoryJigsaws(), users: memoryUsers("anna", "bob"), plays: memoryPlays() });

  it("can be done by the owner only, when the jigsaw has an owner", async () => {
    const a = app();
    const made = (await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid: "anna" })).body as JigsawSpec;
    for (const who of ["bob", "", undefined]) {
      const res = await (who === undefined ? request(a).delete(`/jigsaw/api/jigsaw/${made.id}`) : request(a).delete(`/jigsaw/api/jigsaw/${made.id}`).set("X-Jigsaw-User", who));
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Only the owner");
    }
    expect((await request(a).get("/jigsaw/api/jigsaw")).body).toHaveLength(1);
    expect((await request(a).delete(`/jigsaw/api/jigsaw/${made.id}`).set("X-Jigsaw-User", "anna")).status).toBe(204);
    expect((await request(a).get("/jigsaw/api/jigsaw")).body).toHaveLength(0);
  });

  it("can be done by anyone when the jigsaw has no owner (one from before owners)", async () => {
    const a = app();
    const made = (await request(a).post("/jigsaw/api/jigsaw").send(settings)).body as JigsawSpec;
    expect((await request(a).delete(`/jigsaw/api/jigsaw/${made.id}`)).status).toBe(204);
    expect((await request(a).delete(`/jigsaw/api/jigsaw/nothing`)).status).toBe(404);
  });
});

describe("the games of a user", () => {
  it("are listed over all the jigsaws, newest first, with the jigsaw each is a game of, and only the user's own", async () => {
    const { app, made, pieces, cut, settings } = await setup();
    const second = (await request(app).post("/jigsaw/api/jigsaw").send({ ...settings, name: "Second" })).body as JigsawSpec;
    await pieces.replaceAll(second.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
    const start = async (jigsawId: string, userId: string) => (await started(app, jigsawId, { userId }));
    const first = await start(made.id, "anna");
    await new Promise((r) => setTimeout(r, 5));
    const later = await start(second.id, "anna");
    await start(made.id, "bo");
    const res = await request(app).get("/jigsaw/api/jigsaw-users/anna/plays");
    expect(res.status).toBe(200);
    expect(res.body.map((g: { play: PlaySpec; jigsaw: { id: string; name: string } }) => [g.play.id, g.jigsaw.name])).toEqual([[later.id, "Second"], [first.id, "Harbour"]]);
    for (const g of res.body) expect(g.play.userId).toBe("anna");
    expect((await request(app).get("/jigsaw/api/jigsaw-users/bo/plays")).body).toHaveLength(1);
    expect((await request(app).get("/jigsaw/api/jigsaw-users/nobody/plays")).status).toBe(404);
    expect((await request(app).get("/jigsaw/api/jigsaw-users/a b/plays")).status).toBe(400);
  });
});

describe("rounds of other players", () => {
  it("can be looked at by anyone, and listed with the others, but never changed or deleted by another user", async () => {
    const { app, made } = await setup();
    const hers = (await started(app, made.id, { userId: "anna" }));
    const url = `/jigsaw/api/jigsaw/${made.id}/plays/${hers.id}`;
    expect((await request(app).get(`/jigsaw/api/jigsaw/${made.id}/plays`)).body).toHaveLength(1); // everyone's rounds are listed
    const look = await request(app).get(url); // and can be looked at, with the pieces where she put them
    expect(look.status).toBe(200);
    expect(look.body.play.userName).toBe("Anna");
    const move = { moves: [{ id: "piece-0-0", centerX: 25, centerY: 25, layer: 5 }] };
    for (const who of ["bo", "", undefined]) {
      const agent = (r: request.Test) => (who === undefined ? r : r.set("X-Jigsaw-User", who));
      for (const res of [
        await agent(request(app).patch(`${url}/positions`).send(move)),
        await agent(request(app).patch(`${url}/settings`).send({ overrides: { lineWidth: 3 } })),
        await agent(request(app).delete(url)),
      ]) {
        expect(res.status).toBe(403);
        expect(res.body.error).toContain("belongs to someone else");
      }
    }
    const after = (await request(app).get(url)).body;
    expect(after.play.matched).toBe(0);
    expect(after.settings.snapPercent).toBe(25);
    expect((await anna(app).patch(`${url}/positions`).send(move)).status).toBe(200); // the player can
    expect((await request(app).patch(`/jigsaw/api/jigsaw/${made.id}/plays/nothing/positions`).send(move)).status).toBe(404); // no such round: not a 403
    expect((await anna(app).delete(url)).status).toBe(204);
  });
});

describe("a jigsaw that has been played", () => {
  it("keeps its size, grid, pieces, difficulty and clock: a change of them is refused, while the name and the look can still change", async () => {
    const { app, made, settings } = await setup();
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, width: 250 })).status).toBe(200); // not played yet
    await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send(settings);
    await started(app, made.id, { userId: "anna" });
    for (const change of [{ width: 250 }, { height: 100 }, { gridSize: 25 }, { snapPercent: 40 }, { snapPercent: 10 }, { timed: false }]) {
      const res = await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, ...change });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("has been played");
    }
    const renamed = await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, name: "Harbour 2", description: "A day at the harbour", lineColor: "#ff0000" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Harbour 2", description: "A day at the harbour", snapPercent: 25, lineColor: "#ff0000" });
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, timed: true })).status).toBe(200); // timed says what none says: not a change
  });

  it("keeps the width of its store too, and what the players share is not changed by the owner or by anyone else with its address", async () => {
    const { app, made, settings, cut } = await setup();
    await started(app, made.id, { userId: "anna" });
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, storeWidth: cut.storeWidth + 50 })).status).toBe(409);
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, storeWidth: 0 })).status).toBe(409);
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).set("X-Jigsaw-User", "bob").send({ ...settings, width: 250 })).status).toBe(409); // also somebody who has no round
  });

  it("can be made without a clock before the first round, and then keeps that: the clock cannot be turned on", async () => {
    const { app, made, settings } = await setup();
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, timed: false })).status).toBe(200);
    await started(app, made.id, { userId: "anna" });
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, timed: true })).status).toBe(409);
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.id}`).send({ ...settings, timed: false, name: "Quiet harbour" })).status).toBe(200);
  });

  it("keeps its picture and its cut too: they cannot be put in again, while before the first round they can", async () => {
    const { app, made } = await setup();
    const picture = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20)]);
    const putPieces = () => request(app).put(`/jigsaw/api/jigsaw-pieces/${made.id}`).send({ pieces: [] });
    expect((await putPieces()).status).not.toBe(409); // not played yet
    await started(app, made.id, { userId: "anna" });
    expect((await putPieces()).status).toBe(409);
    const image = await request(app).put(`/jigsaw/api/jigsaw-image/${made.id}`).set("Content-Type", "image/jpeg").send(picture);
    expect(image.status).toBe(409);
    expect(image.body.error).toContain("picture");
    // taken away or moved: not either (every route that changes the picture or the pieces says the same)
    for (const res of [
      await request(app).delete(`/jigsaw/api/jigsaw-pieces/${made.id}`),
      await request(app).delete(`/jigsaw/api/jigsaw-image/${made.id}`),
      await request(app).patch(`/jigsaw/api/jigsaw-pieces/${made.id}`).send({ moves: [] }),
    ]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toBe(JigsawSettings.PLAYED_MESSAGE);
    }
  });

  it("is kept by the owner rule first: somebody else is told it is not theirs, not that it was played", async () => {
    const jigsaws = memoryJigsaws();
    const plays = memoryPlays();
    const a = createJigsawApp({ jigsaw: jigsaws, jigsawPieces: memoryPieces(), jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna", "bo") });
    const made = (await request(a).post("/jigsaw/api/jigsaw").send({ name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], ownerUid: "anna" })).body as JigsawSpec;
    await plays.create(made.id, { jigsawId: made.id, userId: "anna", userName: "Anna", status: "active", startedAt: 1, matched: 0, total: 0, storeWidth: 0, overrides: {} }, {});
    expect((await request(a).delete(`/jigsaw/api/jigsaw-pieces/${made.id}`).set("X-Jigsaw-User", "bo")).status).toBe(403);
    expect((await request(a).delete(`/jigsaw/api/jigsaw-pieces/${made.id}`).set("X-Jigsaw-User", "anna")).status).toBe(409);
  });

  it("takes its plays with it when it is deleted", async () => {
    const { app, made, plays } = await setup();
    await started(app, made.id, { userId: "anna" });
    expect(await plays.has(made.id)).toBe(true);
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${made.id}`)).status).toBe(204);
    expect(await plays.has(made.id)).toBe(false);
  });
});

describe("a jigsaw only its owner sees", () => {
  /** a jigsaw of anna's that only she sees, with its pieces; bo has a round on it (made while it was still for everybody) and cy has none */
  async function privateJigsaw(bosRound: "none" | "moved" | "fresh" = "moved") {
    const jigsaws = memoryJigsaws();
    const pieces = memoryPieces();
    const plays = memoryPlays();
    const app = createJigsawApp({ jigsaw: jigsaws, jigsawPieces: pieces, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna", "bo", "cy") });
    const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
    if ("error" in cut) throw new Error(cut.error);
    const settings = { name: "Secret", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: cut.storeWidth, snapPercent: 25, ownerUid: "anna", visibility: "owner" };
    const made = (await request(app).post("/jigsaw/api/jigsaw").send(settings)).body as JigsawSpec;
    await pieces.replaceAll(made.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
    if (bosRound !== "none") await plays.create(made.id, { jigsawId: made.id, userId: "bo", userName: "Bo", status: "active", startedAt: 1, matched: 0, total: 12, storeWidth: cut.storeWidth, overrides: {}, ...(bosRound === "fresh" ? { fresh: true } : {}) }, {});
    const as = (who: string | null) => (who ? request.agent(app).set("X-Jigsaw-User", who) : request.agent(app));
    const listed = async (who: string | null) => ((await as(who).get("/jigsaw/api/jigsaw")).body as JigsawSpec[]).map((j) => j.id);
    return { app, as, made, plays, listed };
  }

  it("is listed for its owner and for the players who have a round on it, and for nobody else", async () => {
    const { as, made, listed } = await privateJigsaw();
    expect(await listed("anna")).toEqual([made.id]);
    expect(await listed("bo")).toEqual([made.id]); // bo played it before: it stays in bo's lists
    expect(await listed("cy")).toEqual([]);
    expect(await listed(null)).toEqual([]);
    expect((await as("cy").get("/jigsaw/api/jigsaw")).status).toBe(200);
  });

  it("is kept visible by a round that is only opened too, and is not by a round that has been deleted", async () => {
    const opened = await privateJigsaw("fresh");
    expect(await opened.listed("bo")).toEqual([opened.made.id]);
    const gone = await privateJigsaw("moved");
    const round = (await gone.plays.list(gone.made.id, "bo"))[0];
    expect((await gone.as("bo").delete(`/jigsaw/api/jigsaw/${gone.made.id}/plays/${round.id}`)).status).toBe(204);
    expect(await gone.listed("bo")).toEqual([]);
    expect(await (await privateJigsaw("none")).listed("bo")).toEqual([]);
  });

  it("shows its rounds to the owner and the players only, and only the owner starts another round", async () => {
    const { as, made } = await privateJigsaw();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    expect((await as("cy").get(url)).status).toBe(404);
    expect((await as(null).get(url)).status).toBe(404);
    expect((await as("cy").post(url).send({ userId: "cy" })).status).toBe(404); // a stranger is told there is no such jigsaw
    expect((await as("bo").get(`${url}/summary`)).status).toBe(200);
    const again = await as("bo").post(url).send({ userId: "bo" });
    expect(again.status).toBe(403); // the player cannot start another round, but goes on with the one there is
    expect(again.body.error).toContain("owner");
    expect((await as("anna").post(url).send({ userId: "anna" })).status).toBe(201);
    expect((await as("anna").get(url)).status).toBe(200);
  });

  it("can be played by everybody again when it is made public", async () => {
    const { as, made } = await privateJigsaw("none");
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    expect((await as("cy").post(url).send({ userId: "cy" })).status).toBe(404);
    const put = await as("anna").put(`/jigsaw/api/jigsaw/${made.id}`).send({ name: "Secret", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: made.storeWidth, snapPercent: 25, ownerUid: "anna" });
    expect(put.status).toBe(200);
    expect((await as("cy").post(url).send({ userId: "cy" })).status).toBe(201);
  });
});

describe("the positions of a play", () => {
  it("are kept as text and read back, and a bad text is read as no positions", () => {
    const positions: PlayPositions = { a: [1, 2, 3], b: [4.5, 6, 7] };
    expect(Plays.positionsFromText(Plays.positionsToText(positions))).toEqual(positions);
    for (const bad of ["{", "[]", "5", undefined, null]) expect(Plays.positionsFromText(bad)).toEqual({});
  });
});

describe("the owner of a jigsaw", () => {
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [] };
  const app = () => createJigsawApp({ jigsaw: memoryJigsaws(), users: memoryUsers("anna", "bo"), plays: memoryPlays() });

  it("is a user that exists, and the author of the jigsaw is then that user's name", async () => {
    const a = app();
    const made = await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid: "anna", author: "Somebody else" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ ownerUid: "anna", author: "Anna" }); // the name comes from the user, not from the request
    const changed = await request(a).put(`/jigsaw/api/jigsaw/${made.body.id}`).set("X-Jigsaw-User", "anna").send({ ...settings, ownerUid: "bo" });
    expect(changed.body).toMatchObject({ ownerUid: "bo", author: "Bo" });
  });

  it("is the only one who changes or deletes the jigsaw; a jigsaw from before owners is anybody's; the owner can hand it over", async () => {
    const a = app();
    const made = (await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid: "anna" })).body as JigsawSpec;
    const put = (who: string | null, body: object = { ...settings, ownerUid: "anna", name: "New name" }) => {
      const r = request(a).put(`/jigsaw/api/jigsaw/${made.id}`);
      return (who ? r.set("X-Jigsaw-User", who) : r).send(body);
    };
    for (const who of [null, "bo", "nobody"]) {
      const res = await put(who);
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("owner");
    }
    expect((await put("anna")).status).toBe(200);
    expect((await request(a).delete(`/jigsaw/api/jigsaw/${made.id}`).set("X-Jigsaw-User", "bo")).status).toBe(403);
    expect((await put("anna", { ...settings, ownerUid: "bo" })).body).toMatchObject({ ownerUid: "bo", author: "Bo" }); // handed over
    expect((await put("anna", { ...settings, ownerUid: "bo" })).status).toBe(403); // and it is no longer the old owner's
    expect((await put("bo", { ...settings, ownerUid: "bo" })).status).toBe(200);
    const old = (await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, author: "Karin" })).body as JigsawSpec; // no owner
    expect((await request(a).put(`/jigsaw/api/jigsaw/${old.id}`).set("X-Jigsaw-User", "bo").send({ ...settings, author: "Karin", name: "Anybody" })).status).toBe(200);
  });

  it("is refused when there is no such user, or it is not an id", async () => {
    const a = app();
    for (const ownerUid of ["nobody", "a b", 5, null, ""]) {
      const res = await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, ownerUid });
      expect(res.status).toBe(400);
    }
  });

  it("is optional: a jigsaw from before owners has none, and keeps the author it has", async () => {
    const a = app();
    const made = await request(a).post("/jigsaw/api/jigsaw").send({ ...settings, author: "Karin" });
    expect(made.status).toBe(201);
    expect(made.body.author).toBe("Karin");
    expect("ownerUid" in made.body).toBe(false);
  });

  it("is kept by the model: stored, read back, and checked as an id", () => {
    const input = { ...settings };
    expect(new JigsawSettings({ ...input, ownerUid: "abc123" }).stored().ownerUid).toBe("abc123");
    expect("ownerUid" in new JigsawSettings(input).stored()).toBe(false);
    expect(JigsawSettings.fromStored("x", { ...input, ownerUid: "abc123", createdAt: 1 }).ownerUid).toBe("abc123");
    expect(new JigsawSettings({ ...input, ownerUid: "a b" }).error()).toContain("owner");
  });
});

describe("the users of the jigsaws", () => {
  const app = () => createJigsawApp({ users: memoryUsers("anna") });

  it("makes a user with a UID of its own, from a chosen user name and a name", async () => {
    const a = app();
    const made = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "  Karin_1 ", name: " Karin " });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ username: "karin_1", name: "Karin" });
    expect(typeof made.body.id).toBe("string");
    expect(made.body.id).not.toBe("karin_1"); // the UID is not the user name
    expect(typeof made.body.createdAt).toBe("number");
    expect(Object.keys(made.body).sort()).toEqual(["createdAt", "id", "language", "name", "username"]);
    expect(made.body.language).toBe("en"); // a user who has not chosen has English
    const second = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "karin_2", name: "Karin" });
    expect(second.body.id).not.toBe(made.body.id);
  });

  it("reads a user by the UID, and finds one by the user name (any case)", async () => {
    const a = app();
    const made = (await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "karin", name: "Karin" })).body;
    expect((await request(a).get(`/jigsaw/api/jigsaw-users/${made.id}`)).body).toEqual(made);
    expect((await request(a).get("/jigsaw/api/jigsaw-users/by-username/KARIN")).body).toEqual(made);
    expect((await request(a).get("/jigsaw/api/jigsaw-users/karin")).status).toBe(404); // the user name is not the id
    expect((await request(a).get("/jigsaw/api/jigsaw-users/by-username/nobody")).status).toBe(404);
    expect((await request(a).get("/jigsaw/api/jigsaw-users/by-username/a b")).status).toBe(400);
    expect((await request(a).get("/jigsaw/api/jigsaw-users/a b")).status).toBe(400);
    expect((await request(a).get("/jigsaw/api/jigsaw-users/nothing")).status).toBe(404);
  });

  it("takes a user name only once", async () => {
    const a = app();
    const again = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "ANNA", name: "Another Anna" });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("taken");
  });

  it("checks the user name and the name", async () => {
    const a = app();
    for (const username of [undefined, "", "ab", "x".repeat(31), "a b", "åke", "a.b", 5]) expect((await request(a).post("/jigsaw/api/jigsaw-users").send({ username, name: "Karin" })).status).toBe(400);
    for (const name of [undefined, "", "   ", "x".repeat(61), 5]) expect((await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "karin", name })).status).toBe(400);
  });

  it("changes only what the request says: the name, the user name, the e-mail address", async () => {
    const users = memoryUsers("anna", "bo");
    const a = createJigsawApp({ users });
    const named = await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ name: " Anna B " });
    expect(named.body).toMatchObject({ id: "anna", username: "anna", name: "Anna B" });
    const renamed = await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ username: "Anna_B" });
    expect(renamed.body).toMatchObject({ id: "anna", username: "anna_b", name: "Anna B" }); // the UID stays, and so do the plays
    expect((await request(a).get("/jigsaw/api/jigsaw-users/by-username/anna_b")).body.id).toBe("anna");
    expect((await request(a).get("/jigsaw/api/jigsaw-users/by-username/anna")).status).toBe(404);
    const mail = await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ email: " A@Example.com " });
    expect("email" in mail.body).toBe(false); // private: not given back
    expect((await users.get("anna"))?.email).toBe("a@example.com");
    await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ name: "Anna C" });
    expect((await users.get("anna"))?.email).toBe("a@example.com"); // not said: not changed
    await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ email: "" });
    expect((await users.get("anna"))?.email).toBeUndefined(); // empty: taken away
  });

  it("refuses a user name that another user has, and a change that says nothing or is not allowed", async () => {
    const a = createJigsawApp({ users: memoryUsers("anna", "bob") });
    const taken = await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ username: "BOB" });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toContain("taken");
    expect((await request(a).put("/jigsaw/api/jigsaw-users/anna").send({ username: "anna" })).status).toBe(200); // its own user name is fine
    for (const body of [{}, { name: "" }, { username: "a b" }, { email: "nope" }, { name: "x".repeat(61) }]) expect((await request(a).put("/jigsaw/api/jigsaw-users/anna").send(body)).status).toBe(400);
    expect((await request(a).put("/jigsaw/api/jigsaw-users/nobody").send({ name: "X" })).status).toBe(404);
  });

  it("keeps an optional e-mail address, in small letters, and gives it back only to the person who made the user", async () => {
    const users = memoryUsers();
    const a = createJigsawApp({ users });
    const made = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "karin", name: "Karin", email: "  Karin@Example.COM " });
    expect(made.status).toBe(201);
    expect(made.body.email).toBe("karin@example.com");
    expect((await users.get(made.body.id))?.email).toBe("karin@example.com"); // kept in the database, for a later connection to a registration
    for (const url of [`/jigsaw/api/jigsaw-users/${made.body.id}`, "/jigsaw/api/jigsaw-users/by-username/karin"]) expect("email" in (await request(a).get(url)).body).toBe(false);
    expect("email" in (await request(a).put(`/jigsaw/api/jigsaw-users/${made.body.id}`).send({ name: "K" })).body).toBe(false);
    expect((await users.get(made.body.id))?.email).toBe("karin@example.com"); // a rename leaves it
    const without = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "bob", name: "Bob", email: "" });
    expect(without.status).toBe(201);
    expect("email" in without.body).toBe(false);
  });

  it("checks the e-mail address when there is one", async () => {
    const a = app();
    for (const email of ["karin", "a@b", "@b.c", "a b@c.de", "x".repeat(250) + "@b.cd", 5]) expect((await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "karin", name: "Karin", email })).status).toBe(400);
    for (const email of [undefined, null, "", "a@b.co"]) expect((await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "kar" + String(email).length, name: "Karin", email })).status).toBe(201);
  });

  it("lists the users by name, to choose who plays from, without their e-mail addresses", async () => {
    const a = createJigsawApp({ users: memoryUsers("zed", "anna") });
    await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "karin", name: "karin", email: "k@example.com" });
    const list = await request(a).get("/jigsaw/api/jigsaw-users");
    expect(list.status).toBe(200);
    expect(list.body.map((u: { name: string }) => u.name)).toEqual(["Anna", "karin", "Zed"]);
    for (const user of list.body) expect(Object.keys(user).sort()).toEqual(["createdAt", "id", "language", "name", "username"]);
    expect((await request(createJigsawApp({ users: memoryUsers() })).get("/jigsaw/api/jigsaw-users")).body).toEqual([]);
  });

  it("reads a user an earlier version made (the user name was the id, no username field) with the id as the user name", () => {
    expect(JigsawUsers.fromStored("karin", { name: "Karin", createdAt: 5 })).toEqual({ id: "karin", username: "karin", name: "Karin", language: "en", createdAt: 5 });
    expect(JigsawUsers.fromStored("Xy12", { username: "karin", name: "Karin", createdAt: 5 })).toEqual({ id: "Xy12", username: "karin", name: "Karin", language: "en", createdAt: 5 });
  });

  it("keeps how the user looks for jigsaws (cards or list, and the filter) when it is said, gives it back, and refuses what is not a setup of the Find page", async () => {
    const a = createJigsawApp({ users: memoryUsers() });
    const made = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "ola", name: "Ola" });
    expect("search" in made.body).toBe(false); // none until Go has been pressed
    const search = { view: "list", filter: { text: "harbour", categories: ["recommended", "nature/forest"], sizes: ["small"], difficulties: [], languages: ["nb"], owners: ["u1"] } };
    const saved = await request(a).put(`/jigsaw/api/jigsaw-users/${made.body.id}`).send({ search });
    expect([saved.status, saved.body.search, saved.body.name]).toEqual([200, search, "Ola"]); // only the search changed
    expect((await request(a).get(`/jigsaw/api/jigsaw-users/${made.body.id}`)).body.search).toEqual(search);
    expect((await request(a).get("/jigsaw/api/jigsaw-users")).body[0].search).toEqual(search);
    for (const bad of [{ view: "grid", filter: search.filter }, { view: "list", filter: { ...search.filter, sizes: ["tiny"] } }, { view: "list" }, "list", null]) {
      const refused = await request(a).put(`/jigsaw/api/jigsaw-users/${made.body.id}`).send({ search: bad });
      expect(refused.status).toBe(400);
    }
    expect((await request(a).get(`/jigsaw/api/jigsaw-users/${made.body.id}`)).body.search).toEqual(search); // what was refused changed nothing
    expect(JigsawUsers.fromStored("u", { username: "u1x", name: "U", search } as never).search).toEqual(search);
    expect("search" in JigsawUsers.fromStored("u", { username: "u1x", name: "U", search: { view: "grid" } } as never)).toBe(false); // what is not a setup is left out
  });

  it("has a language: English until the user chooses, chosen when the user is made or changed, and only one of the languages of the app", async () => {
    const a = createJigsawApp({ users: memoryUsers() });
    const made = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "ola", name: "Ola", language: "nb" });
    expect([made.status, made.body.language]).toEqual([201, "nb"]);
    const refused = await request(a).post("/jigsaw/api/jigsaw-users").send({ username: "pia", name: "Pia", language: "xx" });
    expect(refused.status).toBe(400);
    expect(refused.body.error).toMatch(/language must be one of/);
    const changed = await request(a).put(`/jigsaw/api/jigsaw-users/${made.body.id}`).send({ language: "sv" });
    expect([changed.status, changed.body.language, changed.body.name]).toEqual([200, "sv", "Ola"]); // only the language changed
    expect((await request(a).put(`/jigsaw/api/jigsaw-users/${made.body.id}`).send({ language: "xx" })).status).toBe(400);
    expect((await request(a).get(`/jigsaw/api/jigsaw-users/${made.body.id}`)).body.language).toBe("sv");
    expect(JigsawUsers.stored({ username: "a1b", name: "A" }, 1).language).toBe("en");
    expect(JigsawUsers.stored({ username: "a1b", name: "A", language: "de" }, 1).language).toBe("de");
    expect(JigsawUsers.fromStored("u", { username: "u1x", name: "U", language: "xx" } as never, ).language).toBe("en"); // what is not a language of the app is English
  });
});

describe("the list of jigsaws", () => {
  const body = { name: "Puzzle", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [] };

  it("works like jigsaw-list but keeps its pages in a store of its own", async () => {
    const app = createJigsawApp({ jigsaw: memoryJigsaws(), plays: memoryPlays() });
    const made = await request(app).post("/jigsaw/api/jigsaw").send(body);
    expect(made.status).toBe(201);
    expect((await request(app).get("/jigsaw/api/jigsaw")).body.map((c: { name: string }) => c.name)).toEqual(["Puzzle"]);
    expect((await request(app).put(`/jigsaw/api/jigsaw/${made.body.id}`).send({ ...body, name: "Renamed" })).body.name).toBe("Renamed");
    expect((await request(app).post("/jigsaw/api/jigsaw").send({ ...body, width: 0 })).status).toBe(400); // the same checks
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${made.body.id}`)).status).toBe(204);
    expect((await request(app).get("/jigsaw/api/jigsaw")).body).toEqual([]);
  });
});


describe("the popular jigsaws", () => {
  const DAY = 24 * 60 * 60 * 1000;
  /** jigsaws made at time 1, 2, 3 ...; `now` is far later, so only the rounds count. `rounds` says how many rounds each has (a round with `fresh` is only opened). */
  async function popularApp(rounds: { [name: string]: { moved?: number; fresh?: number } }, extra: Partial<JigsawSpec> & { name?: string } = {}) {
    const jigsaws = memoryJigsaws();
    const plays = memoryPlays();
    const app = createJigsawApp({ jigsaw: jigsaws, jigsawPieces: memoryPieces(), jigsawExists: async () => true, plays, users: memoryUsers("anna", "bo"), now: () => 3000 * DAY });
    const made: { [name: string]: JigsawSpec } = {};
    for (const [name, n] of Object.entries(rounds)) {
      made[name] = (await request(app).post("/jigsaw/api/jigsaw").send({ name, width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], ...(name === "Secret" ? extra : {}) })).body as JigsawSpec;
      for (let i = 0; i < (n.moved ?? 0); i++) await plays.create(made[name].id, { jigsawId: made[name].id, userId: "bo", userName: "Bo", status: "active", startedAt: i + 1, matched: 0, total: 12, storeWidth: 0, overrides: {} }, {});
      for (let i = 0; i < (n.fresh ?? 0); i++) await plays.create(made[name].id, { jigsawId: made[name].id, userId: "bo", userName: "Bo", status: "active", startedAt: i + 1, matched: 0, total: 12, storeWidth: 0, overrides: {}, fresh: true }, {});
    }
    const popular = async (who?: string) => ((await (who ? request.agent(app).set("X-Jigsaw-User", who) : request(app)).get("/jigsaw/api/jigsaw-popular")).body as JigsawSpec[]).map((j) => j.name);
    return { popular };
  }

  it("are the jigsaws with the most rounds first", async () => {
    const { popular } = await popularApp({ Quiet: { moved: 1 }, Busy: { moved: 4 }, Nobody: {}, Middle: { moved: 2 } });
    expect(await popular()).toEqual(["Busy", "Middle", "Quiet", "Nobody"]);
  });

  it("do not count a round that is only opened", async () => {
    const { popular } = await popularApp({ Opened: { fresh: 5 }, Played: { moved: 1 } });
    expect(await popular()).toEqual(["Played", "Opened"]);
  });

  it("are at most ten", async () => {
    const all = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`J${i}`, { moved: i }]));
    const { popular } = await popularApp(all);
    expect(await popular()).toHaveLength(10);
  });

  it("leave out a jigsaw only its owner sees, for everybody but its owner and the players who have a round on it", async () => {
    const { popular } = await popularApp({ Secret: { moved: 6 }, Open: { moved: 1 } }, { ownerUid: "anna", visibility: "owner" });
    expect(await popular("anna")).toEqual(["Secret", "Open"]);
    expect(await popular("bo")).toEqual(["Secret", "Open"]); // bo has rounds on it
    expect(await popular()).toEqual(["Open"]);
  });
});

describe("a bond between pieces is never broken", () => {
  const pieces = [piece(0, 0), piece(1, 0), piece(2, 0)];
  // 0,0 and 1,0 lie exactly beside each other (50 px pieces): bound; 2,0 lies somewhere else
  const before = { "piece-0-0": [300, 300, 3], "piece-1-0": [350, 300, 4], "piece-2-0": [600, 100, 5] } as Record<string, [number, number, number]>;
  const with_ = (over: Record<string, [number, number, number]>) => ({ ...before, ...over });

  it("lets the whole group move, and pieces that are not bound move on their own", () => {
    expect(Plays.bondsError(pieces, before, with_({ "piece-0-0": [400, 350, 6], "piece-1-0": [450, 350, 7] }))).toBe("");
    expect(Plays.bondsError(pieces, before, with_({ "piece-2-0": [10, 10, 9] }))).toBe("");
  });

  it("refuses a move that pulls a bound piece away from the one it sticks to, however little", () => {
    expect(Plays.bondsError(pieces, before, with_({ "piece-1-0": [352, 300, 4] }))).toMatch(/can not be pulled apart/);
    expect(Plays.bondsError(pieces, before, with_({ "piece-0-0": [300, 300.5, 3] }))).toMatch(/can not be pulled apart/);
    expect(Plays.bondsError(pieces, before, with_({ "piece-1-0": [900, 500, 4] }))).toMatch(/can not be pulled apart/);
  });
});


describe("starting a round over", () => {
  it("scatters the pieces anew and puts the time back, in the same round, and only for its player", async () => {
    const { app, made } = await setup();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    const play = await started(app, made.id, { userId: "anna" });
    await anna(app).patch(`${url}/${play.id}/positions`).send({ moves: [], elapsedMs: 12_000 });
    expect((await request(app).post(`${url}/${play.id}/restart`).set("X-Jigsaw-User", "bo")).status).toBe(403);
    expect((await anna(app).post(`${url}/${play.id}/restart`)).status).toBe(200);
    const after = (await request(app).get(`${url}/${play.id}`)).body.play as PlaySpec;
    expect(after.id).toBe(play.id); // the same round, not another
    expect(after.userId).toBe("anna");
    expect(after.elapsedMs).toBeUndefined();
    expect((await request(app).get(url)).body).toHaveLength(0); // nobody has moved a piece in it again: it is a fresh round
    expect((await anna(app).post(`${url}/nope/restart`)).status).toBe(404);
  });
});

describe("a jigsaw that is solved is not played twice", () => {
  it("refuses a new round of a jigsaw the user has solved, and a reset of a solved round, but not for other users", async () => {
    const { app, made } = await setup();
    const url = `/jigsaw/api/jigsaw/${made.id}/plays`;
    const play = await started(app, made.id, { userId: "anna" });
    // put every piece on its own place: the round is solved
    const detail = (await request(app).get(`${url}/${play.id}`)).body as { pieces: { id: string; col: number; row: number; size: number }[] };
    const moves = detail.pieces.map((p, i) => ({ id: p.id, centerX: p.col * p.size + p.size / 2, centerY: p.row * p.size + p.size / 2, layer: 2 + i }));
    expect((await anna(app).patch(`${url}/${play.id}/positions`).send({ moves })).status).toBe(200);
    expect(((await request(app).get(`${url}/${play.id}`)).body.play as PlaySpec).status).toBe("solved");
    const again = await anna(app).post(url).send({ userId: "anna" });
    expect(again.status).toBe(409);
    expect(again.body.error).toMatch(/solved/);
    expect((await anna(app).post(`${url}/${play.id}/restart`)).status).toBe(409); // a solved round is not played over
    expect(((await request(app).get(`${url}/${play.id}`)).body.play as PlaySpec).status).toBe("solved"); // and is still solved
    expect((await request(app).post(url).send({ userId: "bo" })).status).toBe(201); // somebody else may play it
    // deleting the solved round is the way to play it again
    expect((await anna(app).delete(`${url}/${play.id}`)).status).toBeLessThan(300);
    expect((await anna(app).post(url).send({ userId: "anna" })).status).toBe(201);
  });
});

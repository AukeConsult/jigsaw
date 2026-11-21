import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import type { CanvasStore } from "../src/canvas-list";
import type { PieceStore } from "../src/jigsaw-pieces";
import { memoryPlays, memoryUsers } from "./memory-plays";
import { CanvasArea, JigsawCut, JigsawPiece, JigsawPieces, JigsawUsers, PlayPositions, PlaySpec, Plays } from "../src/models";
import type { CanvasSpec } from "../src/models";

// ---- the stores in memory: what Firestore and Storage are in the app ----

function memoryJigsaws(): CanvasStore {
  const items: CanvasSpec[] = [];
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
  const play = (await request(app).post(`/api/jigsaw/${jigsawId}/plays`).send(body)).body as PlaySpec;
  const detail = (await request(app).get(`/api/jigsaw/${jigsawId}/plays/${play.id}`)).body as { pieces: JigsawPiece[] };
  const first = detail.pieces[0];
  await request(app).patch(`/api/jigsaw/${jigsawId}/plays/${play.id}/positions`).set("X-Jigsaw-User", body.userId).send({ moves: [{ id: first.id, centerX: first.centerX, centerY: first.centerY, layer: first.layer }] });
  return (await request(app).get(`/api/jigsaw/${jigsawId}/plays/${play.id}`)).body.play as PlaySpec;
}

async function setup() {
  const jigsaws = memoryJigsaws();
  const pieces = memoryPieces();
  const plays = memoryPlays();
  let time = 1000;
  const app = createApp({ jigsaw: jigsaws, jigsawPieces: pieces, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna", "bo") });
  const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
  if ("error" in cut) throw new Error(cut.error);
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: cut.storeWidth, snapPercent: 25, lineWidth: 1, lineColor: "#212529", backColor: "#ffffff" };
  const made = (await request(app).post("/api/jigsaw").send(settings)).body as CanvasSpec;
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
    expect(Plays.effective(jigsaw, { overrides: {} })).toEqual({ snapPercent: 10, lineWidth: CanvasArea.DEFAULT_LINE_WIDTH, lineColor: "#000000", backColor: CanvasArea.DEFAULT_BACK_COLOR });
    expect(Plays.effective(jigsaw, { overrides: { lineColor: "#ffffff" } })).toMatchObject({ snapPercent: 10, lineColor: "#ffffff" }); // the difficulty is the jigsaw's
    expect(Plays.changed({ lineColor: "#112233", lineWidth: 2 }, { lineColor: null, backColor: "#AABBCC" })).toEqual({ lineWidth: 2, backColor: "#aabbcc" });
  });
});

describe("the moves of a play", () => {
  const pieces = [piece(0, 0), piece(1, 0)];
  const play: PlaySpec = { id: "p", jigsawId: "j", userId: "u", userName: "U", status: "active", startedAt: 1, matched: 0, total: 2, storeWidth: 100, overrides: {} };

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
    const res = await request(app).post(`/api/jigsaw/${made.id}/plays`).send({ userId: "anna" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ jigsawId: made.id, userId: "anna", userName: "Anna", status: "active", matched: 0, total: 12, overrides: {} });
    expect(plays.all.get(made.id)!.size).toBe(1);
    const got = await request(app).get(`/api/jigsaw/${made.id}/plays/${res.body.id}`);
    expect(got.status).toBe(200);
    expect(got.body.pieces).toHaveLength(12);
    expect(got.body.settings).toEqual({ snapPercent: 25, lineWidth: 1, lineColor: "#212529", backColor: "#ffffff" });
  });

  it("is kept by the UID of the user, with the user's name as it was when the game started", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna", userName: "Somebody else" }));
    expect(play.userId).toBe("anna");
    expect(play.userName).toBe("Anna"); // the name comes from the user, not from the request
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays?userId=anna`)).body[0]).toMatchObject({ userId: "anna", userName: "Anna" });
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays?userId=Anna`)).body).toEqual([]); // the UID, not a spelling of the name
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
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays?userId=anna`)).body).toHaveLength(2);
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays?userId=bo`)).body).toHaveLength(1);
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays`)).body).toHaveLength(3);
    await anna(app).patch(`/api/jigsaw/${made.id}/plays/${a1.id}/positions`).send({ moves: [{ id: "piece-0-0", centerX: 25, centerY: 25, layer: 5 }] });
    const mine = (await request(app).get(`/api/jigsaw/${made.id}/plays/${a1.id}`)).body.pieces.find((p: JigsawPiece) => p.id === "piece-0-0");
    const theirs = (await request(app).get(`/api/jigsaw/${made.id}/plays/${b1.id}`)).body.pieces.find((p: JigsawPiece) => p.id === "piece-0-0");
    expect([mine.centerX, mine.centerY, mine.layer, mine.matched]).toEqual([25, 25, 5, true]);
    expect(theirs.matched).toBe(false);
  });

  it("checks the user and the jigsaw", async () => {
    const { app, made } = await setup();
    for (const userId of [undefined, "", "a b", "x".repeat(129), 5]) expect((await request(app).post(`/api/jigsaw/${made.id}/plays`).send({ userId })).status).toBe(400);
    expect((await request(app).post(`/api/jigsaw/nothing/plays`).send({ userId: "anna" })).status).toBe(404);
    const stranger = await request(app).post(`/api/jigsaw/${made.id}/plays`).send({ userId: "nobody" });
    expect(stranger.status).toBe(404); // a play is played by a user that exists
    expect(stranger.body.error).toContain("No such user");
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays/nothing`)).status).toBe(404);
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays?userId=a%20b`)).status).toBe(400);
  });

  it("will not start a play of a jigsaw that has no pieces", async () => {
    const { app, pieces, made } = await setup();
    await pieces.removeAll(made.id);
    expect((await request(app).post(`/api/jigsaw/${made.id}/plays`).send({ userId: "anna" })).status).toBe(409);
  });

  it("keeps the settings a play chooses to that play, and refuses anything about size, picture or pieces", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    const other = (await started(app, made.id, { userId: "bo" }));
    const url = (p: PlaySpec) => `/api/jigsaw/${made.id}/plays/${p.id}/settings`;
    const set = await anna(app).patch(url(play)).send({ overrides: { lineWidth: 3, backColor: "#AABBCC" } });
    expect(set.status).toBe(200);
    expect(set.body.settings).toMatchObject({ snapPercent: 25, backColor: "#aabbcc", lineWidth: 3 });
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays/${other.id}`)).body.settings).toMatchObject({ snapPercent: 25, backColor: "#ffffff" });
    const back = await anna(app).patch(url(play)).send({ overrides: { backColor: null } });
    expect(back.body.settings.backColor).toBe("#ffffff");
    for (const bad of [{ width: 500 }, { gridSize: 10 }, { picture: "x" }, { pieces: [] }, { snapPercent: 40 }]) { // the difficulty is not a choice of a round
      expect((await anna(app).patch(url(play)).send({ overrides: bad })).status).toBe(400);
    }
    expect((await request(app).get(`/api/jigsaw/${made.id}`)).status).toBeLessThan(500);
  });

  it("follows the jigsaw: its difficulty always, its look until the play chooses its own", async () => {
    const { app, made, settings } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    await request(app).put(`/api/jigsaw/${made.id}`).send({ ...settings, snapPercent: 40, backColor: "#000000" });
    const got = (await request(app).get(`/api/jigsaw/${made.id}/plays/${play.id}`)).body;
    expect(got.settings).toMatchObject({ snapPercent: 40, backColor: "#000000" });
  });

  it("solves the game when every piece is in place", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    const moves = Array.from({ length: 12 }, (_, i) => ({ id: `piece-${i % 4}-${Math.floor(i / 4)}`, centerX: (i % 4) * 50 + 25, centerY: Math.floor(i / 4) * 50 + 25, layer: i + 1 }));
    const res = await anna(app).patch(`/api/jigsaw/${made.id}/plays/${play.id}/positions`).send({ moves });
    expect(res.body).toMatchObject({ moved: 12, matched: 12, total: 12, status: "solved" });
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays?userId=anna`)).body[0]).toMatchObject({ status: "solved" });
    expect((await anna(app).patch(`/api/jigsaw/${made.id}/plays/${play.id}/positions`).send({ moves: [{ id: "piece-0-0", centerX: -5, centerY: 1, layer: 1 }] })).status).toBe(400);
    expect((await anna(app).patch(`/api/jigsaw/${made.id}/plays/${play.id}/positions`).send({ moves: "x" })).status).toBe(400);
  });

  it("keeps how wide the store of a game has grown to, with the positions", async () => {
    const { app, made } = await setup();
    const play = (await started(app, made.id, { userId: "anna" }));
    const url = `/api/jigsaw/${made.id}/plays/${play.id}`;
    expect((await anna(app).patch(`${url}/positions`).send({ moves: [], storeWidth: 640 })).status).toBe(200);
    expect((await request(app).get(`${url}`)).body.play.storeWidth).toBe(640);
    for (const bad of [-1, 1.5, "3", 100000]) expect((await anna(app).patch(`${url}/positions`).send({ moves: [], storeWidth: bad })).status).toBe(400);
  });

  it("tells whether anyone has played the jigsaw: only once a piece has been moved", async () => {
    const { app, made } = await setup();
    const url = `/api/jigsaw/${made.id}/plays`;
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: false });
    const opened = (await request(app).post(url).send({ userId: "anna" })).body as PlaySpec;
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: false }); // only opened: not played
    const play = await started(app, made.id, { userId: "anna" });
    expect(play.id).toBe(opened.id); // the round that was only opened is the one that is played
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: true });
    await anna(app).delete(`${url}/${play.id}`);
    expect((await request(app).get(`${url}/summary`)).body).toEqual({ played: false });
    expect((await request(app).get("/api/jigsaw/nothing/plays/summary")).status).toBe(404);
  });

  it("does not make a round by opening the jigsaw: the round is not listed, and opening again does not make another, until a piece is moved", async () => {
    const { app, made } = await setup();
    const url = `/api/jigsaw/${made.id}/plays`;
    const first = (await request(app).post(url).send({ userId: "anna" })).body as PlaySpec;
    const again = await request(app).post(url).send({ userId: "anna" });
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.id);
    expect((await request(app).get(url)).body).toEqual([]);
    expect((await request(app).get("/api/jigsaw-users/anna/plays")).body).toEqual([]);
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
    const opened = (await request(app).post(`/api/jigsaw/${made.id}/plays`).send({ userId: "anna" })).body as PlaySpec;
    expect((await request(app).put(`/api/jigsaw/${made.id}`).send({ ...made, width: 250 })).status).toBe(200);
    expect(await plays.get(made.id, opened.id)).toBeNull();
  });

  it("deletes one play and leaves the others", async () => {
    const { app, made } = await setup();
    const a = (await started(app, made.id, { userId: "anna" }));
    await started(app, made.id, { userId: "anna" });
    expect((await anna(app).delete(`/api/jigsaw/${made.id}/plays/${a.id}`)).status).toBe(204);
    expect((await anna(app).delete(`/api/jigsaw/${made.id}/plays/${a.id}`)).status).toBe(404);
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays`)).body).toHaveLength(1);
  });
});

describe("deleting a jigsaw", () => {
  const settings = { name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [] };
  const app = () => createApp({ jigsaw: memoryJigsaws(), users: memoryUsers("anna", "bob"), plays: memoryPlays() });

  it("can be done by the owner only, when the jigsaw has an owner", async () => {
    const a = app();
    const made = (await request(a).post("/api/jigsaw").send({ ...settings, ownerUid: "anna" })).body as CanvasSpec;
    for (const who of ["bob", "", undefined]) {
      const res = await (who === undefined ? request(a).delete(`/api/jigsaw/${made.id}`) : request(a).delete(`/api/jigsaw/${made.id}`).set("X-Jigsaw-User", who));
      expect(res.status).toBe(403);
      expect(res.body.error).toContain("Only the owner");
    }
    expect((await request(a).get("/api/jigsaw")).body).toHaveLength(1);
    expect((await request(a).delete(`/api/jigsaw/${made.id}`).set("X-Jigsaw-User", "anna")).status).toBe(204);
    expect((await request(a).get("/api/jigsaw")).body).toHaveLength(0);
  });

  it("can be done by anyone when the jigsaw has no owner (one from before owners)", async () => {
    const a = app();
    const made = (await request(a).post("/api/jigsaw").send(settings)).body as CanvasSpec;
    expect((await request(a).delete(`/api/jigsaw/${made.id}`)).status).toBe(204);
    expect((await request(a).delete(`/api/jigsaw/nothing`)).status).toBe(404);
  });
});

describe("the games of a user", () => {
  it("are listed over all the jigsaws, newest first, with the jigsaw each is a game of, and only the user's own", async () => {
    const { app, made, pieces, cut, settings } = await setup();
    const second = (await request(app).post("/api/jigsaw").send({ ...settings, name: "Second" })).body as CanvasSpec;
    await pieces.replaceAll(second.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
    const start = async (jigsawId: string, userId: string) => (await started(app, jigsawId, { userId }));
    const first = await start(made.id, "anna");
    await new Promise((r) => setTimeout(r, 5));
    const later = await start(second.id, "anna");
    await start(made.id, "bo");
    const res = await request(app).get("/api/jigsaw-users/anna/plays");
    expect(res.status).toBe(200);
    expect(res.body.map((g: { play: PlaySpec; jigsaw: { id: string; name: string } }) => [g.play.id, g.jigsaw.name])).toEqual([[later.id, "Second"], [first.id, "Harbour"]]);
    for (const g of res.body) expect(g.play.userId).toBe("anna");
    expect((await request(app).get("/api/jigsaw-users/bo/plays")).body).toHaveLength(1);
    expect((await request(app).get("/api/jigsaw-users/nobody/plays")).status).toBe(404);
    expect((await request(app).get("/api/jigsaw-users/a b/plays")).status).toBe(400);
  });
});

describe("rounds of other players", () => {
  it("can be looked at by anyone, and listed with the others, but never changed or deleted by another user", async () => {
    const { app, made } = await setup();
    const hers = (await started(app, made.id, { userId: "anna" }));
    const url = `/api/jigsaw/${made.id}/plays/${hers.id}`;
    expect((await request(app).get(`/api/jigsaw/${made.id}/plays`)).body).toHaveLength(1); // everyone's rounds are listed
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
    expect((await request(app).patch(`/api/jigsaw/${made.id}/plays/nothing/positions`).send(move)).status).toBe(404); // no such round: not a 403
    expect((await anna(app).delete(url)).status).toBe(204);
  });
});

describe("a jigsaw that has been played", () => {
  it("keeps its size, grid and pieces: a change of them is refused, while the name and the defaults can still change", async () => {
    const { app, made, settings } = await setup();
    expect((await request(app).put(`/api/jigsaw/${made.id}`).send({ ...settings, width: 250 })).status).toBe(200); // not played yet
    await request(app).put(`/api/jigsaw/${made.id}`).send(settings);
    await started(app, made.id, { userId: "anna" });
    for (const change of [{ width: 250 }, { height: 100 }, { gridSize: 25 }]) {
      const res = await request(app).put(`/api/jigsaw/${made.id}`).send({ ...settings, ...change });
      expect(res.status).toBe(409);
      expect(res.body.error).toContain("has been played");
    }
    const renamed = await request(app).put(`/api/jigsaw/${made.id}`).send({ ...settings, name: "Harbour 2", snapPercent: 40, lineColor: "#ff0000" });
    expect(renamed.status).toBe(200);
    expect(renamed.body).toMatchObject({ name: "Harbour 2", snapPercent: 40, lineColor: "#ff0000" });
  });

  it("takes its plays with it when it is deleted", async () => {
    const { app, made, plays } = await setup();
    await started(app, made.id, { userId: "anna" });
    expect(await plays.has(made.id)).toBe(true);
    expect((await request(app).delete(`/api/jigsaw/${made.id}`)).status).toBe(204);
    expect(await plays.has(made.id)).toBe(false);
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
  const app = () => createApp({ jigsaw: memoryJigsaws(), users: memoryUsers("anna", "bo"), plays: memoryPlays() });

  it("is a user that exists, and the author of the jigsaw is then that user's name", async () => {
    const a = app();
    const made = await request(a).post("/api/jigsaw").send({ ...settings, ownerUid: "anna", author: "Somebody else" });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ ownerUid: "anna", author: "Anna" }); // the name comes from the user, not from the request
    const changed = await request(a).put(`/api/jigsaw/${made.body.id}`).send({ ...settings, ownerUid: "bo" });
    expect(changed.body).toMatchObject({ ownerUid: "bo", author: "Bo" });
  });

  it("is refused when there is no such user, or it is not an id", async () => {
    const a = app();
    for (const ownerUid of ["nobody", "a b", 5, null, ""]) {
      const res = await request(a).post("/api/jigsaw").send({ ...settings, ownerUid });
      expect(res.status).toBe(400);
    }
  });

  it("is optional: a jigsaw from before owners has none, and keeps the author it has", async () => {
    const a = app();
    const made = await request(a).post("/api/jigsaw").send({ ...settings, author: "Karin" });
    expect(made.status).toBe(201);
    expect(made.body.author).toBe("Karin");
    expect("ownerUid" in made.body).toBe(false);
  });

  it("is kept by the model: stored, read back, and checked as an id", () => {
    const input = { ...settings };
    expect(new CanvasArea({ ...input, ownerUid: "abc123" }).stored().ownerUid).toBe("abc123");
    expect("ownerUid" in new CanvasArea(input).stored()).toBe(false);
    expect(CanvasArea.fromStored("x", { ...input, ownerUid: "abc123", createdAt: 1 }).ownerUid).toBe("abc123");
    expect(new CanvasArea({ ...input, ownerUid: "a b" }).error()).toContain("owner");
  });
});

describe("the users of the jigsaws", () => {
  const app = () => createApp({ users: memoryUsers("anna") });

  it("makes a user with a UID of its own, from a chosen user name and a name", async () => {
    const a = app();
    const made = await request(a).post("/api/jigsaw-users").send({ username: "  Karin_1 ", name: " Karin " });
    expect(made.status).toBe(201);
    expect(made.body).toMatchObject({ username: "karin_1", name: "Karin" });
    expect(typeof made.body.id).toBe("string");
    expect(made.body.id).not.toBe("karin_1"); // the UID is not the user name
    expect(typeof made.body.createdAt).toBe("number");
    expect(Object.keys(made.body).sort()).toEqual(["createdAt", "id", "name", "username"]);
    const second = await request(a).post("/api/jigsaw-users").send({ username: "karin_2", name: "Karin" });
    expect(second.body.id).not.toBe(made.body.id);
  });

  it("reads a user by the UID, and finds one by the user name (any case)", async () => {
    const a = app();
    const made = (await request(a).post("/api/jigsaw-users").send({ username: "karin", name: "Karin" })).body;
    expect((await request(a).get(`/api/jigsaw-users/${made.id}`)).body).toEqual(made);
    expect((await request(a).get("/api/jigsaw-users/by-username/KARIN")).body).toEqual(made);
    expect((await request(a).get("/api/jigsaw-users/karin")).status).toBe(404); // the user name is not the id
    expect((await request(a).get("/api/jigsaw-users/by-username/nobody")).status).toBe(404);
    expect((await request(a).get("/api/jigsaw-users/by-username/a b")).status).toBe(400);
    expect((await request(a).get("/api/jigsaw-users/a b")).status).toBe(400);
    expect((await request(a).get("/api/jigsaw-users/nothing")).status).toBe(404);
  });

  it("takes a user name only once", async () => {
    const a = app();
    const again = await request(a).post("/api/jigsaw-users").send({ username: "ANNA", name: "Another Anna" });
    expect(again.status).toBe(409);
    expect(again.body.error).toContain("taken");
  });

  it("checks the user name and the name", async () => {
    const a = app();
    for (const username of [undefined, "", "ab", "x".repeat(31), "a b", "åke", "a.b", 5]) expect((await request(a).post("/api/jigsaw-users").send({ username, name: "Karin" })).status).toBe(400);
    for (const name of [undefined, "", "   ", "x".repeat(61), 5]) expect((await request(a).post("/api/jigsaw-users").send({ username: "karin", name })).status).toBe(400);
  });

  it("changes only what the request says: the name, the user name, the e-mail address", async () => {
    const users = memoryUsers("anna", "bo");
    const a = createApp({ users });
    const named = await request(a).put("/api/jigsaw-users/anna").send({ name: " Anna B " });
    expect(named.body).toMatchObject({ id: "anna", username: "anna", name: "Anna B" });
    const renamed = await request(a).put("/api/jigsaw-users/anna").send({ username: "Anna_B" });
    expect(renamed.body).toMatchObject({ id: "anna", username: "anna_b", name: "Anna B" }); // the UID stays, and so do the plays
    expect((await request(a).get("/api/jigsaw-users/by-username/anna_b")).body.id).toBe("anna");
    expect((await request(a).get("/api/jigsaw-users/by-username/anna")).status).toBe(404);
    const mail = await request(a).put("/api/jigsaw-users/anna").send({ email: " A@Example.com " });
    expect("email" in mail.body).toBe(false); // private: not given back
    expect((await users.get("anna"))?.email).toBe("a@example.com");
    await request(a).put("/api/jigsaw-users/anna").send({ name: "Anna C" });
    expect((await users.get("anna"))?.email).toBe("a@example.com"); // not said: not changed
    await request(a).put("/api/jigsaw-users/anna").send({ email: "" });
    expect((await users.get("anna"))?.email).toBeUndefined(); // empty: taken away
  });

  it("refuses a user name that another user has, and a change that says nothing or is not allowed", async () => {
    const a = createApp({ users: memoryUsers("anna", "bob") });
    const taken = await request(a).put("/api/jigsaw-users/anna").send({ username: "BOB" });
    expect(taken.status).toBe(409);
    expect(taken.body.error).toContain("taken");
    expect((await request(a).put("/api/jigsaw-users/anna").send({ username: "anna" })).status).toBe(200); // its own user name is fine
    for (const body of [{}, { name: "" }, { username: "a b" }, { email: "nope" }, { name: "x".repeat(61) }]) expect((await request(a).put("/api/jigsaw-users/anna").send(body)).status).toBe(400);
    expect((await request(a).put("/api/jigsaw-users/nobody").send({ name: "X" })).status).toBe(404);
  });

  it("keeps an optional e-mail address, in small letters, and gives it back only to the person who made the user", async () => {
    const users = memoryUsers();
    const a = createApp({ users });
    const made = await request(a).post("/api/jigsaw-users").send({ username: "karin", name: "Karin", email: "  Karin@Example.COM " });
    expect(made.status).toBe(201);
    expect(made.body.email).toBe("karin@example.com");
    expect((await users.get(made.body.id))?.email).toBe("karin@example.com"); // kept in the database, for a later connection to a registration
    for (const url of [`/api/jigsaw-users/${made.body.id}`, "/api/jigsaw-users/by-username/karin"]) expect("email" in (await request(a).get(url)).body).toBe(false);
    expect("email" in (await request(a).put(`/api/jigsaw-users/${made.body.id}`).send({ name: "K" })).body).toBe(false);
    expect((await users.get(made.body.id))?.email).toBe("karin@example.com"); // a rename leaves it
    const without = await request(a).post("/api/jigsaw-users").send({ username: "bob", name: "Bob", email: "" });
    expect(without.status).toBe(201);
    expect("email" in without.body).toBe(false);
  });

  it("checks the e-mail address when there is one", async () => {
    const a = app();
    for (const email of ["karin", "a@b", "@b.c", "a b@c.de", "x".repeat(250) + "@b.cd", 5]) expect((await request(a).post("/api/jigsaw-users").send({ username: "karin", name: "Karin", email })).status).toBe(400);
    for (const email of [undefined, null, "", "a@b.co"]) expect((await request(a).post("/api/jigsaw-users").send({ username: "kar" + String(email).length, name: "Karin", email })).status).toBe(201);
  });

  it("lists the users by name, to choose who plays from, without their e-mail addresses", async () => {
    const a = createApp({ users: memoryUsers("zed", "anna") });
    await request(a).post("/api/jigsaw-users").send({ username: "karin", name: "karin", email: "k@example.com" });
    const list = await request(a).get("/api/jigsaw-users");
    expect(list.status).toBe(200);
    expect(list.body.map((u: { name: string }) => u.name)).toEqual(["Anna", "karin", "Zed"]);
    for (const user of list.body) expect(Object.keys(user).sort()).toEqual(["createdAt", "id", "name", "username"]);
    expect((await request(createApp({ users: memoryUsers() })).get("/api/jigsaw-users")).body).toEqual([]);
  });

  it("reads a user an earlier version made (the user name was the id, no username field) with the id as the user name", () => {
    expect(JigsawUsers.fromStored("karin", { name: "Karin", createdAt: 5 })).toEqual({ id: "karin", username: "karin", name: "Karin", createdAt: 5 });
    expect(JigsawUsers.fromStored("Xy12", { username: "karin", name: "Karin", createdAt: 5 })).toEqual({ id: "Xy12", username: "karin", name: "Karin", createdAt: 5 });
  });
});

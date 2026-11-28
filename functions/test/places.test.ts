import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { JigsawCut, JigsawPiece, JigsawPieces, JigsawSpec, PLAY_PLACES, PlayPositions, PlaySpec, Plays, STORE_LEFT } from "../src/models";
import { PUBLISHER, TEST_KEY_SECRET, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// Where the pieces of a round are saved: on the board where they are seen, in the store from `STORE_LEFT` across; and the rounds saved before that.

// a picture of 400 × 300 cut into pieces of 50: before, the store began 6 px right of the picture (at 406), and the free space beside the picture was saved under it, from 375 down, in columns 400 high, 350 apart
const jigsaw = { width: 400, height: 300, gridSize: 50 };
const piece = (col: number, row: number): JigsawPiece => ({ id: `piece-${col}-${row}`, number: row * 8 + col + 1, col, row, top: 0, right: 0, bottom: 0, left: 0, size: 50, centerX: 0, centerY: 0, layer: 1, matched: false });
const round: PlaySpec = { id: "p", jigsawId: "j", userId: "u", userName: "U", status: "active", startedAt: 1, matched: 0, total: 8, storeWidth: 300, overrides: {} };
const pieces = [piece(0, 0), piece(1, 0), piece(2, 0), piece(3, 0), piece(0, 2), piece(1, 2), piece(5, 5), piece(7, 5)];

describe("a round saved before pieces were saved where they are seen", () => {
  const before: PlayPositions = {
    "piece-0-0": [25, 25, 1], // on its own place
    "piece-1-0": [200, 340, 2], // free, under the picture
    "piece-2-0": [456, 100, 3], // in the store (50 into it)
    "piece-3-0": [100, 475, 4], // beside the picture: the first column of the free space, 100 down
    "piece-0-2": [100, 875, 5], // beside the picture: the second column
    "piece-1-2": [150, 875, 6], // stuck to the piece before it
    "piece-5-5": [-5, 100, 7], // in the margin at the left
    "piece-7-5": [431, 200, 8], // in the store, stuck to nothing
  };
  const now = Plays.currentPlaces(round, before, pieces, jigsaw);

  it("is written the way places are written now", () => {
    expect(now.play.places).toBe(PLAY_PLACES);
    expect(now.positions["piece-0-0"]).toEqual([25, 25, 1]);
    expect(now.positions["piece-1-0"]).toEqual([200, 340, 2]);
    expect(now.positions["piece-2-0"]).toEqual([STORE_LEFT + 50, 100, 3]);
    expect(now.positions["piece-3-0"]).toEqual([475, 100, 4]); // where it was seen: right of the picture
    expect(now.positions["piece-0-2"]).toEqual([825, 100, 5]);
    expect(now.positions["piece-5-5"]).toEqual([-5, 100, 7]);
    expect(now.positions["piece-7-5"]).toEqual([STORE_LEFT + 25, 200, 8]);
  });

  it("moves a group whole: what stuck together still does", () => {
    expect(now.positions["piece-1-2"]).toEqual([875, 100, 6]);
    expect(Plays.bondsError(pieces, before, now.positions)).toBe("");
  });

  it("is rewritten only once", () => {
    expect(Plays.currentPlaces(now.play, now.positions, pieces, jigsaw)).toEqual(now);
    expect(Plays.currentPlaces(now.play, now.positions, pieces, jigsaw).positions).toBe(now.positions);
  });

  it("keeps the mark when the round is stored, and a new round has it from the start", () => {
    expect(Plays.stored(now.play).places).toBe(PLAY_PLACES);
    expect("places" in Plays.stored(round)).toBe(false);
    const started = Plays.start({ id: "j", ...jigsaw }, { id: "u", name: "U" }, pieces, 1);
    if ("error" in started) throw new Error(started.error);
    expect(started.play.places).toBe(PLAY_PLACES);
    for (const [x] of Object.values(started.positions)) expect(x).toBeGreaterThan(STORE_LEFT);
  });
});

describe("the API and a round saved before", () => {
  const setup = async () => {
    const jigsaws = memoryJigsaws();
    const stores = memoryPieces();
    const plays = memoryPlays();
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, levels: PUBLISHER, jigsaw: jigsaws, jigsawPieces: stores, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna") });
    const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
    if ("error" in cut) throw new Error(cut.error);
    const made = (await request(app).post("/jigsaw/api/jigsaw").send({ name: "Harbour", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: cut.storeWidth, snapPercent: 25 })).body as JigsawSpec;
    await stores.replaceAll(made.id, JigsawPieces.ofCut(cut));
    // a round as it was saved: the store from 206 across, no mark of how places are written
    const positions: PlayPositions = Object.fromEntries(JigsawPieces.ofCut(cut).map((p, i) => [p.id, [231 + i * 5, 40 + i * 30, i + 1] as [number, number, number]]));
    const old = await plays.create(made.id, { jigsawId: made.id, userId: "anna", userName: "Anna", status: "active", startedAt: 1, matched: 0, total: 12, storeWidth: cut.storeWidth, overrides: {} }, positions);
    const url = `/jigsaw/api/jigsaw/${made.id}/plays/${old.id}`;
    return { app, plays, made, old, url };
  };

  it("shows it as places are written now, without saving", async () => {
    const { app, plays, made, old, url } = await setup();
    const got = (await request(app).get(url)).body as { pieces: JigsawPiece[] };
    expect(got.pieces.every((p) => p.centerX >= STORE_LEFT)).toBe(true);
    expect((await plays.get(made.id, old.id))!.positions[got.pieces[0].id][0]).toBeLessThan(1000);
  });

  it("rewrites all of it when a piece is saved, so old and new places are never mixed", async () => {
    const { app, plays, made, old, url } = await setup();
    const res = await request(app).patch(`${url}/positions`).set("X-Jigsaw-User", "anna").send({ moves: [{ id: "piece-0-0", centerX: 260, centerY: 75, layer: 20 }] });
    expect(res.status).toBe(200);
    const saved = (await plays.get(made.id, old.id))!;
    expect(saved.play.places).toBe(PLAY_PLACES);
    expect(saved.positions["piece-0-0"]).toEqual([260, 75, 20]); // the new place, on the board beside the picture
    expect(Object.entries(saved.positions).filter(([id]) => id !== "piece-0-0").every(([, [x]]) => x >= STORE_LEFT)).toBe(true);
  });
});

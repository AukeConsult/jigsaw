import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { JigsawCut, JigsawPiece, JigsawPieces, Plays } from "../src/models";
import type { JigsawSpec, PlaySpec } from "../src/models";
import { PUBLISHER, TEST_KEY_SECRET, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// A round is public (in the list of rounds on the front page, and among the rounds of its jigsaw for everybody) or private (only its player sees it). It is chosen when the round is started
// and can be changed by its player later. A private round is never on the front page, whoever asks.

const choices = JigsawCut.pieceChoices(1200, 800);
const small = choices[0];
const other = choices[1];
const choiceOf = (c: { columns: number; rows: number }, extra: Record<string, unknown> = {}) => ({ columns: c.columns, rows: c.rows, snapPercent: 25, ...extra });

async function setup() {
  const jigsaws = memoryJigsaws();
  const pieces = memoryPieces();
  const plays = memoryPlays();
  const clock = { t: 1_000_000 }; // the list of rounds is kept 15 seconds for each person: a test moves the clock on to see a change
  const app = createJigsawApp({ now: () => clock.t, viewKeySecret: TEST_KEY_SECRET, levels: PUBLISHER, jigsaw: jigsaws, jigsawPieces: pieces, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna", "bo") });
  const picture = (await request(app).post("/jigsaw/api/jigsaw").send({ name: "Harbour picture", kind: "picture", width: 1200, height: 800, gridSize: 0, gridVisible: false, placed: [] })).body as JigsawSpec;
  const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
  if ("error" in cut) throw new Error(cut.error);
  const ready = (await request(app).post("/jigsaw/api/jigsaw").send({ name: "Ready", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: cut.storeWidth, snapPercent: 25 })).body as JigsawSpec;
  await pieces.replaceAll(ready.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
  const base = (id: string) => `/jigsaw/api/jigsaw/${id}/plays`;
  /** a round as a player makes one: started, and a piece moved in it (a round nobody moved a piece in is not listed) */
  const started = async (jigsawId: string, userId: string, body: Record<string, unknown> = {}): Promise<PlaySpec> => {
    const res = await request(app).post(base(jigsawId)).send({ userId, ...body });
    expect(res.status).toBeLessThan(300);
    const play = res.body as PlaySpec;
    const detail = (await request(app).get(`${base(jigsawId)}/${play.id}`).set("X-Jigsaw-User", userId)).body as { pieces: JigsawPiece[] };
    const first = detail.pieces[0];
    await request(app).patch(`${base(jigsawId)}/${play.id}/positions`).set("X-Jigsaw-User", userId).send({ moves: [{ id: first.id, centerX: first.centerX, centerY: first.centerY, layer: first.layer }] });
    return play;
  };
  const get = (path: string, as?: string) => request(app).get(path).set(as ? { "X-Jigsaw-User": as } : {});
  return { app, picture, ready, base, started, get, clock };
}

describe("Plays (the model)", () => {
  it("is private or public: a private mark, taken away again", () => {
    const play = { jigsawId: "j", userId: "u" } as Omit<PlaySpec, "id">;
    expect(Plays.withPrivacy(play, true)).toMatchObject({ private: true });
    expect(Plays.withPrivacy({ ...play, private: true }, false)).not.toHaveProperty("private");
    expect(Plays.withPrivacy(play, undefined)).toEqual(play);
    expect(Plays.privateError(undefined)).toBe("");
    expect(Plays.privateError(true)).toBe("");
    expect(Plays.privateError("yes")).toMatch(/private/);
    expect(Plays.mayLookAt({ userId: "u" }, undefined)).toBe(true);
    expect(Plays.mayLookAt({ userId: "u", private: true }, "u")).toBe(true);
    expect(Plays.mayLookAt({ userId: "u", private: true }, "v")).toBe(false);
    expect(Plays.mayLookAt({ userId: "u", private: true }, undefined)).toBe(false);
    expect(Plays.mayLookAt({ userId: "u", private: true }, "v", true)).toBe(true); // an admin
  });

  it("keeps the mark when it is stored, and only when it is private", () => {
    const play = { jigsawId: "j", userId: "u", userName: "U", status: "active", startedAt: 1, matched: 0, total: 4, storeWidth: 0, overrides: {} } as Omit<PlaySpec, "id">;
    expect(Plays.stored({ ...play, private: true })).toMatchObject({ private: true });
    expect(Plays.stored(play)).not.toHaveProperty("private");
  });
});

describe("a private round", () => {
  it("is chosen at the start of a round of a picture, and is told as private", async () => {
    const { started, picture } = await setup();
    expect(await started(picture.id, "anna", choiceOf(small, { private: true }))).toMatchObject({ private: true });
    expect(await started(picture.id, "bo", choiceOf(small))).not.toHaveProperty("private");
  });

  it("is chosen for a ready jigsaw too, and refused when it is not a yes or a no", async () => {
    const { app, ready, base, started } = await setup();
    expect(await started(ready.id, "anna", { private: true })).toMatchObject({ private: true });
    expect((await request(app).post(base(ready.id)).send({ userId: "bo", private: "yes" })).status).toBe(400);
  });

  it("is not on the front page, whoever asks, while a public round is", async () => {
    const { started, picture, ready, get } = await setup();
    await started(picture.id, "anna", choiceOf(small, { private: true }));
    await started(ready.id, "bo");
    for (const asking of ["anna", "bo"]) {
      const rounds = (await get("/jigsaw/api/jigsaw-rounds", asking)).body.items as { play: PlaySpec }[];
      expect(rounds.map((r) => r.play.userId)).toEqual(["bo"]);
    }
  });

  it("is seen among the rounds of its jigsaw by its player only", async () => {
    const { started, picture, base, get } = await setup();
    const mine = await started(picture.id, "anna", choiceOf(small, { private: true }));
    await started(picture.id, "bo", choiceOf(other));
    expect(((await get(base(picture.id), "anna")).body as PlaySpec[]).map((p) => p.userId).sort()).toEqual(["anna", "bo"]);
    expect(((await get(base(picture.id), "bo")).body as PlaySpec[]).map((p) => p.userId)).toEqual(["bo"]);
    expect(((await get(base(picture.id))).body as PlaySpec[]).map((p) => p.userId)).toEqual(["bo"]);
    expect((await get(`${base(picture.id)}/${mine.id}`, "bo")).status).toBe(404); // not opened by its address either
    expect((await get(`${base(picture.id)}/${mine.id}`, "anna")).status).toBe(200);
  });

  it("is not among the games of the user for another person, but is for the user", async () => {
    const { started, picture, get } = await setup();
    await started(picture.id, "anna", choiceOf(small, { private: true }));
    expect((await get("/jigsaw/api/jigsaw-users/anna/plays", "anna")).body).toHaveLength(1);
    expect((await get("/jigsaw/api/jigsaw-users/anna/plays", "bo")).body).toHaveLength(0);
  });

  it("is made private or public again by its player only", async () => {
    const { app, started, picture, base, get, clock } = await setup();
    const round = await started(picture.id, "anna", choiceOf(small));
    const patch = (as: string | undefined, body: unknown) => {
      const r = request(app).patch(`${base(picture.id)}/${round.id}/privacy`);
      if (as) r.set("X-Jigsaw-User", as);
      return r.send(body as object);
    };
    expect((await patch("bo", { private: true })).status).toBe(403); // another player
    expect((await patch(undefined, { private: true })).status).toBe(403);
    expect((await patch("anna", { private: "yes" })).status).toBe(400);
    const made = await patch("anna", { private: true });
    expect(made.status).toBe(200);
    expect(made.body).toMatchObject({ private: true });
    expect(((await get("/jigsaw/api/jigsaw-rounds", "bo")).body.items as unknown[]).length).toBe(0);
    clock.t += 20_000;
    const back = await patch("anna", { private: false });
    expect(back.body).not.toHaveProperty("private");
    expect(((await get("/jigsaw/api/jigsaw-rounds", "bo")).body.items as unknown[]).length).toBe(1);
  });
});

describe("a round with its own table and sound", () => {
  it("is set and taken away by its player only, kept on the round, and kept when it is reset", async () => {
    const { app, started, picture, base, get } = await setup();
    const round = await started(picture.id, "anna", choiceOf(small));
    const patch = (as: string, body: object) => request(app).patch(`${base(picture.id)}/${round.id}/look`).set("X-Jigsaw-User", as).send(body);
    expect((await patch("bo", { look: { table: "wood", sound: true } })).status).toBe(403);
    expect((await patch("anna", { look: { table: "marble", sound: true } })).status).toBe(400);
    expect((await patch("anna", {})).status).toBe(400);
    expect((await patch("anna", { look: { table: "wood", sound: false, more: 1 } })).body.look).toEqual({ table: "wood", sound: false });
    await request(app).post(`${base(picture.id)}/${round.id}/restart`).set("X-Jigsaw-User", "anna");
    expect((await get(`${base(picture.id)}/${round.id}`, "anna")).body.play.look).toEqual({ table: "wood", sound: false });
    expect((await patch("anna", { look: null })).body).not.toHaveProperty("look");
  });
});


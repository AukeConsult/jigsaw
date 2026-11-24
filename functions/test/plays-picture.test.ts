import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { TEST_KEY_SECRET, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";
import { JigsawCut, JigsawIndex, JigsawPiece, JigsawPieces, JigsawSearch, PlaySpec } from "../src/models";
import type { JigsawSpec, JigsawSummary } from "../src/models";

// The routes of a round of a picture (it has a cut and a difficulty of its own, with its pieces under it) and of a normal round (which is as it always was).

const seeded = (seed = 11) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const choices = JigsawCut.pieceChoices(1200, 800);
const small = choices[0];
const big = choices[choices.length - 1];
const choiceOf = (c: { columns: number; rows: number }, snapPercent = 25) => ({ columns: c.columns, rows: c.rows, snapPercent });
const as = (app: Parameters<typeof request>[0], user: string) => request.agent(app).set("X-Jigsaw-User", user);

async function setup() {
  const jigsaws = memoryJigsaws();
  const pieces = memoryPieces();
  const plays = memoryPlays();
  const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: jigsaws, jigsawPieces: pieces, jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id), plays, users: memoryUsers("anna", "bo"), random: seeded() });
  const picture = (await request(app).post("/jigsaw/api/jigsaw").send({ name: "Harbour picture", kind: "picture", width: 1200, height: 800, gridSize: 0, gridVisible: false, placed: [] })).body as JigsawSpec;
  const cut = JigsawCut.cut(200, 150, 50, () => 0.3);
  if ("error" in cut) throw new Error(cut.error);
  const ready = (await request(app).post("/jigsaw/api/jigsaw").send({ name: "Ready", width: 200, height: 150, gridSize: 50, gridVisible: false, placed: [], storeWidth: cut.storeWidth, snapPercent: 25 })).body as JigsawSpec;
  await pieces.replaceAll(ready.id, cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []), new Map());
  return { app, jigsaws, pieces, plays, picture, ready };
}

const startUrl = (id: string) => `/jigsaw/api/jigsaw/${id}/plays`;

describe("a picture entry", () => {
  it("is stored as a picture, with no grid, store or difficulty of its own", async () => {
    const { picture } = await setup();
    expect(picture).toMatchObject({ kind: "picture", width: 1200, height: 800, gridSize: 0 });
    expect(picture).not.toHaveProperty("snapPercent");
    expect(picture).not.toHaveProperty("storeWidth");
  });

  it("is refused a grid, a store or a difficulty", async () => {
    const { app } = await setup();
    const res = await request(app).post("/jigsaw/api/jigsaw").send({ name: "P", kind: "picture", width: 1200, height: 800, gridSize: 50, gridVisible: false, placed: [] });
    expect(res.status).toBe(400);
  });

  it("has no cut of its own: no piece is put in, moved or taken away for it", async () => {
    const { app, picture, pieces } = await setup();
    expect((await request(app).get(`/jigsaw/api/jigsaw-pieces/${picture.id}`)).body).toEqual({ pieces: [] });
    for (const res of [await request(app).put(`/jigsaw/api/jigsaw-pieces/${picture.id}`).send({ pieces: [] }), await request(app).patch(`/jigsaw/api/jigsaw-pieces/${picture.id}`).send({ moves: [] }), await request(app).delete(`/jigsaw/api/jigsaw-pieces/${picture.id}`)]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/not cut/);
    }
    expect(pieces.docs.has(picture.id)).toBe(false);
  });

  it("loses its pieces when a ready jigsaw is made a picture before anybody has played it", async () => {
    const { app, ready, pieces } = await setup();
    expect(pieces.docs.get(ready.id)!.length).toBeGreaterThan(0);
    const { id, createdAt, ...input } = ready;
    const res = await request(app).put(`/jigsaw/api/jigsaw/${ready.id}`).send({ ...input, kind: "picture", width: 1200, height: 800, gridSize: 0, gridVisible: false, storeWidth: undefined, snapPercent: undefined, placed: [] });
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe("picture");
    expect(pieces.docs.get(ready.id)).toEqual([]);
  });
});

describe("a round of a picture", () => {
  it("needs the number of pieces and the difficulty, and only the numbers that are offered", async () => {
    const { app, picture } = await setup();
    expect((await request(app).post(startUrl(picture.id)).send({ userId: "anna" })).status).toBe(400);
    expect((await request(app).post(startUrl(picture.id)).send({ userId: "anna", columns: 7, rows: 5, snapPercent: 25 })).status).toBe(400);
    expect((await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small), snapPercent: 33 })).status).toBe(400);
  });

  it("is cut as chosen, keeps its cut and difficulty, and is played with the pieces kept under it", async () => {
    const { app, picture, pieces } = await setup();
    const res = await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small, 10) });
    expect(res.status).toBe(201);
    const play = res.body as PlaySpec;
    expect(play).toMatchObject({ total: small.count, snapPercent: 10, cut: { columns: small.columns, rows: small.rows }, fresh: true });
    expect(pieces.docs.has(picture.id)).toBe(false); // the picture itself has no pieces
    const detail = (await request(app).get(`${startUrl(picture.id)}/${play.id}`)).body;
    expect(detail.pieces).toHaveLength(small.count);
    expect(detail.settings.snapPercent).toBe(10);
    expect(detail.layout).toMatchObject({ width: small.columns * play.cut!.grid, height: small.rows * play.cut!.grid, gridSize: play.cut!.grid });
    const first = detail.pieces[0] as JigsawPiece;
    const moved = await as(app, "anna").patch(`${startUrl(picture.id)}/${play.id}/positions`).send({ moves: [{ id: first.id, centerX: first.centerX, centerY: first.centerY, layer: first.layer }] });
    expect(moved.status).toBe(200);
    expect(moved.body.total).toBe(small.count);
    const again = await as(app, "anna").post(`${startUrl(picture.id)}/${play.id}/restart`);
    expect(again.status).toBe(200);
    const after = (await request(app).get(`${startUrl(picture.id)}/${play.id}`)).body;
    expect(after.play).toMatchObject({ snapPercent: 10, cut: play.cut });
    expect(after.pieces).toHaveLength(small.count);
  });

  it("gives two accounts the same picture at two sizes", async () => {
    const { app, picture } = await setup();
    const a = (await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small) })).body as PlaySpec;
    const b = (await request(app).post(startUrl(picture.id)).send({ userId: "bo", ...choiceOf(big, 40) })).body as PlaySpec;
    expect(a.total).toBe(small.count);
    expect(b.total).toBe(big.count);
    const pa = (await request(app).get(`${startUrl(picture.id)}/${a.id}`)).body.pieces as JigsawPiece[];
    const pb = (await request(app).get(`${startUrl(picture.id)}/${b.id}`)).body.pieces as JigsawPiece[];
    expect(pa).toHaveLength(small.count);
    expect(pb).toHaveLength(big.count);
  });

  it("goes on with a round only opened when the choice is the same, and replaces it when it is not", async () => {
    const { app, picture, plays } = await setup();
    const first = await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small) });
    const same = await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small) });
    expect(same.status).toBe(200);
    expect(same.body.id).toBe(first.body.id);
    const other = await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(big) });
    expect(other.status).toBe(201);
    expect(other.body.id).not.toBe(first.body.id);
    expect(await plays.list(picture.id, "anna")).toHaveLength(1);
  });

  it("is not started while another round of the picture is going, and not again at a size that was solved", async () => {
    const { app, picture, plays } = await setup();
    const play = (await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small) })).body as PlaySpec;
    const first = (await request(app).get(`${startUrl(picture.id)}/${play.id}`)).body.pieces[0] as JigsawPiece;
    await as(app, "anna").patch(`${startUrl(picture.id)}/${play.id}/positions`).send({ moves: [{ id: first.id, centerX: first.centerX, centerY: first.centerY, layer: first.layer }] });
    const going = await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(big) });
    expect(going.status).toBe(409);
    expect(going.body.error).toMatch(/going/);
    await plays.update(picture.id, play.id, (cur) => ({ ...cur, play: { ...cur.play, status: "solved" } }));
    const same = await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(small) });
    expect(same.status).toBe(409);
    expect(same.body.error).toMatch(/solved/);
    expect((await request(app).post(startUrl(picture.id)).send({ userId: "anna", ...choiceOf(big) })).status).toBe(201);
  });
});

describe("a normal round, with no cut of its own, is as it always was", () => {
  it("is started with no choice, answers as before, and reads the pieces of the jigsaw", async () => {
    const { app, ready, pieces } = await setup();
    const res = await request(app).post(startUrl(ready.id)).send({ userId: "anna" });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty("cut");
    expect(res.body).not.toHaveProperty("snapPercent");
    const before = pieces.reads();
    const detail = (await request(app).get(`${startUrl(ready.id)}/${res.body.id}`)).body;
    expect(Object.keys(detail).sort()).toEqual(["pieces", "play", "settings"]); // no layout: it is the jigsaw's
    expect(pieces.reads()).toBe(before + 1);
    expect(detail.pieces).toHaveLength(12);
  });

  it("refuses a choice: the number of pieces and the difficulty are the jigsaw's", async () => {
    const { app, ready } = await setup();
    expect((await request(app).post(startUrl(ready.id)).send({ userId: "anna", columns: 4, rows: 3, snapPercent: 10 })).status).toBe(400);
  });
});

describe("a picture in the search", () => {
  const summary = (id: string, over: Partial<JigsawSummary> = {}): JigsawSummary => ({ id, name: id, width: 400, height: 300, gridSize: 50, snapPercent: 25, createdAt: 1, ...over });
  const pic = summary("pic", { kind: "picture", gridSize: 0, snapPercent: undefined, createdAt: 5 });
  const small48 = summary("s", { width: 200, height: 150, snapPercent: 10, createdAt: 3 });
  const huge = summary("h", { width: 2000, height: 1500, gridSize: 50, snapPercent: 40, createdAt: 4 });
  const base = { sort: "new" as const, limit: 36, page: 1 };

  it("is found by every size and every difficulty, since each round chooses", () => {
    expect(JigsawIndex.sizeClassesOf(pic)).toEqual(["small", "medium", "large", "huge"]);
    expect(JigsawIndex.levelsOf(pic)).toEqual(["hard", "medium", "easy"]);
    for (const sizes of [["small"], ["huge"]] as const) expect(JigsawSearch.matches(pic, { ...base, sizes: [...sizes] })).toBe(true);
    for (const difficulties of [["hard"], ["easy"]] as const) expect(JigsawSearch.matches(pic, { ...base, difficulties: [...difficulties] })).toBe(true);
    expect(JigsawSearch.matches(small48, { ...base, sizes: ["huge"] })).toBe(false);
  });

  it("counts in every size and difficulty", () => {
    const facets = JigsawSearch.facets([pic, small48, huge], base);
    expect(facets.sizes).toMatchObject({ small: 2, huge: 2 });
    expect(facets.difficulties).toMatchObject({ hard: 2, easy: 2, medium: 1 });
  });

  it("comes after the jigsaws when put in order by the number of pieces", () => {
    expect(JigsawSearch.page([pic, huge, small48], { ...base, sort: "pieces" }).items.map((j) => j.id)).toEqual(["s", "h", "pic"]);
    expect(JigsawSearch.page([pic, small48, huge], { ...base, sort: "most" }).items.map((j) => j.id)).toEqual(["h", "s", "pic"]);
  });
});

describe("the AI classification of a picture entry", () => {
  it("keeps it a picture with no grid, store or difficulty", async () => {
    const updates: Record<string, unknown>[] = [];
    const entry: JigsawSpec = { id: "jigsaw-9", name: "P", kind: "picture", width: 1200, height: 800, gridSize: 0, gridVisible: false, placed: [], createdAt: 1, ownerUid: "anna" };
    const store = {
      async list() {
        return [entry];
      },
      async add() {
        return entry;
      },
      async update(_id: string, input: Record<string, unknown>) {
        updates.push(input);
        return { ...input, id: entry.id, createdAt: 1 } as unknown as JigsawSpec;
      },
      async remove() {
        return true;
      },
    };
    const images = { async put() {}, async get() { return { data: Buffer.from("x"), mime: "image/jpeg", etag: "e" }; }, async remove() {} };
    const classifier = { classify: async () => ({ categories: ["nature"], name: "River", description: "A river." }) };
    const app = createJigsawApp({ jigsaw: store as never, jigsawImages: images, classifier, plays: memoryPlays(), users: memoryUsers("anna") });
    const res = await request(app).post("/jigsaw/api/jigsaw/jigsaw-9/classify?apply=true").set("X-Jigsaw-User", "anna");
    expect(res.status).toBe(200);
    expect(updates[0]).toMatchObject({ kind: "picture", name: "River", gridSize: 0, gridVisible: false, placed: [] });
    expect(updates[0]).not.toHaveProperty("snapPercent");
    expect(updates[0]).not.toHaveProperty("storeWidth");
  });
});

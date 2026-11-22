import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { firestoreJigsawStore } from "../src/common/jigsaw-list";
import { storageImageStore } from "../src/jigsaw/jigsaw-image";
import { firestorePieceStore } from "../src/jigsaw/jigsaw-pieces";
import { firestorePlayStore } from "../src/jigsaw/plays";
import { firestoreJigsawSearch } from "../src/jigsaw/jigsaw-search";
import { DEFAULT_OBJECT, JIGSAW, JIGSAW_PIECES, JigsawCut, JigsawPieces } from "../src/models";

// The real stores on the real Firestore emulator (npm run test:emulator, which starts it). The other tests use a small fake collection.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("the stores on the Firestore emulator", () => {
  beforeAll(() => {
    initializeApp({ projectId: "demo-canvas-test", storageBucket: "demo-canvas-test.appspot.com" });
  });

  const raw = async (collection: string, id: string) => (await getFirestore().collection(collection).doc(id).get()).data() as Record<string, any>;

  const square = { ...DEFAULT_OBJECT, width: 100, height: 100 };
  const figure = { id: "f", centerX: 200, centerY: 200, layer: 10, object: square };
  const second = { id: "g", centerX: 325, centerY: 200, layer: 10, object: square };
  const jigsaw = { name: "Real", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [figure, second] };

  it("saves a jigsaw and reads it back, newest first", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const made = await store.add({ ...jigsaw, name: "Emulator first" });
    expect(made.placed.map((p) => p.id)).toEqual(["f", "g"]);
    expect((await store.list())[0].id).toBe(made.id);
    await store.remove(made.id);
  });

  it("leaves nothing of an object that was deleted from the jigsaw, nor of anything an older version left: the document is replaced", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const made = await store.add(jigsaw);
    await getFirestore().collection(JIGSAW).doc(made.id).update({ staleField: "from an older version" });

    // the first figure is deleted on the jigsaw and the jigsaw is saved without it
    const changed = await store.update(made.id, { ...jigsaw, placed: [second] });
    const stored = await raw(JIGSAW, made.id);

    expect(stored.placed.map((p: { id: string }) => p.id)).toEqual(["g"]);
    expect(Object.keys(stored).sort()).toEqual(["createdAt", "gridSize", "gridVisible", "height", "name", "placed", "width"]);
    expect(JSON.stringify(stored)).not.toContain('"f"'); // nothing of the first figure is left
    expect(stored.createdAt).toBe(made.createdAt);
    expect(changed?.placed).toHaveLength(1);
    await store.remove(made.id);
  });

  it("loads the newest jigsaws and each owner's, at the same time, as summaries without the jigsaw's objects, each once, the newest first, no more than the limit of each", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const search = firestoreJigsawSearch(JIGSAW);
    const owner = `owner-${Date.now()}`;
    const first = await store.add({ ...jigsaw, name: "Search first", ownerUid: owner, categories: ["nature/forest"], language: "nb" });
    const second = await store.add({ ...jigsaw, name: "Search second", ownerUid: owner, visibility: "owner" });
    const third = await store.add({ ...jigsaw, name: "Search third" });
    const mine = [first.id, second.id, third.id];
    const newest = (await search.load([], 1)).map((j) => j.id);
    expect(newest).toEqual([third.id]); // the newest one overall
    const two = (await search.load([owner], 1)).map((j) => j.id);
    expect(two).toContain(third.id);
    expect(two.filter((id) => mine.includes(id)).length).toBeGreaterThanOrEqual(2); // the newest, and one of the owner's
    const all = await search.load([owner], 100);
    const found = all.filter((j) => mine.includes(j.id));
    expect(found.map((j) => j.id)).toEqual([third.id, second.id, first.id]); // each once, the newest first
    expect("placed" in found[0]).toBe(false); // only a summary is read
    expect(found.find((j) => j.id === first.id)).toMatchObject({ categories: ["nature/forest"], language: "nb" });
    expect(found.find((j) => j.id === second.id)?.visibility).toBe("owner"); // private ones are read too: who may see them is for the route
    for (const j of [first, second, third]) await store.remove(j.id);
  });

  it("counts the rounds played on a jigsaw, not the ones that are only opened", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const plays = firestorePlayStore();
    const made = await store.add(jigsaw);
    const round = { jigsawId: made.id, userId: "u", userName: "U", status: "active" as const, startedAt: 1, matched: 0, total: 4, storeWidth: 0, overrides: {} };
    expect(await plays.count(made.id)).toBe(0);
    await plays.create(made.id, round, {});
    await plays.create(made.id, round, {});
    await plays.create(made.id, { ...round, fresh: true }, {});
    expect(await plays.count(made.id)).toBe(2);
    await plays.removeAll(made.id);
    await store.remove(made.id);
  });

  it("says null for a jigsaw that is not there, and deletes one for good", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    expect(await store.update("does-not-exist", jigsaw)).toBeNull();
    const made = await store.add(jigsaw);
    expect([await store.remove(made.id), await store.remove(made.id)]).toEqual([true, false]);
    expect((await getFirestore().collection(JIGSAW).doc(made.id).get()).exists).toBe(false);
  });

  it("reads a jigsaw that an older version saved as the model says", async () => {
    await getFirestore()
      .collection(JIGSAW)
      .doc("older")
      .set({
        name: "Old",
        width: 400,
        height: 300,
        createdAt: 1,
        placed: [{ id: "o", x: 10, y: 20, object: { name: "Box", shape: "square", width: 40, height: 40, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff" } }],
      });
    const older = (await firestoreJigsawStore(JIGSAW).list()).find((c) => c.id === "older")!;
    expect([older.gridSize, older.gridVisible]).toEqual([5, true]);
    expect([older.placed[0].centerX, older.placed[0].centerY, older.placed[0].layer]).toEqual([30, 40, 10]);
    expect(older.placed[0].object).toEqual({ name: "Box", width: 40, height: 40 }); // what only the drawing tool had is left out
    expect("x" in older.placed[0]).toBe(false);
    await getFirestore().collection(JIGSAW).doc("older").delete();
  });

  it("keeps the pieces of a jigsaw under its document, their graphics and its picture in Storage, and all of it goes with the jigsaw", async () => {
    const jigsaws = firestoreJigsawStore(JIGSAW);
    const pieces = firestorePieceStore();
    const picture = storageImageStore();
    const made = await jigsaws.add({ name: "Puzzle", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [], storeWidth: 400 });
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(30, 5)]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 9)]);

    const cut = JigsawCut.cut(200, 150, 50, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    const list = cut.placed.map((p) => JigsawPieces.of(p, cut.columns)!);

    expect(await pieces.replaceAll("no-such-jigsaw", list, new Map())).toBe(false);
    expect(await pieces.replaceAll(made.id, list, new Map(list.slice(0, 2).map((p) => [p.id, { data: webp, mime: "image/webp" }])))).toBe(true);
    await picture.put(made.id, jpeg, "image/jpeg");

    // the pieces are documents under the jigsaw, with their number and status
    const docs = await getFirestore().collection(JIGSAW).doc(made.id).collection(JIGSAW_PIECES).get();
    expect(docs.size).toBe(12);
    const read = await pieces.list(made.id);
    expect(read.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(read[0]).toMatchObject({ id: "piece-0-0", col: 0, row: 0, size: 50 });
    expect(Object.keys(docs.docs[0].data())).toContain("matched");
    expect((await jigsaws.list()).find((c) => c.id === made.id)?.placed).toEqual([]); // the jigsaw document holds none of them

    // the graphics are files
    expect((await pieces.graphic(made.id, list[0].id))?.data.equals(webp)).toBe(true);
    expect(await pieces.graphic(made.id, list[5].id)).toBeNull();
    expect((await picture.get(made.id))?.data.equals(jpeg)).toBe(true);

    // moving a piece onto its own place makes it matched, moving it away makes it not matched
    const piece = read[5]; // column 1, row 1: its place is 75, 75
    await pieces.move(made.id, [{ id: piece.id, centerX: 75, centerY: 75, layer: 40 }]);
    expect((await pieces.list(made.id))[5]).toMatchObject({ centerX: 75, centerY: 75, layer: 40, matched: true });
    await pieces.move(made.id, [{ id: piece.id, centerX: 300, centerY: 20, layer: 41 }, { id: "piece-9-9", centerX: 1, centerY: 1, layer: 1 }]);
    expect((await pieces.list(made.id))[5]).toMatchObject({ centerX: 300, matched: false, number: 6 });
    expect(await pieces.list(made.id)).toHaveLength(12); // nothing was made for a piece that is not there

    // cut again: the old pieces and graphics are gone
    expect(await pieces.replaceAll(made.id, list.slice(0, 3), new Map())).toBe(true);
    expect(await pieces.list(made.id)).toHaveLength(3);
    expect(await pieces.graphic(made.id, list[0].id)).toBeNull();
    expect((await picture.get(made.id))?.data.equals(jpeg)).toBe(true); // the picture stays

    // deleting the jigsaw takes all of it
    await pieces.removeAll(made.id);
    expect(await pieces.list(made.id)).toEqual([]);
    expect(await picture.get(made.id)).toBeNull();
    await jigsaws.remove(made.id);
  });

  it("works through the API with nothing faked: picture, cut, play, reopen, delete (the app sends bytes to the API, the API writes to Storage)", async () => {
    const app = createJigsawApp(); // the real stores: Firestore and Storage on the emulators
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(40, 5)]);

    // a jigsaw is made (its settings only), its picture is sent to the API as the request body
    const made = await request(app).post("/jigsaw/api/jigsaw").send({ name: "Through the API", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect((await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/png").send(jpeg)).body).toMatchObject({ mime: "image/jpeg" }); // the type is found from the bytes
    expect((await request(app).put("/jigsaw/api/jigsaw-image/NoSuchJigsaw1").set("Content-Type", "image/jpeg").send(jpeg)).status).toBe(404);

    // cut: the pieces go to the API with their graphics
    const cut = JigsawCut.cut(200, 150, 50, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    const pieces = cut.placed.map((p) => ({ ...JigsawPieces.of(p, cut.columns)!, graphic: `data:image/webp;base64,${webp.toString("base64")}` }));
    const put = await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.body).toEqual({ pieces: 12, graphics: 12 });

    // play: one piece is put on its own place
    const own = pieces.find((p) => p.number === 6)!; // column 1, row 1: its place is 75, 75
    expect((await request(app).patch(`/jigsaw/api/jigsaw-pieces/${id}`).send({ moves: [{ id: own.id, centerX: 75, centerY: 75, layer: 50 }] })).status).toBe(200);

    // reopen: the game is as it was left
    const list = (await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}`)).body.pieces as { id: string; number: number; matched: boolean; layer: number }[];
    expect(list).toHaveLength(12);
    expect(list.filter((p) => p.matched).map((p) => p.number)).toEqual([6]);
    expect(list.find((p) => p.id === own.id)?.layer).toBe(50);
    const graphic = await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}/graphic/${own.id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(graphic.headers["content-type"]).toBe("image/webp");
    expect((graphic.body as Buffer).equals(webp)).toBe(true);
    expect((await request(app).head(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(200);

    // delete the jigsaw: its pieces, their graphics and its picture go with it
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${id}`)).status).toBe(204);
    expect((await getFirestore().collection(JIGSAW).doc(id).collection(JIGSAW_PIECES).get()).size).toBe(0);
    expect((await request(app).get(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(404);
    expect((await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}/graphic/${own.id}`)).status).toBe(404);
  });
});

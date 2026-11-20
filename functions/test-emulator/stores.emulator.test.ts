import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { firestoreCanvasStore } from "../src/canvas-list";
import { firestoreCanvasObjectStore } from "../src/canvas-objects";
import { storageImageStore } from "../src/jigsaw-image";
import { firestorePieceStore } from "../src/jigsaw-pieces";
import { CANVAS_LIST, CANVAS_OBJECTS, DEFAULT_CONNECTOR, DEFAULT_OBJECT, JIGSAW, JIGSAW_PIECES, JigsawCut, JigsawPieces } from "../src/models";

// The real stores on the real Firestore emulator (npm run test:emulator, which starts it). The other tests use a small fake collection.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("the stores on the Firestore emulator", () => {
  beforeAll(() => {
    initializeApp({ projectId: "demo-canvas-test", storageBucket: "demo-canvas-test.appspot.com" });
  });

  const raw = async (collection: string, id: string) => (await getFirestore().collection(collection).doc(id).get()).data() as Record<string, any>;

  const square = { ...DEFAULT_OBJECT, width: 100, height: 100 };
  const figure = { id: "f", centerX: 200, centerY: 200, layer: 10, object: square };
  const arrow = { id: "a", centerX: 325, centerY: 200, layer: 10, bend: 20, object: { ...DEFAULT_CONNECTOR, width: 150 }, connections: { start: { objectId: "f", pointId: "e" } } };
  const canvas = { name: "Real", width: 800, height: 600, gridSize: 5, gridVisible: true, placed: [figure, arrow] };

  it("saves a canvas and reads it back, newest first", async () => {
    const store = firestoreCanvasStore();
    const made = await store.add({ ...canvas, name: "Emulator first" });
    expect(made.placed.map((p) => p.id)).toEqual(["f", "a"]);
    expect((await store.list())[0].id).toBe(made.id);
    await store.remove(made.id);
  });

  it("leaves nothing of an object that was deleted from the canvas, nor of anything an older version left: the document is replaced", async () => {
    const store = firestoreCanvasStore();
    const made = await store.add(canvas);
    await getFirestore().collection(CANVAS_LIST).doc(made.id).update({ staleField: "from an older version" });

    // the figure is deleted on the canvas: the arrow is free again and the canvas is saved without the figure
    const { connections: _gone, ...freed } = arrow;
    const changed = await store.update(made.id, { ...canvas, placed: [freed] });
    const stored = await raw(CANVAS_LIST, made.id);

    expect(stored.placed.map((p: { id: string }) => p.id)).toEqual(["a"]);
    expect(Object.keys(stored).sort()).toEqual(["createdAt", "gridSize", "gridVisible", "height", "name", "placed", "width"]);
    expect(JSON.stringify(stored)).not.toContain('"objectId"'); // nothing says the arrow was ever fastened to the figure
    expect(stored.createdAt).toBe(made.createdAt);
    expect(stored.placed[0].bend).toBe(20);
    expect(changed?.placed).toHaveLength(1);
    await store.remove(made.id);
  });

  it("says null for a canvas that is not there, and deletes one for good", async () => {
    const store = firestoreCanvasStore();
    expect(await store.update("does-not-exist", canvas)).toBeNull();
    const made = await store.add(canvas);
    expect([await store.remove(made.id), await store.remove(made.id)]).toEqual([true, false]);
    expect((await getFirestore().collection(CANVAS_LIST).doc(made.id).get()).exists).toBe(false);
  });

  it("reads a canvas that an older version saved as the model says", async () => {
    await getFirestore()
      .collection(CANVAS_LIST)
      .doc("older")
      .set({
        name: "Old",
        width: 400,
        height: 300,
        createdAt: 1,
        placed: [{ id: "o", x: 10, y: 20, object: { name: "Box", shape: "square", width: 40, height: 40, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff" } }],
      });
    const older = (await firestoreCanvasStore().list()).find((c) => c.id === "older")!;
    expect([older.gridSize, older.gridVisible]).toEqual([5, true]);
    expect([older.placed[0].centerX, older.placed[0].centerY, older.placed[0].layer]).toEqual([30, 40, 10]);
    expect(older.placed[0].object.kind).toBe("figure");
    expect("x" in older.placed[0]).toBe(false);
    await getFirestore().collection(CANVAS_LIST).doc("older").delete();
  });

  it("replaces an object's document too, and reads an older object with its defaults", async () => {
    const store = firestoreCanvasObjectStore();
    const made = await store.add({ ...DEFAULT_OBJECT, name: "Obj" });
    await getFirestore().collection(CANVAS_OBJECTS).doc(made.id).update({ oldSetting: 1 });
    const renamed = await store.update(made.id, { ...DEFAULT_OBJECT, name: "Renamed", width: 120, height: 120 });
    const stored = await raw(CANVAS_OBJECTS, made.id);
    expect(renamed?.name).toBe("Renamed");
    expect(stored.createdAt).toBe(made.createdAt);
    expect("oldSetting" in stored).toBe(false);

    await getFirestore()
      .collection(CANVAS_OBJECTS)
      .doc("older")
      .set({ name: "Older", shape: "circle", width: 50, height: 50, borderWidth: 1, borderColor: "#000000", backgroundColor: "#ffffff", frontColor: "#0000ff", createdAt: 2 });
    const older = (await store.list()).find((o) => o.id === "older")!;
    expect([older.kind, older.arrow, older.arrowStyle, older.fontSize, older.cornerRadius]).toEqual(["figure", "one-way", "solid", 16, 0]);
    await store.remove(made.id);
    await getFirestore().collection(CANVAS_OBJECTS).doc("older").delete();
  });

  it("keeps the pieces of a jigsaw under its document, their graphics and its picture in Storage, and all of it goes with the jigsaw", async () => {
    const jigsaws = firestoreCanvasStore(JIGSAW);
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
    const app = createApp(); // the real stores: Firestore and Storage on the emulators
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(40, 5)]);

    // a jigsaw is made (its settings only), its picture is sent to the API as the request body
    const made = await request(app).post("/api/jigsaw").send({ name: "Through the API", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect((await request(app).put(`/api/jigsaw-image/${id}`).set("Content-Type", "image/png").send(jpeg)).body).toMatchObject({ mime: "image/jpeg" }); // the type is found from the bytes
    expect((await request(app).put("/api/jigsaw-image/NoSuchJigsaw1").set("Content-Type", "image/jpeg").send(jpeg)).status).toBe(404);

    // cut: the pieces go to the API with their graphics
    const cut = JigsawCut.cut(200, 150, 50, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    const pieces = cut.placed.map((p) => ({ ...JigsawPieces.of(p, cut.columns)!, graphic: `data:image/webp;base64,${webp.toString("base64")}` }));
    const put = await request(app).put(`/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.body).toEqual({ pieces: 12, graphics: 12 });

    // play: one piece is put on its own place
    const own = pieces.find((p) => p.number === 6)!; // column 1, row 1: its place is 75, 75
    expect((await request(app).patch(`/api/jigsaw-pieces/${id}`).send({ moves: [{ id: own.id, centerX: 75, centerY: 75, layer: 50 }] })).status).toBe(200);

    // reopen: the game is as it was left
    const list = (await request(app).get(`/api/jigsaw-pieces/${id}`)).body.pieces as { id: string; number: number; matched: boolean; layer: number }[];
    expect(list).toHaveLength(12);
    expect(list.filter((p) => p.matched).map((p) => p.number)).toEqual([6]);
    expect(list.find((p) => p.id === own.id)?.layer).toBe(50);
    const graphic = await request(app).get(`/api/jigsaw-pieces/${id}/graphic/${own.id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(graphic.headers["content-type"]).toBe("image/webp");
    expect((graphic.body as Buffer).equals(webp)).toBe(true);
    expect((await request(app).head(`/api/jigsaw-image/${id}`)).status).toBe(200);

    // delete the jigsaw: its pieces, their graphics and its picture go with it
    expect((await request(app).delete(`/api/jigsaw/${id}`)).status).toBe(204);
    expect((await getFirestore().collection(JIGSAW).doc(id).collection(JIGSAW_PIECES).get()).size).toBe(0);
    expect((await request(app).get(`/api/jigsaw-image/${id}`)).status).toBe(404);
    expect((await request(app).get(`/api/jigsaw-pieces/${id}/graphic/${own.id}`)).status).toBe(404);
  });
});

import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { beforeAll, describe, expect, it } from "vitest";
import { firestoreCanvasStore } from "../src/canvas-list";
import { firestoreCanvasObjectStore } from "../src/canvas-objects";
import { CANVAS_LIST, CANVAS_OBJECTS, DEFAULT_CONNECTOR, DEFAULT_OBJECT } from "../src/models";

// The real stores on the real Firestore emulator (npm run test:emulator, which starts it). The other tests use a small fake collection.
describe.skipIf(!process.env.FIRESTORE_EMULATOR_HOST)("the stores on the Firestore emulator", () => {
  beforeAll(() => {
    initializeApp({ projectId: "demo-canvas-test" });
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
});

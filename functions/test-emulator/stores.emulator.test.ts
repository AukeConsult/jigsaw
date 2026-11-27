import { initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import request from "supertest";
import { beforeAll, describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { firestoreJigsawStore } from "../src/common/jigsaw-list";
import { storageImageStore } from "../src/jigsaw/jigsaw-image";
import { firestorePieceStore } from "../src/jigsaw/jigsaw-pieces";
import { firestorePlayStore } from "../src/jigsaw/plays";
import { firestoreUserStore } from "../src/jigsaw/jigsaw-users";
import { firestoreJigsawSearch } from "../src/jigsaw/jigsaw-search";
import { DEFAULT_OBJECT, JIGSAW, JIGSAW_PIECES, JigsawCut, JigsawPieces, JigsawFilters, DEFAULT_PLAY_LOOK, DEFAULT_TEXT_LOOK } from "../src/models";

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

  it("reads the heads of the jigsaws without what is placed on their boards, and changes one after looking at only its creation time", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const made = await store.add(jigsaw);
    const head = (await store.heads!()).find((j) => j.id === made.id)!;
    expect(head).toMatchObject({ name: "Real", width: 800, gridSize: 5, createdAt: made.createdAt });
    expect(head.placed).toEqual([]); // the objects are not read
    expect((await store.get!(made.id))!.placed).toHaveLength(2); // the one jigsaw has them
    const changed = await store.update(made.id, { ...jigsaw, name: "Changed" });
    expect(changed).toMatchObject({ name: "Changed", createdAt: made.createdAt });
    expect((await raw(JIGSAW, made.id)).createdAt).toBe(made.createdAt);
    await store.remove(made.id);
  });

  it("finds the rounds of a user on every jigsaw in one question, and counts the played ones without reading them", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const plays = firestorePlayStore();
    const one = await store.add(jigsaw);
    const two = await store.add(jigsaw);
    const round = (userId: string) => ({ jigsawId: "-", userId, userName: userId, status: "active" as const, startedAt: 1, matched: 0, total: 4, storeWidth: 0, overrides: {} });
    await plays.create(one.id, round("zed"), {});
    await plays.create(two.id, round("zed"), {});
    await plays.create(two.id, { ...round("zed"), fresh: true }, {});
    await plays.create(two.id, round("other"), {});
    const found = await plays.listOfUser("zed");
    expect(found.map((r) => r.jigsawId).sort()).toEqual([one.id, two.id, two.id].sort());
    expect(await plays.listOfUser("nobody-at-all")).toEqual([]);
    expect([await plays.count(one.id), await plays.count(two.id)]).toEqual([1, 2]); // the opened one is not counted
    expect([await plays.has(one.id), await plays.has("none")]).toEqual([true, false]);
    for (const id of [one.id, two.id]) {
      await plays.removeAll(id);
      await store.remove(id);
    }
  });

  it("writes every setting of a change of a user, and nothing it was not given", async () => {
    const users = firestoreUserStore();
    const made = await users.create({ username: "change-test", name: "Change", language: "en", createdAt: 1 });
    const settings = { name: "Changed", username: "changed-test", language: "nb", listFilter: JigsawFilters.empty(), playLook: { ...DEFAULT_PLAY_LOOK, sound: false }, textLook: DEFAULT_TEXT_LOOK, tileSize: "large" as const, labelSize: "small" as const, tileDetails: false };
    const changed = await users.update(made!.id, { ...settings, lastUsedAt: 5, pictureAt: 7 });
    expect(changed).toMatchObject({ ...settings, lastUsedAt: 5, pictureAt: 7 });
    expect(await users.get(made!.id)).toEqual(changed);
    const without = await users.update(made!.id, { pictureAt: null });
    expect(without).not.toHaveProperty("pictureAt");
    await users.remove(made!.id);
  });

  it("lists the ids of the users with no field read", async () => {
    const users = firestoreUserStore();
    const made = await users.create({ username: "ids-test", name: "Ids", language: "en", createdAt: 1 });
    expect(await users.ids!()).toContain(made!.id);
    await users.remove(made!.id);
  });

  it("keeps the pieces of a round that has a cut of its own under the round, and takes them away with it", async () => {
    const store = firestoreJigsawStore(JIGSAW);
    const plays = firestorePlayStore();
    const made = await store.add({ ...jigsaw, kind: "picture", gridSize: 0, gridVisible: false, placed: [] });
    const cut = JigsawCut.cut(1000, 800, 100, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    const pieces = cut.placed.flatMap((p) => JigsawPieces.of(p, cut.columns) ?? []); // 80 pieces
    const round = { jigsawId: made.id, userId: "u", userName: "U", status: "active" as const, startedAt: 1, matched: 0, total: pieces.length, storeWidth: 300, overrides: {}, cut: { columns: 10, rows: 8, grid: 100 }, snapPercent: 10 };
    const saved = await plays.create(made.id, round, {}, pieces);
    expect((await plays.roundPieces(made.id, saved.id)).map((p) => p.number)).toEqual(pieces.map((p) => p.number).sort((a, b) => a - b));
    expect((await plays.get(made.id, saved.id))!.play).toMatchObject({ cut: { columns: 10, rows: 8, grid: 100 }, snapPercent: 10 });
    expect(await plays.roundPieces(made.id, "no-such-round")).toEqual([]);
    await plays.remove(made.id, saved.id);
    expect(await plays.roundPieces(made.id, saved.id)).toEqual([]); // they went with the round
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

  it("keeps the pieces of a jigsaw under its document and its picture in Storage, and all of it goes with the jigsaw", async () => {
    const jigsaws = firestoreJigsawStore(JIGSAW);
    const pieces = firestorePieceStore();
    const picture = storageImageStore();
    const made = await jigsaws.add({ name: "Puzzle", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [], storeWidth: 400 });
    const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(30, 5)]);
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 9)]);

    const cut = JigsawCut.cut(200, 150, 50, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    const list = cut.placed.map((p) => JigsawPieces.of(p, cut.columns)!);

    expect(await pieces.replaceAll("no-such-jigsaw", list)).toBe(false);
    expect(await pieces.replaceAll(made.id, list)).toBe(true);
    await picture.put(made.id, jpeg, "image/jpeg");

    // the pieces are documents under the jigsaw, with their number and status
    const docs = await getFirestore().collection(JIGSAW).doc(made.id).collection(JIGSAW_PIECES).get();
    expect(docs.size).toBe(12);
    const read = await pieces.list(made.id);
    expect(read.map((p) => p.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(read[0]).toMatchObject({ id: "piece-0-0", col: 0, row: 0, size: 50 });
    expect(Object.keys(docs.docs[0].data())).toContain("matched");
    expect((await jigsaws.list()).find((c) => c.id === made.id)?.placed).toEqual([]); // the jigsaw document holds none of them

    // the picture is a file
    expect((await picture.get(made.id))?.data.equals(jpeg)).toBe(true);

    // cut again: the old pieces are gone
    expect(await pieces.replaceAll(made.id, list.slice(0, 3))).toBe(true);
    expect(await pieces.list(made.id)).toHaveLength(3);
    expect((await picture.get(made.id))?.data.equals(jpeg)).toBe(true); // the picture stays

    // deleting the jigsaw takes all of it
    await pieces.removeAll(made.id);
    expect(await pieces.list(made.id)).toEqual([]);
    expect(await picture.get(made.id)).toBeNull();
    await jigsaws.remove(made.id);
  });

  it("works through the API with nothing faked: picture, cut, play, reopen, delete (the app sends bytes to the API, the API writes to Storage)", async () => {
    const app = createJigsawApp({ levels: { of: async () => "publisher", forget() {} } }); // the real stores: Firestore and Storage on the emulators; the caller may make a public jigsaw (a rule of the levels, tested in `user-levels.test.ts`)
    const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);

    // a jigsaw is made (its settings only), its picture is sent to the API as the request body
    const made = await request(app).post("/jigsaw/api/jigsaw").send({ name: "Through the API", width: 200, height: 150, gridSize: 50, gridVisible: true, placed: [] });
    expect(made.status).toBe(201);
    const id = made.body.id as string;
    expect((await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/png").send(jpeg)).body).toMatchObject({ mime: "image/jpeg" }); // the type is found from the bytes
    expect((await request(app).put("/jigsaw/api/jigsaw-image/NoSuchJigsaw1").set("Content-Type", "image/jpeg").send(jpeg)).status).toBe(404);

    // cut: the pieces go to the API
    const cut = JigsawCut.cut(200, 150, 50, () => 0.4);
    if ("error" in cut) throw new Error(cut.error);
    const pieces = cut.placed.map((p) => JigsawPieces.of(p, cut.columns)!);
    const own = pieces.find((p) => p.number === 6)!; // column 1, row 1: its place is 75, 75
    Object.assign(own, { centerX: 75, centerY: 75, layer: 50 }); // sent lying on its own place
    const put = await request(app).put(`/jigsaw/api/jigsaw-pieces/${id}`).send({ pieces });
    expect(put.body).toEqual({ pieces: 12 });

    // reopen: the game is as it was left
    const list = (await request(app).get(`/jigsaw/api/jigsaw-pieces/${id}`)).body.pieces as { id: string; number: number; matched: boolean; layer: number }[];
    expect(list).toHaveLength(12);
    expect(list.filter((p) => p.matched).map((p) => p.number)).toEqual([6]);
    expect(list.find((p) => p.id === own.id)?.layer).toBe(50);
    expect((await request(app).head(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(200);

    // delete the jigsaw: its pieces and its picture go with it
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${id}`)).status).toBe(204);
    expect((await getFirestore().collection(JIGSAW).doc(id).collection(JIGSAW_PIECES).get()).size).toBe(0);
    expect((await request(app).get(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(404);
  });

  it("works through the API with the real users: a first admin is made, a private picture of a verified account is found by it, and an admin changes the account of another at once", async () => {
    // the real stores of Firestore and Storage; only the check of the Firebase token and the directory of logins are the tests' own (no Firebase Auth runs here)
    const token = (uid: string) => ({ uid, email: `${uid}@example.com`, email_verified: true, firebase: { sign_in_provider: "google.com" } });
    const verifier = { async verify(t: string) { if (!["tok-a", "tok-b"].includes(t)) throw new Error("bad token"); return token(t === "tok-a" ? "fb-a" : "fb-b"); } };
    const accounts = { async sync() { throw new Error("not used"); }, async read() { return {}; } };
    const directory = { async gone() { return []; } };
    const app = createJigsawApp({ logons: { verifier, accounts, directory } as never });
    const api = (method: "get" | "put" | "post" | "delete", path: string, as?: string, tok?: string) => {
      const r = request(app)[method](`/jigsaw/api${path}`);
      if (as) r.set("X-Jigsaw-User", as);
      if (tok) r.set("Authorization", `Bearer ${tok}`);
      return r;
    };
    const suffix = Date.now().toString(36);
    const made = async (name: string, uid?: string) => {
      const res = await api("post", "/jigsaw-users").send({ username: `${name}-${suffix}`, name: `Emulator ${name}` });
      expect(res.status).toBe(201);
      if (uid) await firestoreUserStore().changeLogons(res.body.id, () => [uid]); // verified for a login (the logon routes need Firebase Auth; this is what they write)
      return res.body.id as string;
    };
    const first = await made("first", "fb-a");
    const second = await made("second", "fb-b");
    const open = await made("open");
    // nothing is an admin yet (the data of other tests is not): the page asks, and the first account may make itself one
    const before = await api("get", "/jigsaw-levels/open");
    expect(before.status).toBe(200);
    const rename = (target: string) => api("put", `/jigsaw-users/${target}`, first, "tok-a").send({ name: "Renamed by an admin" });
    if (before.body.open) {
      expect((await rename(second)).status).toBe(403); // not an admin, the account of another is locked to its own login
      expect((await api("put", `/jigsaw-levels/${first}`, first, "tok-a").send({ level: "admin" })).status).toBe(200);
    } else {
      await firestoreUserStore().update(first, { level: "admin" }); // another test left an admin: the first account is made one directly
    }
    expect((await api("get", "/jigsaw-users/" + first)).body.level).toBe("admin"); // kept in Firestore, told to the page
    expect((await rename(second)).status).toBe(200); // at once: the gate did not keep the answer from before
    expect((await rename(open)).status).toBe(200); // an account with no login
    expect((await raw("jigsaw-users", second)).name).toBe("Renamed by an admin");
    // the level goes with the last login: an account that is open again has none (the next login to verify it must not find one)
    await firestoreUserStore().changeLogons(first, () => []);
    expect((await raw("jigsaw-users", first)).level).toBeUndefined();
    expect((await raw("jigsaw-users", first)).firebaseUids).toBeUndefined();
    // a private picture of a verified account is found by that account, not by others
    await firestoreUserStore().changeLogons(second, () => ["fb-b"]);
    const picture = await api("post", "/jigsaw", second, "tok-b").send({ name: `Private ${suffix}`, kind: "picture", width: 1200, height: 800, gridSize: 0, gridVisible: false, placed: [], ownerUid: second, visibility: "owner" });
    expect(picture.status).toBe(201); // private is for every account (public is for a publisher)
    const found = async (as?: string, tok?: string) => ((await api("get", "/jigsaw-search?limit=50", as, tok)).body.items as { id: string }[]).map((j) => j.id);
    expect(await found(second, "tok-b")).toContain(picture.body.id);
    expect(await found(open)).not.toContain(picture.body.id);
    expect(await found()).not.toContain(picture.body.id);
    await api("delete", `/jigsaw/${picture.body.id}`, second, "tok-b");
    for (const id of [first, second, open]) await api("delete", `/jigsaw-users/${id}`, id === second ? second : undefined, id === second ? "tok-b" : undefined); // what the test made is taken away again
  });
});

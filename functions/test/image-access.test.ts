import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import type { JigsawSearchStore } from "../src/jigsaw/jigsaw-search";
import { ImageStore, Picture, etagOf } from "../src/jigsaw/jigsaw-image";
import type { PieceStore } from "../src/jigsaw/jigsaw-pieces";
import { VIEW_KEY_BUCKET_MS, ViewKeys } from "../src/jigsaw/view-key";
import { JigsawIndex } from "../src/models";
import type { JigsawSpec } from "../src/models";
import { TEST_KEY_SECRET, memoryPlays, memoryUsers, PUBLISHER } from "./memory-plays";

// Who may read the pictures of a jigsaw: a jigsaw that everybody sees, as before; one that is private or hidden only with its key, which the answers about the jigsaw give to those who may
// see it. Nothing here needs a login or even a user: the rules are the ones of the jigsaw (`canSee`: the owner, or a player with a round).

const PUBLIC = "pub-aaaaaaaa";
const PRIVATE = "priv-bbbbbbb";
const HIDDEN = "hid-cccccccc";
const SECRET = "test-secret-test-secret-test-secret-1";

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]);

function jigsawOf(id: string, visibility: JigsawSpec["visibility"], createdAt: number): JigsawSpec {
  return { id, name: id, width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], createdAt, ownerUid: "u1", ...(visibility ? { visibility } : {}) };
}

/** the jigsaws in memory, with a count of the questions about one jigsaw (`get`) and a way to make that question fail */
function memoryJigsaws() {
  const items = new Map<string, JigsawSpec>([PUBLIC, PRIVATE, HIDDEN].map((id, i) => [id, jigsawOf(id, id === PUBLIC ? "everyone" : id === PRIVATE ? "owner" : "hidden", i + 1)]));
  const state = { asked: 0, failing: false };
  const store: JigsawStore = {
    async list() {
      return [...items.values()];
    },
    async get(id) {
      state.asked++;
      if (state.failing) throw new Error("the database is not there");
      return items.get(id) ?? null;
    },
    async add(input) {
      const made = { ...input, id: "made-dddddddd", createdAt: 9 } as JigsawSpec;
      items.set(made.id, made);
      return made;
    },
    async update(id, input) {
      const was = items.get(id);
      if (!was) return null;
      const next = { ...input, id, createdAt: was.createdAt } as JigsawSpec;
      items.set(id, next);
      return next;
    },
    async remove(id) {
      return items.delete(id);
    },
  };
  return { items, state, store };
}

function memoryImages(ids: string[]) {
  const store: ImageStore = {
    async put() {},
    async get(id): Promise<Picture | null> {
      return ids.includes(id) ? { data: jpeg, mime: "image/jpeg", etag: etagOf(jpeg) } : null;
    },
    async remove() {},
  };
  return store;
}

/** pieces with a graphic for every jigsaw and piece id asked for */
const pieces = { graphic: async () => ({ data: jpeg, mime: "image/jpeg", etag: etagOf(jpeg) }), removeAll: async () => undefined, list: async () => [] } as unknown as PieceStore;

function setup() {
  const jigsaws = memoryJigsaws();
  const plays = memoryPlays();
  const clock = { now: 1000 * VIEW_KEY_BUCKET_MS };
  const search: JigsawSearchStore = { load: async () => [...jigsaws.items.values()].map((j) => JigsawIndex.summaryOf(j.id, j as unknown as Record<string, unknown>)), forget() {} };
  const app = createJigsawApp({ levels: PUBLISHER,
    jigsaw: jigsaws.store,
    jigsawImages: memoryImages([PUBLIC, PRIVATE, HIDDEN, "made-dddddddd"]),
    jigsawPieces: pieces,
    jigsawSearch: search,
    plays,
    users: memoryUsers("u1", "u2", "u3"),
    viewKeySecret: TEST_KEY_SECRET,
    now: () => clock.now,
  });
  return { app, plays, clock, ...jigsaws };
}

const as = (user: string | undefined) => (user ? { "X-Jigsaw-User": user } : {});
const get = (app: ReturnType<typeof setup>["app"], path: string, user?: string) => request(app).get(`/jigsaw/api${path}`).set(as(user));

/** a round of u2 on the private jigsaw: u2 is a player, not the owner */
async function u2PlaysPrivate(plays: ReturnType<typeof memoryPlays>) {
  await plays.create(PRIVATE, { userId: "u2", userName: "U2", startedAt: 1, status: "playing" } as never, "{}" as never);
}

describe("the key of the pictures (ViewKeys)", () => {
  const at = (ms: number) => new ViewKeys(TEST_KEY_SECRET, () => ms);
  const start = 1000 * VIEW_KEY_BUCKET_MS;

  it("is the same for the whole stretch of time, so the address of a picture stays the same", async () => {
    expect(await at(start).keyFor("abcdefgh")).toBe(await at(start + VIEW_KEY_BUCKET_MS - 1).keyFor("abcdefgh"));
    expect(await at(start).keyFor("abcdefgh")).not.toBe(await at(start + VIEW_KEY_BUCKET_MS).keyFor("abcdefgh"));
  });

  it("is for one jigsaw only", async () => {
    const key = await at(start).keyFor("abcdefgh");
    expect(await at(start).accepts("abcdefgh", key)).toBe(true);
    expect(await at(start).accepts("ijklmnop", key)).toBe(false);
  });

  it("works for the stretch it was made in and the next one, and not after that", async () => {
    const key = await at(start).keyFor("abcdefgh");
    expect(await at(start + VIEW_KEY_BUCKET_MS).accepts("abcdefgh", key)).toBe(true);
    expect(await at(start + 2 * VIEW_KEY_BUCKET_MS).accepts("abcdefgh", key)).toBe(false);
  });

  it("is not made by somebody who does not have the secret, and is refused when it is changed or not a key", async () => {
    const other = new ViewKeys(async () => "another-secret-another-secret-another-1", () => start);
    expect(await at(start).accepts("abcdefgh", await other.keyFor("abcdefgh"))).toBe(false);
    const key = await at(start).keyFor("abcdefgh");
    expect(await at(start).accepts("abcdefgh", `${key.slice(0, -1)}${key.endsWith("A") ? "B" : "A"}`)).toBe(false);
    for (const bad of [undefined, "", "x", "1.2", 5, ["a"], `${key}extra`]) expect(await at(start).accepts("abcdefgh", bad)).toBe(false);
  });
});

describe("the pictures of a jigsaw everybody sees", () => {
  it("are read by anybody, with no user and no key, as before", async () => {
    const { app } = setup();
    expect((await get(app, `/jigsaw-image/${PUBLIC}`)).status).toBe(200);
    expect((await request(app).head(`/jigsaw/api/jigsaw-image/${PUBLIC}`)).status).toBe(200);
    expect((await get(app, `/jigsaw-pieces/${PUBLIC}/graphic/piece-0001`)).status).toBe(200);
  });

  it("have no key in the answers about the jigsaw", async () => {
    const { app } = setup();
    expect((await get(app, `/jigsaw/${PUBLIC}`)).body).not.toHaveProperty("imageKey");
    expect((await get(app, "/jigsaw", "u1")).body.find((j: JigsawSpec) => j.id === PUBLIC)).not.toHaveProperty("imageKey");
  });

  it("are read when the user that is asking does not exist, or the header is only a text", async () => {
    const { app } = setup();
    expect((await get(app, `/jigsaw-image/${PUBLIC}`, "nobody-at-all")).status).toBe(200);
    expect((await get(app, `/jigsaw/${PUBLIC}`, "nobody-at-all")).status).toBe(200);
  });
});

describe("the pictures of a private or hidden jigsaw", () => {
  it("are not there without a key (404, as for a picture that does not exist), with no user and for a stranger", async () => {
    const { app } = setup();
    for (const id of [PRIVATE, HIDDEN]) {
      expect((await get(app, `/jigsaw-image/${id}`)).status).toBe(404);
      expect((await get(app, `/jigsaw-image/${id}`, "u3")).status).toBe(404);
      expect((await request(app).head(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(404);
      expect((await get(app, `/jigsaw-pieces/${id}/graphic/piece-0001`)).status).toBe(404);
    }
  });

  it("are read with the key that the owner is given when the jigsaw is opened, also the graphics of the pieces and with HEAD", async () => {
    const { app } = setup();
    for (const id of [PRIVATE, HIDDEN]) {
      const key = (await get(app, `/jigsaw/${id}`, "u1")).body.imageKey as string;
      expect(key).toMatch(/^\d+\.[A-Za-z0-9_-]{22}$/);
      expect((await get(app, `/jigsaw-image/${id}?v=1&k=${key}`)).status).toBe(200);
      expect((await request(app).head(`/jigsaw/api/jigsaw-image/${id}?k=${key}`)).status).toBe(200);
      expect((await get(app, `/jigsaw-pieces/${id}/graphic/piece-0001?k=${key}`)).status).toBe(200);
    }
  });

  it("are not read with a wrong key, with the key of another jigsaw, or with a key that has run out", async () => {
    const { app, clock } = setup();
    const key = (await get(app, `/jigsaw/${PRIVATE}`, "u1")).body.imageKey as string;
    const hiddenKey = (await get(app, `/jigsaw/${HIDDEN}`, "u1")).body.imageKey as string;
    expect((await get(app, `/jigsaw-image/${PRIVATE}?k=${hiddenKey}`)).status).toBe(404);
    expect((await get(app, `/jigsaw-image/${PRIVATE}?k=${key.slice(0, -2)}xx`)).status).toBe(404);
    expect((await get(app, `/jigsaw-image/${PRIVATE}?k=`)).status).toBe(404);
    clock.now += VIEW_KEY_BUCKET_MS;
    expect((await get(app, `/jigsaw-image/${PRIVATE}?k=${key}`)).status).toBe(200); // still good in the next stretch
    clock.now += VIEW_KEY_BUCKET_MS;
    expect((await get(app, `/jigsaw-image/${PRIVATE}?k=${key}`)).status).toBe(404); // and then it has run out
  });

  it("are read with a good key without asking about the jigsaw (a round reads many graphics)", async () => {
    const { app, state } = setup();
    const key = (await get(app, `/jigsaw/${PRIVATE}`, "u1")).body.imageKey as string;
    const before = state.asked;
    for (let i = 0; i < 20; i++) expect((await get(app, `/jigsaw-pieces/${PRIVATE}/graphic/piece-${1000 + i}?k=${key}`)).status).toBe(200);
    expect(state.asked).toBe(before);
  });

  it("are not given when the question about the jigsaw cannot be answered: never let a picture through because it could not be asked", async () => {
    const { app, state } = setup();
    state.failing = true;
    expect((await get(app, `/jigsaw-image/${PRIVATE}`)).status).toBe(503);
    expect((await get(app, `/jigsaw-image/${PUBLIC}`)).status).toBe(503);
  });

  it("follow the jigsaw when it is made public: the very next picture is read without a key", async () => {
    const { app } = setup();
    expect((await get(app, `/jigsaw-image/${PRIVATE}`)).status).toBe(404); // the answer is kept for a moment ...
    const body = { name: "Now public", width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], ownerUid: "u1", visibility: "everyone" };
    expect((await request(app).put(`/jigsaw/api/jigsaw/${PRIVATE}`).set(as("u1")).send(body)).status).toBe(200);
    expect((await get(app, `/jigsaw-image/${PRIVATE}`)).status).toBe(200); // ... and forgotten when the jigsaw changes
  });
});

describe("who is given the key", () => {
  it("is the owner, in the list, the page, the search, the popular ones and what they save", async () => {
    const { app } = setup();
    const ids = (list: { id: string; imageKey?: string }[]) => Object.fromEntries(list.map((j) => [j.id, !!j.imageKey]));
    expect(ids((await get(app, "/jigsaw", "u1")).body)).toEqual({ [PUBLIC]: false, [PRIVATE]: true, [HIDDEN]: true }); // the list of the owner has the hidden one too
    expect(ids((await get(app, "/jigsaw-search", "u1")).body.items)).toMatchObject({ [PUBLIC]: false, [PRIVATE]: true });
    expect(ids((await get(app, "/jigsaw-search/mine", "u1")).body.items)).toEqual({ [PUBLIC]: false, [PRIVATE]: true, [HIDDEN]: true });
    expect(ids((await get(app, "/jigsaw-popular", "u1")).body)).toMatchObject({ [PUBLIC]: false, [PRIVATE]: true });
    const made = await request(app).post("/jigsaw/api/jigsaw").set(as("u1")).send({ name: "Mine", width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], ownerUid: "u1", visibility: "owner" });
    expect(made.status).toBe(201);
    expect(made.body.imageKey).toMatch(/^\d+\./);
  });

  it("is a player who has a round on it, and nobody else (not a stranger, not with no user)", async () => {
    const { app, plays } = setup();
    await u2PlaysPrivate(plays);
    const key = (await get(app, `/jigsaw/${PRIVATE}`, "u2")).body.imageKey as string;
    expect((await get(app, `/jigsaw-image/${PRIVATE}?k=${key}`)).status).toBe(200);
    expect((await get(app, `/jigsaw/${PRIVATE}`, "u3")).status).toBe(404);
    expect((await get(app, `/jigsaw/${PRIVATE}`)).status).toBe(404);
    expect((await get(app, "/jigsaw", "u3")).body.map((j: JigsawSpec) => j.id)).toEqual([PUBLIC]);
    expect((await get(app, "/jigsaw-search", "u3")).body.items.map((j: JigsawSpec) => j.id)).toEqual([PUBLIC]);
  });

  it("is the same key for a person asking again, so the address and the browser's copy stay", async () => {
    const { app } = setup();
    const first = (await get(app, `/jigsaw/${PRIVATE}`, "u1")).body.imageKey;
    expect((await get(app, `/jigsaw/${PRIVATE}`, "u1")).body.imageKey).toBe(first);
  });

  it("is not given with the rounds of another user: only to somebody who may see the jigsaw", async () => {
    const { app, plays } = setup();
    await u2PlaysPrivate(plays);
    await plays.update(PRIVATE, "play1", (r) => ({ ...r, play: { ...r.play, fresh: false } }));
    const keyOf = async (asker?: string) => (await get(app, "/jigsaw-users/u2/plays", asker)).body[0]?.jigsaw?.imageKey;
    expect(await keyOf("u2")).toMatch(/^\d+\./); // the player themself
    expect(await keyOf("u1")).toMatch(/^\d+\./); // the owner of the jigsaw
    expect(await keyOf("u3")).toBeUndefined(); // a stranger looking at u2's rounds
    expect(await keyOf()).toBeUndefined(); // nobody
    expect((await get(app, "/jigsaw-users/u2/plays", "u3")).body[0].jigsaw).toMatchObject({ id: PRIVATE });
  });
});

describe("the key is never kept", () => {
  it("is not stored when a jigsaw is saved with one in it (the page sends back what it was given)", async () => {
    const { app, items } = setup();
    const body = { name: "Changed", width: 100, height: 100, gridSize: 50, gridVisible: false, placed: [], ownerUid: "u1", visibility: "owner", imageKey: "5.abcdefghijklmnopqrstuv" };
    const saved = await request(app).put(`/jigsaw/api/jigsaw/${PRIVATE}`).set(as("u1")).send(body);
    expect(saved.status).toBe(200);
    expect(items.get(PRIVATE)).not.toHaveProperty("imageKey");
    expect(saved.body.imageKey).not.toBe(body.imageKey); // the answer has a key of its own, made now
    const made = await request(app).post("/jigsaw/api/jigsaw").set(as("u1")).send({ ...body, imageKey: "5.abcdefghijklmnopqrstuv" });
    expect(items.get(made.body.id)).not.toHaveProperty("imageKey");
  });

  it("is in no document that is kept: nothing stored has a key or an address with one", async () => {
    const { app, items, plays } = setup();
    await u2PlaysPrivate(plays);
    await get(app, "/jigsaw", "u1");
    await get(app, "/jigsaw-search/mine", "u1");
    await get(app, "/jigsaw-users/u2/plays", "u2");
    const kept = JSON.stringify([...items.values(), ...[...plays.all.values()].flatMap((m) => [...m.values()])]);
    expect(kept).not.toMatch(/imageKey|[?&]k=/);
  });
});

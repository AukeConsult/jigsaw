import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { BoughtStore } from "../src/jigsaw/jigsaw-bought";
import type { FeedStore } from "../src/jigsaw/jigsaw-feed";
import { AccountLimits, BoughtPackage, FeedItemData, JigsawSpec, UNVERIFIED_PICTURES_MAX, UserLevel } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryJigsaws, memoryPieces, memoryPlays, memoryUsers } from "./memory-plays";

// An account that is not verified (no verified login) cannot add packages and has at most a few uploaded pictures. It still plays what is public. An admin is not stopped.

const pack: FeedItemData = { id: "k1", kind: "package", masterLanguage: "en", texts: [{ language: "en", title: "Forests" }], price: 0, createdAt: 1 };

function setup() {
  const levels: Record<string, UserLevel> = { boss: "admin", pub: "publisher" };
  const users = memoryUsers("boss", "pub", "plain", "known");
  // "known" and "pub" are verified: the flag is what the page is told, and the gate of these tests asks nobody for a token
  const verified = ["known", "pub"];
  const get = users.get.bind(users);
  users.get = async (id) => {
    const found = await get(id);
    return found && verified.includes(id) ? ({ ...found, protected: true } as typeof found) : found;
  };
  const jigsaws = memoryJigsaws();
  const had = new Map<string, BoughtPackage[]>();
  const bought: BoughtStore = { list: async (id) => had.get(id) ?? [], add: async (id, p) => void had.set(id, [...(had.get(id) ?? []), p]) };
  const feedPackages: FeedStore = { list: async () => [pack], get: async (id) => (id === pack.id ? pack : null), add: async () => pack, update: async () => null, remove: async () => false };
  const app = createJigsawApp({
    users,
    levels: { of: async (id) => levels[id ?? ""] ?? "user", forget() {} },
    jigsaw: jigsaws,
    jigsawPieces: memoryPieces(),
    plays: memoryPlays(),
    jigsawExists: async (id) => (await jigsaws.list()).some((j) => j.id === id),
    viewKeySecret: TEST_KEY_SECRET,
    accountPictures: memoryImages(),
    jigsawSearch: { load: async () => jigsaws.list() as never, forget() {} },
    favorites: { list: async () => [], add: async () => {}, remove: async () => {}, removeAllOf: async () => {} },
    feedInfo: { ...feedPackages, list: async () => [] },
    feedOffers: { ...feedPackages, list: async () => [] },
    feedPackages,
    bought,
    now: () => 1000,
  });
  const call = (method: "get" | "post" | "put" | "delete", path: string, as: string) => request(app)[method](`/jigsaw/api${path}`).set("X-Jigsaw-User", as);
  const body = (owner: string, name: string, visibility = "owner") => ({ name, kind: "picture", width: 200, height: 150, gridSize: 0, gridVisible: false, placed: [], ownerUid: owner, visibility });
  const upload = (owner: string, name: string, as: string = owner) => call("post", "/jigsaw", as).send(body(owner, name));
  const fill = async (owner: string) => {
    const made: JigsawSpec[] = [];
    for (let i = 1; i <= UNVERIFIED_PICTURES_MAX; i++) made.push((await upload(owner, `Picture ${i}`).expect(201)).body as JigsawSpec);
    return made;
  };
  return { call, body, upload, fill, had };
}

describe("the limits of an account that is not verified (the model)", () => {
  it("tells a verified account by its logins, or by what the page is told", () => {
    expect(AccountLimits.verified({ firebaseUids: ["x"] })).toBe(true);
    expect(AccountLimits.verified({ protected: true })).toBe(true);
    expect(AccountLimits.verified({ firebaseUids: [] })).toBe(false);
    expect(AccountLimits.verified(null)).toBe(false);
  });

  it("stops a package, and a picture over the limit, only for one that is not verified", () => {
    expect(AccountLimits.packageError({})).not.toBe("");
    expect(AccountLimits.packageError({ protected: true })).toBe("");
    expect(AccountLimits.pictureError({}, UNVERIFIED_PICTURES_MAX - 1)).toBe("");
    expect(AccountLimits.pictureError({}, UNVERIFIED_PICTURES_MAX)).not.toBe("");
    expect(AccountLimits.pictureError({ protected: true }, 100)).toBe("");
  });
});

describe("adding a package", () => {
  it("is for a verified account (or an admin who does it for one); what is had stays", async () => {
    const { call, had } = setup();
    const add = (account: string, as: string = account) => call("put", `/jigsaw-users/${account}/bought-packages/${pack.id}`, as);
    expect((await add("plain")).status).toBe(403);
    expect(had.get("plain")).toBeUndefined();
    expect((await add("known")).status).toBe(201);
    expect((await add("plain", "boss")).status).toBe(201);
    expect((await add("plain")).status).toBe(200); // had already
  });
});

describe("uploading pictures", () => {
  it("stops at the limit for an account that is not verified, until one is deleted", async () => {
    const { call, upload, fill } = setup();
    const made = await fill("plain");
    const more = await upload("plain", "One more");
    expect(more.status).toBe(403);
    expect(more.body.error).toContain(String(UNVERIFIED_PICTURES_MAX));
    await call("delete", `/jigsaw/${made[0].id}`, "plain").expect(204);
    await upload("plain", "In its place").expect(201);
  });

  it("is not limited for a verified account, nor when an admin does it", async () => {
    const { upload, fill } = setup();
    await fill("known");
    await upload("known", "Sixth").expect(201);
    await fill("plain");
    await upload("plain", "By the admin", "boss").expect(201);
  });

  it("lets a full account change its pictures, but not be given another's", async () => {
    const { call, body, upload, fill } = setup();
    const [first] = await fill("plain");
    await call("put", `/jigsaw/${first.id}`, "plain").send(body("plain", "New name")).expect(200);
    const other = (await upload("known", "Theirs")).body as JigsawSpec;
    expect((await call("put", `/jigsaw/${other.id}`, "known").send(body("plain", "Handed over"))).status).toBe(403);
  });

  it("takes nothing away from playing what is public", async () => {
    const { call, body, fill } = setup();
    await fill("plain");
    const open = (await call("post", "/jigsaw", "pub").send(body("pub", "For everybody", "everyone")).expect(201)).body as JigsawSpec;
    await call("get", `/jigsaw/${open.id}`, "plain").expect(200);
    const round = await call("post", `/jigsaw/${open.id}/plays`, "plain").send({ userId: "plain", choice: { pieces: 24, level: "medium" } });
    expect(round.status).not.toBe(403);
    expect(round.status).not.toBe(404);
  });
});

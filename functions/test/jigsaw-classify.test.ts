import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { type Classifier } from "../src/jigsaw/classifier";
import type { ImageStore, Picture } from "../src/jigsaw/jigsaw-image";
import type { Classification, JigsawSpec } from "../src/models";
import { memoryPlays, memoryUsers } from "./memory-plays";
import { AiUnavailable } from "../src/common/openai-chat";

// The classification of one jigsaw, through the route, with a fake classifier: nothing here calls OpenAI.

const jigsaw = (over: Partial<JigsawSpec> = {}): JigsawSpec => ({
  id: "jig12345",
  name: "Test 01 - IMG_1",
  width: 200,
  height: 150,
  gridSize: 50,
  gridVisible: false,
  placed: [],
  createdAt: 7,
  ownerUid: "u1",
  author: "Test Owner",
  language: "nb",
  categories: ["family"],
  description: "Old words",
  snapPercent: 25,
  lineWidth: 2,
  lineColor: "#112233",
  ...over,
});

/** the jigsaws and pictures in memory, with the updates that were made */
function setup(opts: { jigsaw?: JigsawSpec; picture?: boolean; classify?: Classifier["classify"] } = {}) {
  const j = opts.jigsaw ?? jigsaw();
  const updates: { id: string; input: Record<string, unknown> }[] = [];
  const asked: { language: string; bytes: number }[] = [];
  const store = {
    async list() {
      return [j];
    },
    async add() {
      return j;
    },
    async update(id: string, input: Record<string, unknown>) {
      updates.push({ id, input });
      return { ...input, id, createdAt: j.createdAt } as unknown as JigsawSpec;
    },
    async remove() {
      return true;
    },
  };
  const picture: Picture = { data: Buffer.from("picture bytes"), mime: "image/jpeg", etag: "e" };
  const images: ImageStore = {
    async put() {},
    async get() {
      return opts.picture === false ? null : picture;
    },
    async remove() {},
  };
  const classifier: Classifier = {
    classify:
      opts.classify ??
      (async (p, language) => {
        asked.push({ language, bytes: p.data.length });
        return { categories: ["nature/forest", "travel"], name: "Forest path" } satisfies Classification;
      }),
  };
  const app = createJigsawApp({ jigsaw: store as never, jigsawImages: images, classifier, plays: memoryPlays(), users: memoryUsers("u1", "u2") });
  return { app, updates, asked };
}
const classify = (a: ReturnType<typeof setup>, who: string | undefined, query = "", id = "jig12345") => {
  const r = request(a.app).post(`/jigsaw/api/jigsaw/${id}/classify${query}`);
  return who ? r.set("X-Jigsaw-User", who) : r;
};

describe("classifying one jigsaw", () => {
  it("gives what the picture suggests, in the language of the jigsaw, and changes nothing without apply", async () => {
    const a = setup();
    const res = await classify(a, "u1");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ categories: ["nature/forest", "travel"], name: "Forest path", applied: false });
    expect(a.asked).toEqual([{ language: "nb", bytes: "picture bytes".length }]); // the stored picture, and the language of the jigsaw
    expect(a.updates).toEqual([]);
  });

  it("with apply, puts the categories and the name on the jigsaw (never a description), and nothing else of it changes", async () => {
    const a = setup();
    const res = await classify(a, "u1", "?apply=true");
    expect([res.status, res.body.applied]).toEqual([200, true]);
    expect(a.updates).toHaveLength(1);
    const saved = a.updates[0].input;
    expect(a.updates[0].id).toBe("jig12345");
    expect(saved).toMatchObject({ name: "Forest path", description: "Old words", categories: ["travel", "nature/forest"] }); // in the order the categories are shown
    // what was not classified stays as it was
    expect(saved).toMatchObject({ width: 200, height: 150, gridSize: 50, ownerUid: "u1", author: "Test Owner", language: "nb", snapPercent: 25, lineWidth: 2, lineColor: "#112233" });
    expect("id" in saved || "createdAt" in saved).toBe(false);
  });

  it("writes the name in the base language of the picture, whatever the call says, and the picture keeps that language", async () => {
    const a = setup();
    const res = await classify(a, "u1", "?apply=true&language=de");
    expect(res.status).toBe(200);
    expect(a.asked.map((x) => x.language)).toEqual(["nb"]);
    expect(a.updates[0].input).toMatchObject({ language: "nb", name: "Forest path" });
  });

  it("puts the motive difficulty on the jigsaw as its own property (not among the categories), and keeps the one that is there when the AI said none", async () => {
    const said = setup({ classify: async () => ({ categories: ["nature"], motive: "expert", name: "N" }) });
    const res = await classify(said, "u1", "?apply=true");
    expect(res.body).toMatchObject({ motive: "expert", categories: ["nature"], applied: true });
    expect(said.updates[0].input).toMatchObject({ motive: "expert", categories: ["nature"] });
    const silent = setup({ jigsaw: jigsaw({ motive: "easy" }), classify: async () => ({ categories: ["nature"], name: "N" }) });
    await classify(silent, "u1", "?apply=true");
    expect(silent.updates[0].input).toMatchObject({ motive: "easy" }); // the AI said none: what was there stays
    const dry = await classify(said, "u1");
    expect(dry.body).toMatchObject({ motive: "expert", applied: false });
    expect(said.updates).toHaveLength(1); // and nothing is saved without apply
  });

  it("keeps the categories, the name and the description that are there when the AI said none", async () => {
    const a = setup({ classify: async () => ({ categories: [], name: "" }) });
    const res = await classify(a, "u1", "?apply=true");
    expect(res.body).toEqual({ categories: [], name: "", applied: true });
    expect(a.updates[0].input).toMatchObject({ name: "Test 01 - IMG_1", description: "Old words", categories: ["family"] });
  });

  it("is for the owner: another user cannot, nobody cannot, and a jigsaw from before owners is anybody's", async () => {
    const a = setup();
    expect((await classify(a, "u2")).status).toBe(403);
    expect((await classify(a, undefined)).status).toBe(403);
    expect(a.asked).toEqual([]); // nothing was sent to the AI
    const ownerless = setup({ jigsaw: jigsaw({ ownerUid: undefined }) });
    expect((await classify(ownerless, "u2")).status).toBe(200);
  });

  it("says when there is no such jigsaw or it has no picture", async () => {
    expect((await classify(setup(), "u1", "", "missing12")).status).toBe(404);
    const noPicture = setup({ picture: false });
    const res = await classify(noPicture, "u1");
    expect([res.status, res.body.error]).toEqual([409, "This jigsaw has no picture to look at."]);
    expect(noPicture.asked).toEqual([]);
  });

  it("says when the classifier cannot be used (503, as it is) and when it fails (502), and changes nothing", async () => {
    const unavailable = setup({ classify: async () => { throw new AiUnavailable("OPENAI_API_KEY is not set: put it in the top-level .env and run npm run sync:env."); } });
    const down = await classify(unavailable, "u1", "?apply=true");
    expect([down.status, down.body.error]).toEqual([503, "OPENAI_API_KEY is not set: put it in the top-level .env and run npm run sync:env."]);
    const failing = setup({ classify: async () => { throw new Error("OpenAI answered 429: slow down"); } });
    const failed = await classify(failing, "u1", "?apply=true");
    expect([failed.status, failed.body.error]).toEqual([502, "The classification failed: OpenAI answered 429: slow down"]);
    expect(unavailable.updates).toEqual([]);
    expect(failing.updates).toEqual([]);
  });
});

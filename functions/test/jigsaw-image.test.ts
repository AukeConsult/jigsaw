import request from "supertest";
import { memoryPlays } from "./memory-plays";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { CanvasStore } from "../src/common/canvas-list";
import { ImageStore, MAX_PICTURE_BYTES, Picture, etagOf, pictureType } from "../src/jigsaw/jigsaw-image";
import type { PieceStore } from "../src/jigsaw/jigsaw-pieces";
import type { CanvasSpec } from "../src/models";

/** the pictures in memory: what the Storage bucket is in the app */
function memoryImages() {
  const files = new Map<string, { data: Buffer; mime: string }>();
  const store: ImageStore = {
    async put(id, data, mime) {
      files.set(id, { data, mime });
    },
    async get(id): Promise<Picture | null> {
      const f = files.get(id);
      return f ? { ...f, etag: etagOf(f.data) } : null;
    },
    async remove(id) {
      files.delete(id);
    },
  };
  return { files, store };
}

function memoryCanvases(): CanvasStore {
  const items: CanvasSpec[] = [];
  return {
    async list() {
      return [...items];
    },
    async add(input) {
      const item = { ...input, id: `canvas-${items.length + 1}0000`, createdAt: 1 } as CanvasSpec;
      items.push(item);
      return item;
    },
    async update() {
      return null;
    },
    async remove(id) {
      const i = items.findIndex((c) => c.id === id);
      if (i < 0) return false;
      items.splice(i, 1);
      return true;
    },
  };
}

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 7)]);
const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(40, 1)]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(20)]);
const id = "AbCdEf123456";

describe("the background picture of a jcanvas", () => {
  const setup = (existing: string[] = [id]) => {
    const images = memoryImages();
    const removedPieces: string[] = [];
    const pieces = { removeAll: async (jigsawId: string) => void removedPieces.push(jigsawId) } as unknown as PieceStore;
    const app = createJigsawApp({ plays: memoryPlays(), jigsaw: memoryCanvases(), jigsawImages: images.store, jigsawPieces: pieces, jigsawExists: async (x) => existing.includes(x) });
    return { ...images, app, removedPieces };
  };

  it("knows a jpeg, png or webp by its first bytes, and nothing else", () => {
    expect([jpeg, png, webp].map(pictureType)).toEqual(["image/jpeg", "image/png", "image/webp"]);
    expect(pictureType(Buffer.from("<html>not a picture at all</html>"))).toBeNull();
    expect(pictureType(Buffer.from([0xff, 0xd8]))).toBeNull(); // too short
  });

  it("is at most about 5 MB", () => {
    expect(MAX_PICTURE_BYTES).toBe(5 * 1024 * 1024);
  });

  it("is saved from the request body, read back with its type, and replaced by the next one", async () => {
    const { app, files } = setup();
    const put = await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/png").send(jpeg); // the type the app says is not trusted
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({ mime: "image/jpeg", bytes: jpeg.length });
    const got = await request(app).get(`/jigsaw/api/jigsaw-image/${id}`).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => cb(null, Buffer.concat(chunks)));
    });
    expect(got.headers["content-type"]).toBe("image/jpeg");
    expect(got.body.equals(jpeg)).toBe(true);
    expect((await request(app).head(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(200);
    await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/png").send(png);
    expect(files.get(id)?.mime).toBe("image/png");
    expect(files.size).toBe(1);
  });

  it("answers 304 to a browser that has the picture already", async () => {
    const { app } = setup();
    await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/jpeg").send(jpeg);
    const tag = (await request(app).head(`/jigsaw/api/jigsaw-image/${id}`)).headers.etag;
    expect((await request(app).get(`/jigsaw/api/jigsaw-image/${id}`).set("If-None-Match", tag)).status).toBe(304);
  });

  it("refuses what is not a picture, an empty body, a picture that is too big and an id that is not one", async () => {
    const { app, files } = setup();
    const put = (to: string, body: Buffer) => request(app).put(`/jigsaw/api/jigsaw-image/${to}`).set("Content-Type", "application/octet-stream").send(body);
    expect((await put(id, Buffer.from("just some text, not a picture"))).status).toBe(415);
    expect((await put(id, Buffer.alloc(0))).status).toBe(400);
    expect((await put(id, Buffer.concat([jpeg, Buffer.alloc(MAX_PICTURE_BYTES)]))).status).toBe(413);
    expect((await put("short", jpeg)).status).toBe(400);
    expect((await request(app).get("/jigsaw/api/jigsaw-image/..%2Fsecret")).status).toBe(400);
    expect(files.size).toBe(0);
  });

  it("needs a jigsaw that is there", async () => {
    const { app, files } = setup([]);
    expect((await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/jpeg").send(jpeg)).status).toBe(404);
    expect(files.size).toBe(0);
  });

  it("is 404 when there is none, and DELETE takes it away", async () => {
    const { app } = setup();
    expect((await request(app).get(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(404);
    await request(app).put(`/jigsaw/api/jigsaw-image/${id}`).set("Content-Type", "image/webp").send(webp);
    expect((await request(app).delete(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(204);
    expect((await request(app).get(`/jigsaw/api/jigsaw-image/${id}`)).status).toBe(404);
  });

  it("goes with its jigsaw: deleting the jigsaw takes away its pieces, their graphics and the picture", async () => {
    const { app, removedPieces } = setup();
    const body = { name: "Puzzle", width: 800, height: 600, gridSize: 50, gridVisible: true, placed: [] };
    const made = (await request(app).post("/jigsaw/api/jigsaw").send(body)).body;
    expect((await request(app).delete(`/jigsaw/api/jigsaw/${made.id}`)).status).toBe(204);
    expect(removedPieces).toEqual([made.id]);
  });
});

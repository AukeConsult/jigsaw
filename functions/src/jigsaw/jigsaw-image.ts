import { createHash } from "crypto";
import { DocumentReference, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import express from "express";
import { JIGSAW } from "../models";
import { apiRouter, bad } from "../common/http";

// The files of a jigsaw: its background picture and the graphics of its pieces. They are kept in Firebase Storage under `jigsaw/<id of the
// jigsaw>/`, the way Seven Friends keeps its files: written and read by the backend only (the Admin SDK ignores the storage rules, which let nobody
// in, so they are not touched), the app sends the bytes as the request body, the type is found from the first bytes (never from what the app says), and
// a file comes back through the API. What describes the jigsaw (its settings, its pieces and where they are) is in Firestore.

/** The folder of the files of the jigsaws in the bucket: `jigsaw/<id>/picture` and `jigsaw/<id>/pieces/<piece id>`. */
export const JIGSAW_ROOT = "jigsaw";
/** The biggest background picture, in bytes. */
export const MAX_PICTURE_BYTES = 5 * 1024 * 1024;

/** A stored file: its bytes and type, and a tag that changes when the file does. */
export interface Picture {
  data: Buffer;
  mime: string;
  etag: string;
}

/** Where the background pictures are kept (Storage in the app, memory in the tests). */
export interface ImageStore {
  put(id: string, data: Buffer, mime: string): Promise<void>;
  get(id: string): Promise<Picture | null>;
  /** takes the picture away; nothing there is fine */
  remove(id: string): Promise<void>;
}

/** The ids are Firestore ids (letters, digits, - and _). */
export const isPictureId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(v);

/** The type of a picture by its first bytes (jpeg, png or webp), or null: whatever the app says is not trusted. */
export function pictureType(b: Buffer): string | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.toString("latin1", 0, 4) === "RIFF" && b.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** The tag of a file: it changes when the bytes do. */
export const etagOf = (data: Buffer) => createHash("md5").update(data).digest("hex");

/** The bucket of the project: a picture is the file `<root>/<id>/picture` (the background pictures of the jigsaws under `jigsaw/`, the pictures of the accounts under `jigsaw/accounts/`). */
export function storageImageStore(root: string = JIGSAW_ROOT): ImageStore {
  const file = (id: string) => getStorage().bucket().file(`${root}/${id}/picture`);
  return {
    async put(id, data, mime) {
      await file(id).save(data, { contentType: mime, resumable: false, metadata: { cacheControl: "private, no-cache" } });
    },
    get: (id) => readStoredFile(file(id)),
    async remove(id) {
      await file(id).delete({ ignoreNotFound: true });
    },
  };
}

/** A file of the bucket with its type and tag; null when it is not there. */
export async function readStoredFile(file: { download(): Promise<[Buffer]>; getMetadata(): Promise<unknown[]> }): Promise<Picture | null> {
  try {
    const [[data], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
    return { data, mime: String((meta as { contentType?: unknown }).contentType ?? "application/octet-stream"), etag: etagOf(data) };
  } catch (err: any) {
    if (err?.code === 404) return null;
    throw err;
  }
}

/** A stored picture as the answer: asked for again with the tag it has (304), kept by the browser but asked about each time, and never taken for anything but what it is. */
export function sendPicture(req: express.Request, res: express.Response, picture: Picture): void {
  const etag = `"${picture.etag}"`;
  res.set({ "Content-Type": picture.mime, "Content-Length": String(picture.data.length), "Cache-Control": "private, no-cache", ETag: etag, "X-Content-Type-Options": "nosniff" });
  if (req.headers["if-none-match"] === etag) return void res.status(304).end();
  res.end(req.method === "HEAD" ? undefined : picture.data);
}

/** Whether a jigsaw document is there (a picture or a piece belongs to a jigsaw that exists). */
export const firestoreJigsawExists = async (id: string): Promise<boolean> => documentExists(getFirestore().collection(JIGSAW).doc(id));

/** Whether a document is there, read with no fields: a jigsaw document can be big, and only its being there is wanted. */
export const documentExists = async (ref: DocumentReference): Promise<boolean> => (await ref.firestore.getAll(ref, { fieldMask: [] }))[0].exists;

/**
 * PUT /jigsaw-image/:id: the picture of a jigsaw (the request body is the file, replacing one that is there; 404 when there is no such jigsaw).
 * GET (and HEAD): the file, or 404. (The picture goes when its jigsaw is deleted.)
 */
export function jigsawImageRouter(images: ImageStore, exists: (id: string) => Promise<boolean>): express.Router {
  const router = apiRouter();
  const body = express.raw({ type: () => true, limit: MAX_PICTURE_BYTES });

  router.use("/:id", (req, res, next) => {
    if (!isPictureId(req.params.id)) {
      bad(res, "Not a jigsaw id.");
      return;
    }
    next();
  });

  router.put("/:id", body, async (req, res) => {
    const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!bytes.length) {
      bad(res, "Send the picture as the request body.");
      return;
    }
    const mime = pictureType(bytes);
    if (!mime) {
      bad(res, "That is not a supported picture (jpeg, png or webp).", 415);
      return;
    }
    if (!(await exists(req.params.id))) {
      bad(res, "No such jigsaw.", 404);
      return;
    }
    await images.put(req.params.id, bytes, mime);
    res.json({ mime, bytes: bytes.length, etag: etagOf(bytes) });
  });

  router.get("/:id", async (req, res) => {
    const picture = await images.get(req.params.id);
    if (!picture) {
      bad(res, "No picture.", 404);
      return;
    }
    sendPicture(req, res, picture);
  });

  return router;
}

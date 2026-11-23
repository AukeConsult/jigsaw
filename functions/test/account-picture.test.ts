import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import type { JigsawStore } from "../src/common/jigsaw-list";
import { JigsawUsers } from "../src/models";
import { TEST_KEY_SECRET, memoryImages, memoryPlays, memoryUsers } from "./memory-plays";

// An account can have a picture: a small JPEG kept with it (server only). The page is told when it was set and reads the image at its own address, which is open like the name.

const PICTURE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgICAgMCAgIDAwMDBAYEBAQEBAgGBgUGCQgKCgkICQkKDA8MCgsOCwkJDRENDg8QEBEQCgwSExIQEw8QEBD/";
const none: JigsawStore = { list: async () => [], get: async () => null, add: async () => { throw new Error("not used"); }, update: async () => null, remove: async () => false };

describe("the picture of an account", () => {
  it("is checked: a small JPEG as a data address, or null to take it away", () => {
    expect(JigsawUsers.pictureError(PICTURE)).toBe("");
    expect(JigsawUsers.pictureError(null)).toBe("");
    expect(JigsawUsers.pictureError("data:image/png;base64,AAAA")).not.toBe("");
    expect(JigsawUsers.pictureError("http://example.com/a.jpg")).not.toBe("");
    expect(JigsawUsers.pictureError(PICTURE + "A".repeat(JigsawUsers.PICTURE_MAX_CHARS))).toMatch(/too large/);
  });

  it("is kept with the account, read as an image, and the lists only say when it was set", async () => {
    const users = memoryUsers("u1");
    let time = 5_000;
    const pictures = memoryImages();
    const app = createJigsawApp({ users, plays: memoryPlays(), jigsaw: none, accountPictures: pictures, viewKeySecret: TEST_KEY_SECRET, now: () => time });
    expect((await request(app).get("/jigsaw/api/jigsaw-users/u1/picture")).status).toBe(404);
    expect((await request(app).put("/jigsaw/api/jigsaw-users/u1").send({ picture: "nonsense" })).status).toBe(400);
    const put = await request(app).put("/jigsaw/api/jigsaw-users/u1").send({ picture: PICTURE });
    expect(put.status).toBe(200);
    expect(put.body.pictureAt).toBe(5_000);
    expect(JSON.stringify(put.body)).not.toContain("base64"); // the picture itself is never in an answer about the account
    expect(pictures.files.get("u1")?.mime).toBe("image/jpeg"); // it is a file, not a field of the account
    expect(JSON.stringify(await users.get("u1"))).not.toContain("base64");
    const image = await request(app).get("/jigsaw/api/jigsaw-users/u1/picture");
    expect(image.status).toBe(200);
    expect(image.headers["content-type"]).toBe("image/jpeg");
    expect(image.body[0]).toBe(0xff);
    const list = (await request(app).get("/jigsaw/api/jigsaw-users")).body[0];
    expect(list.pictureAt).toBe(5_000);
    expect(JSON.stringify(list)).not.toContain("base64");
    time = 9_000;
    const gone = await request(app).put("/jigsaw/api/jigsaw-users/u1").send({ picture: null });
    expect(gone.body.pictureAt).toBeUndefined();
    expect((await request(app).get("/jigsaw/api/jigsaw-users/u1/picture")).status).toBe(404);
    expect(pictures.files.has("u1")).toBe(false); // the file is taken away too
  });
});

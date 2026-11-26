import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerFailure, apiRouter } from "../src/common/http";
import { JigsawStore } from "../src/common/jigsaw-list";
import { createJigsawApp } from "../src/jigsaw/app";
import { TEST_KEY_SECRET, memoryPlays, memoryUsers } from "./memory-plays";

// A store that fails (Firestore is not there) is answered, not left to hang: Express 4 does not catch a rejected promise by itself.

const down = async (): Promise<never> => Promise.reject(new Error("down"));

describe("a call that fails", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => undefined));
  afterEach(() => vi.restoreAllMocks());

  const update = vi.fn(async () => null);
  const jigsaw: JigsawStore = { list: down, get: down, add: down, update, remove: down };
  const users = { ...memoryUsers("u1"), list: down, get: down };
  const app = createJigsawApp({ jigsaw, users, plays: memoryPlays(), viewKeySecret: TEST_KEY_SECRET });

  it("is answered 503, in a route of the app and in a route of a router in it", async () => {
    for (const path of ["/jigsaw/api/jigsaw", "/jigsaw/api/jigsaw/j1", "/jigsaw/api/jigsaw-popular", "/jigsaw/api/jigsaw-users", "/jigsaw/api/jigsaw-users/u1"]) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(503);
      expect(res.body, path).toEqual({ error: "Try again." });
    }
  });

  it("stops at a check that fails, before anything is changed", async () => {
    const res = await request(app).put("/jigsaw/api/jigsaw/j1").send({ name: "x" });
    expect(res.status).toBe(503);
    expect(update).not.toHaveBeenCalled();
  });

  it("does not go on past a check that is rejected with nothing", async () => {
    const own = express();
    const router = apiRouter();
    const after = vi.fn();
    router.get("/", async () => Promise.reject(undefined), (_req, res) => (after(), void res.end()));
    own.use(router);
    own.use(answerFailure);
    expect((await request(own).get("/")).status).toBe(503);
    expect(after).not.toHaveBeenCalled();
  });

  it("leaves a request that is not right in itself as Express answers it", async () => {
    const res = await request(app).post("/jigsaw/api/jigsaw").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
  });
});

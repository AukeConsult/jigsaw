import request from "supertest";
import { describe, expect, it } from "vitest";
import { createCanvasApp } from "../src/canvas/app";
import { createJigsawApp } from "../src/jigsaw/app";

describe("health", () => {
  it("answers ok, in each of the two services, at its own address", async () => {
    const canvas = await request(createCanvasApp()).get("/canvas/api/health");
    expect(canvas.status).toBe(200);
    expect(canvas.body).toEqual({ status: "ok", app: "canvas" });
    const jigsaw = await request(createJigsawApp()).get("/jigsaw/api/health");
    expect(jigsaw.status).toBe(200);
    expect(jigsaw.body).toEqual({ status: "ok", app: "jigsaw" });
  });

  it("keeps the routes of one service out of the other", async () => {
    expect((await request(createCanvasApp()).get("/canvas/api/jigsaw")).status).toBe(404);
    expect((await request(createJigsawApp()).get("/jigsaw/api/canvas-list")).status).toBe(404);
    expect((await request(createCanvasApp()).get("/api/health")).status).toBe(404);
  });
});

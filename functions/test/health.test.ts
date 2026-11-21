import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";

describe("health", () => {
  it("answers ok, at the address of the API", async () => {
    const res = await request(createJigsawApp()).get("/jigsaw/api/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", app: "jigsaw" });
  });

  it("answers nothing at the old addresses", async () => {
    expect((await request(createJigsawApp()).get("/api/health")).status).toBe(404);
    expect((await request(createJigsawApp()).get("/jigsaw/api/jigsaw-list")).status).toBe(404);
  });
});

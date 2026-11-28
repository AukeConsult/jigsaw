import request from "supertest";
import { describe, expect, it } from "vitest";
import { createJigsawApp } from "../src/jigsaw/app";
import { JigsawUsers, USER_BIO_MAX } from "../src/models";
import { TEST_KEY_SECRET, memoryJigsaws, memoryUsers } from "./memory-plays";

// "Who am I": a few words a person writes about themselves, kept with the account.

describe("the text about oneself", () => {
  it("is trimmed, may be taken away with an empty one, and is not longer than the longest", () => {
    expect(JigsawUsers.change({ bio: "  I like puzzles.  " })).toEqual({ change: { bio: "I like puzzles." } });
    expect(JigsawUsers.change({ bio: "   " })).toEqual({ change: { bio: "" } });
    expect(JigsawUsers.change({ bio: "a".repeat(USER_BIO_MAX) })).toHaveProperty("change");
    expect(JigsawUsers.change({ bio: "a".repeat(USER_BIO_MAX + 1) })).toHaveProperty("error");
    expect(JigsawUsers.change({ bio: 5 })).toHaveProperty("error");
  });

  it("is read from the database when there is one, and only then", () => {
    expect(JigsawUsers.fromStored("u", { username: "u", name: "U", bio: "Hello" }).bio).toBe("Hello");
    for (const bio of ["", 3 as unknown as string, undefined]) expect("bio" in JigsawUsers.fromStored("u", { username: "u", name: "U", bio })).toBe(false);
  });

  it("is saved with the account and told with it", async () => {
    const app = createJigsawApp({ viewKeySecret: TEST_KEY_SECRET, jigsaw: memoryJigsaws(), users: memoryUsers("anna") });
    const saved = await request(app).put("/jigsaw/api/jigsaw-users/anna").set("X-Jigsaw-User", "anna").send({ bio: "Puzzles and gardens" });
    expect(saved.status).toBe(200);
    expect(saved.body.bio).toBe("Puzzles and gardens");
    expect((await request(app).get("/jigsaw/api/jigsaw-users/anna")).body.bio).toBe("Puzzles and gardens");
    expect((await request(app).put("/jigsaw/api/jigsaw-users/anna").set("X-Jigsaw-User", "anna").send({ bio: "a".repeat(USER_BIO_MAX + 1) })).status).toBe(400);
  });
});

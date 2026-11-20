import { describe, expect, it } from "vitest";
import { CollectionLike, documentStore } from "../src/document-store";

/** a small collection in memory that works like the part of Firestore the store uses */
function fakeCollection() {
  const docs = new Map<string, Record<string, unknown>>();
  let next = 1;
  const collection: CollectionLike = {
    orderBy: (field) => ({
      limit: (count) => ({
        get: async () => ({
          docs: [...docs.entries()]
            .sort(([, a], [, b]) => (b[field] as number) - (a[field] as number))
            .slice(0, count)
            .map(([id, data]) => ({ id, data: () => data })),
        }),
      }),
    }),
    doc: (id) => ({
      get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
      set: async (data) => void docs.set(id, { ...data }), // a document is replaced
      delete: async () => void docs.delete(id),
    }),
    add: async (data) => {
      const id = `d${next++}`;
      docs.set(id, { ...data });
      return { id };
    },
  };
  return { collection, docs };
}

type Item = { id: string; name: string; size: number; createdAt: number };
/** reads a document: an older one has no size, it gets 10 */
const read = (id: string, doc: Record<string, unknown>): Item => ({ id, name: doc["name"] as string, size: (doc["size"] as number | undefined) ?? 10, createdAt: doc["createdAt"] as number });

const store = () => {
  const fake = fakeCollection();
  return { ...fake, store: documentStore<{ name: string; size: number }, Item>(() => fake.collection, 2, read) };
};

describe("the document store", () => {
  it("adds a document with its creation time, and reads it back", async () => {
    const s = store();
    const added = await s.store.add({ name: "a", size: 1 });
    expect(added).toMatchObject({ id: "d1", name: "a", size: 1 });
    expect(added.createdAt).toBeGreaterThan(0);
    expect(await s.store.list()).toEqual([added]);
  });

  it("lists the newest first, and only up to its limit", async () => {
    const s = store();
    s.docs.set("old", { name: "old", size: 1, createdAt: 1 });
    s.docs.set("mid", { name: "mid", size: 2, createdAt: 2 });
    s.docs.set("new", { name: "new", size: 3, createdAt: 3 });
    expect((await s.store.list()).map((i) => i.id)).toEqual(["new", "mid"]); // the limit is 2
  });

  it("reads a document that an older version saved as the model says (what it lacked gets its default)", async () => {
    const s = store();
    s.docs.set("old", { name: "old", createdAt: 5 }); // no size
    expect(await s.store.list()).toEqual([{ id: "old", name: "old", size: 10, createdAt: 5 }]);
  });

  it("replaces the whole document when it is changed: only the creation time is kept, nothing of the older version is left", async () => {
    const s = store();
    s.docs.set("x", { name: "x", size: 1, createdAt: 42, removedField: "stale", placed: [{ id: "gone" }] });
    const changed = await s.store.update("x", { name: "y", size: 2 });
    expect(changed).toEqual({ id: "x", name: "y", size: 2, createdAt: 42 });
    expect(s.docs.get("x")).toEqual({ name: "y", size: 2, createdAt: 42 }); // the stale fields are gone from the stored document
  });

  it("says null for a document that is not there, and does not make it", async () => {
    const s = store();
    expect(await s.store.update("nope", { name: "z", size: 1 })).toBeNull();
    expect(s.docs.size).toBe(0);
  });

  it("deletes a document for good, and says false for one that is not there", async () => {
    const s = store();
    const added = await s.store.add({ name: "a", size: 1 });
    expect(await s.store.remove(added.id)).toBe(true);
    expect(s.docs.size).toBe(0);
    expect(await s.store.remove(added.id)).toBe(false);
  });
});

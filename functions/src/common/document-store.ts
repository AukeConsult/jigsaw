/** What the app keeps in one collection of documents: list them, add one, replace one, delete one. */
export interface DocumentStore<Input, Item> {
  /** the newest first (up to the limit of the store) */
  list(): Promise<Item[]>;
  /** the same newest documents read WITHOUT their big parts (the store is given the fields to read): for lists that only name, count or rank them. A fake store may leave it out: the list is used then. */
  heads?(): Promise<Item[]>;
  /** one document by its id, whichever age it is (the list only has the newest); null when there is no such document. A fake store may leave it out: the list is searched then. */
  get?(id: string): Promise<Item | null>;
  add(input: Input): Promise<Item>;
  /** replaces the settings of a saved document (its id and creation time stay); null when there is no such document */
  update(id: string, input: Input): Promise<Item | null>;
  /** deletes the document for good; false when there is no such document */
  remove(id: string): Promise<boolean>;
}

/** One document by its id, also an old one: asked for by itself; a store that cannot (a fake) has its list searched. Null when there is no such document. */
export async function findById<Item extends { id: string }>(store: Pick<DocumentStore<unknown, Item>, "list" | "get">, id: string): Promise<Item | null> {
  return store.get ? store.get(id) : ((await store.list()).find((d) => d.id === id) ?? null);
}

/** The part of a Firestore collection that the store uses (the real one fits it, so a test can give a small fake). */
export interface CollectionLike {
  orderBy(field: string, direction: "desc"): { limit(count: number): { get(): Promise<{ docs: { id: string; data(): unknown }[] }>; select?(...fields: string[]): { get(): Promise<{ docs: { id: string; data(): unknown }[] }> } } };
  doc(id: string): {
    get(): Promise<{ exists: boolean; data(): unknown }>;
    set(data: object): Promise<unknown>;
    delete(): Promise<unknown>;
  };
  add(data: object): Promise<{ id: string }>;
}

/**
 * The documents of one Firestore collection. `read` makes an item of a document as it is stored: it is where a document that an older version saved
 * gets what it lacked (the model knows how), so every item that leaves the store is as the app now has it.
 * A saved change replaces the whole document (only the creation time is kept): nothing of an older version, and nothing that was removed, is left in it.
 * `headFields` are the fields `heads()` reads (a Firestore read is one document, but the fields that are not asked for are not sent). `peek` reads only some fields of one document, or none
 * when it is only asked whether the document is there: a change and a delete do not need the whole of a big document.
 */
export function documentStore<Input extends object, Item>(
  collection: () => CollectionLike,
  limit: number,
  read: (id: string, doc: Record<string, unknown>) => Item,
  options: { headFields?: readonly string[]; peek?: (id: string, fields: readonly string[]) => Promise<{ exists: boolean; data(): unknown }> } = {},
): DocumentStore<Input, Item> {
  const readDoc = (id: string, data: unknown) => read(id, (data ?? {}) as Record<string, unknown>);
  const peek = (id: string, fields: readonly string[]) => options.peek?.(id, fields) ?? collection().doc(id).get();
  const { headFields } = options;
  return {
    async list() {
      const snap = await collection().orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => readDoc(d.id, d.data()));
    },
    ...(headFields
      ? {
          async heads() {
            const newest = collection().orderBy("createdAt", "desc").limit(limit);
            const snap = await (newest.select ? newest.select(...headFields) : newest).get();
            return snap.docs.map((d) => readDoc(d.id, d.data()));
          },
        }
      : {}),
    async get(id) {
      const doc = await collection().doc(id).get();
      return doc.exists ? readDoc(id, doc.data()) : null;
    },
    async add(input) {
      const data = { ...input, createdAt: Date.now() };
      const ref = await collection().add(data);
      return readDoc(ref.id, data);
    },
    async update(id, input) {
      const ref = collection().doc(id);
      const before = await peek(id, ["createdAt"]); // only the creation time is kept of what was there
      if (!before.exists) return null;
      const data = { ...input, createdAt: (before.data() as { createdAt: number }).createdAt };
      await ref.set(data);
      return readDoc(id, data);
    },
    async remove(id) {
      const ref = collection().doc(id);
      if (!(await peek(id, [])).exists) return false;
      await ref.delete();
      return true;
    },
  };
}

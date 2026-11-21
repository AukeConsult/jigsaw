/** What the app keeps in one collection of documents: list them, add one, replace one, delete one. */
export interface DocumentStore<Input, Item> {
  /** the newest first (up to the limit of the store) */
  list(): Promise<Item[]>;
  add(input: Input): Promise<Item>;
  /** replaces the settings of a saved document (its id and creation time stay); null when there is no such document */
  update(id: string, input: Input): Promise<Item | null>;
  /** deletes the document for good; false when there is no such document */
  remove(id: string): Promise<boolean>;
}

/** The part of a Firestore collection that the store uses (the real one fits it, so a test can give a small fake). */
export interface CollectionLike {
  orderBy(field: string, direction: "desc"): { limit(count: number): { get(): Promise<{ docs: { id: string; data(): unknown }[] }> } };
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
 */
export function documentStore<Input extends object, Item>(
  collection: () => CollectionLike,
  limit: number,
  read: (id: string, doc: Record<string, unknown>) => Item,
): DocumentStore<Input, Item> {
  const readDoc = (id: string, data: unknown) => read(id, (data ?? {}) as Record<string, unknown>);
  return {
    async list() {
      const snap = await collection().orderBy("createdAt", "desc").limit(limit).get();
      return snap.docs.map((d) => readDoc(d.id, d.data()));
    },
    async add(input) {
      const data = { ...input, createdAt: Date.now() };
      const ref = await collection().add(data);
      return readDoc(ref.id, data);
    },
    async update(id, input) {
      const ref = collection().doc(id);
      const before = await ref.get();
      if (!before.exists) return null;
      const data = { ...input, createdAt: (before.data() as { createdAt: number }).createdAt };
      await ref.set(data);
      return readDoc(id, data);
    },
    async remove(id) {
      const ref = collection().doc(id);
      if (!(await ref.get()).exists) return false;
      await ref.delete();
      return true;
    },
  };
}

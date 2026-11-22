import { FieldValue, getFirestore } from "firebase-admin/firestore";
import express from "express";
import { JIGSAW_TOKEN_USAGE, JIGSAW_USERS, TokenUsageSpec, TokenUsages } from "../models";

// What the AI uses for a user is kept under the user, one document for each call: `jigsaw-users/<uid>/token-usage/<id>` (`TokenUsages.record`), so it can be paid for later.

/** The most calls that are listed. */
const LIST_LIMIT = 500;

/** Where the calls are kept (Firestore in the app, memory in the tests). */
export interface TokenUsageStore {
  /** keeps a call for the user */
  add(userId: string, usage: Omit<TokenUsageSpec, "id">): Promise<TokenUsageSpec>;
  /** the calls of the user, the newest first (at most `LIST_LIMIT`) */
  list(userId: string): Promise<TokenUsageSpec[]>;
}

/** The subcollection `token-usage` of each user. */
export function firestoreTokenUsageStore(): TokenUsageStore {
  const calls = (userId: string) => getFirestore().collection(JIGSAW_USERS).doc(userId).collection(JIGSAW_TOKEN_USAGE);
  return {
    async add(userId, usage) {
      const ref = calls(userId).doc();
      await ref.set({ ...usage, serverTime: FieldValue.serverTimestamp() });
      return { id: ref.id, ...usage };
    },
    async list(userId) {
      const snap = await calls(userId).orderBy("createdAt", "desc").limit(LIST_LIMIT).get(); // one order on its own: no index needed
      return snap.docs.map((d) => {
        const { serverTime: _serverTime, ...rest } = d.data();
        return { id: d.id, ...rest } as TokenUsageSpec;
      });
    },
  };
}

/** `GET /jigsaw-users/:id/token-usage`: what the AI has used for the user and what it adds up to. Only the user themself (the header `X-Jigsaw-User` is the UID of who asks). */
export function tokenUsageRouter(store: TokenUsageStore): express.Router {
  const router = express.Router({ mergeParams: true });
  router.get("/", async (req, res) => {
    const id = (req.params as { id: string }).id;
    if (req.get("X-Jigsaw-User") !== id) return void res.status(403).json({ error: "The use of the AI is only shown to the user it is for." });
    const items = await store.list(id);
    res.json({ items, totals: TokenUsages.totals(items) });
  });
  return router;
}

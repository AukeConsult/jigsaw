import { createHash, randomInt } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { JIGSAW_USERS, LinkCodes } from "../models";

// The link code: how a second login is verified for a user that a first login is verified for. The person signed in with the first login makes a code (shown to them), signs in with the second
// and types it. A code is for one user, works once and runs out after `LinkCodes.MINUTES` minutes; only its hash is kept, and a user has one code at a time (a new one takes the old one away).

/** Where the codes are kept (Firestore in the app, memory in the tests). */
export interface LinkCodeStore {
  /** Keeps this hash as the code of the user until `expiresAt` (milliseconds); any code the user had before is gone. */
  create(userId: string, hash: string, expiresAt: number): Promise<void>;
  /** Uses the code: true when it is the user's code and has not run out (it is taken away either way when it is found). */
  consume(userId: string, hash: string, now: number): Promise<boolean>;
}

/** A new code: random letters and digits that are not mistaken for each other. */
export function newCode(): string {
  return Array.from({ length: LinkCodes.LENGTH }, () => LinkCodes.ALPHABET[randomInt(LinkCodes.ALPHABET.length)]).join("");
}

/** What is kept of a code. */
export const hashOf = (code: string): string => createHash("sha256").update(LinkCodes.normalise(code)).digest("hex");

/** The codes under the user: `jigsaw-users/<id>/logon-codes/<hash>`. */
export function firestoreLinkCodes(): LinkCodeStore {
  const codes = (userId: string) => getFirestore().collection(JIGSAW_USERS).doc(userId).collection("logon-codes");
  return {
    async create(userId, hash, expiresAt) {
      const batch = getFirestore().batch();
      for (const old of (await codes(userId).get()).docs) batch.delete(old.ref);
      batch.set(codes(userId).doc(hash), { expiresAt });
      await batch.commit();
    },
    async consume(userId, hash, now) {
      const ref = codes(userId).doc(hash);
      return getFirestore().runTransaction(async (tx) => {
        const doc = await tx.get(ref);
        if (!doc.exists) return false;
        tx.delete(ref);
        return Number(doc.data()?.expiresAt) > now;
      });
    },
  };
}

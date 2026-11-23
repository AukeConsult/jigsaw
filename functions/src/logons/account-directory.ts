import { getAuth } from "firebase-admin/auth";

/** The Firebase logins, asked about by their UIDs (Firebase in the app, a fake in the tests). */
export interface AccountDirectory {
  /** The UIDs among these that no longer have a login in Firebase (the account was deleted, in either app). A question that cannot be answered is an error, never an answer: nobody is freed because Firebase did not answer. */
  gone(uids: readonly string[]): Promise<string[]>;
}

/** Firebase answers for 100 logins at a time. */
const AT_ONCE = 100;

export function firebaseDirectory(): AccountDirectory {
  return {
    async gone(uids) {
      const gone: string[] = [];
      for (let i = 0; i < uids.length; i += AT_ONCE) {
        const answer = await getAuth().getUsers(uids.slice(i, i + AT_ONCE).map((uid) => ({ uid })));
        for (const missing of answer.notFound) if ("uid" in missing) gone.push(missing.uid);
      }
      return gone;
    },
  };
}

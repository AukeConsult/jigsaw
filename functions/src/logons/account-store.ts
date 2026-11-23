import { randomUUID } from "node:crypto";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { LogonAccount, LogonAccounts, LogonToken, USER_ACCOUNTS } from "../models";

/** Where the accounts are kept (Firestore in the app, memory in the tests). */
export interface AccountStore {
  /**
   * Makes or updates the account of a person who has signed in, the way Seven Friends does (`user-account/<uid>`): the fields a login decides are written, the time of this
   * login is noted and the count of logins goes up. Everything else in the document stays as it is. `created` is true when there was no account.
   */
  sync(token: LogonToken): Promise<{ account: LogonAccount; created: boolean }>;
}

/** The collection `user-account`, shared with Seven Friends. */
export function firestoreAccountStore(): AccountStore {
  return {
    async sync(token) {
      const ref = getFirestore().collection(USER_ACCOUNTS).doc(token.uid);
      return getFirestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const account = LogonAccounts.stored(token, snap.data(), randomUUID);
        const fields = { ...account, lastLoginAt: FieldValue.serverTimestamp(), loginCount: FieldValue.increment(1) };
        if (snap.exists) tx.update(ref, fields);
        else tx.set(ref, { ...fields, createdAt: FieldValue.serverTimestamp() });
        return { account, created: !snap.exists };
      });
    },
  };
}

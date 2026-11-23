import express from "express";
import { LogonAccounts, LogonSession } from "../models";
import { AccountStore, firestoreAccountStore } from "./account-store";
import { TokenVerifier, firebaseVerifier, requireAuth, tokenOf } from "./require-auth";

// Everything about people who sign in with Firebase lives in this folder: the check of the token (`require-auth.ts`), the account that is kept for each person, shared with
// Seven Friends (`account-store.ts`, the model is `models/shared/logon.ts`), and the route that the page calls after it has signed in. The rest of the API does not use it yet.

/** What the routes need from outside (the app gives Firebase and Firestore, the tests give memory). */
export interface LogonDeps {
  verifier?: TokenVerifier;
  accounts?: AccountStore;
}

/** `POST /session`: the person has signed in (the page sends the Firebase ID token); the account is made or updated, and the page is told who it is. */
export function logonsRouter(deps: LogonDeps = {}): express.Router {
  const router = express.Router();
  const accounts = deps.accounts ?? firestoreAccountStore();
  router.post("/", requireAuth(deps.verifier ?? firebaseVerifier()), async (_req, res) => {
    try {
      const { account, created } = await accounts.sync(tokenOf(res));
      const session: LogonSession = { ok: true, accountId: account.accountId, created, user: LogonAccounts.publicOf(account) };
      res.json(session);
    } catch (err) {
      console.error("Could not keep the account", err);
      res.status(500).json({ error: "Could not keep your account: try again." });
    }
  });
  return router;
}

export type { AccountStore, TokenVerifier };

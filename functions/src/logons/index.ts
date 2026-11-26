import express, { RequestHandler } from "express";
import type { UserStore } from "../jigsaw/jigsaw-users";
import { LogonAccounts, LogonSession } from "../models";
import { AccountDirectory, firebaseDirectory } from "./account-directory";
import { AccountStore, firestoreAccountStore } from "./account-store";
import { createGate } from "./gate";
import { linkRouter } from "./link";
import { LinkCodeStore, firestoreLinkCodes } from "./link-codes";
import { TokenVerifier, firebaseVerifier, requireAuth, tokenOf, verifiedToken } from "./require-auth";
import { apiRouter, bad } from "../common/http";

// Everything about people who sign in with Firebase lives in this folder: the check of the token (`require-auth.ts`), the account kept for each person, shared with Seven Friends
// (`account-store.ts`, the model is `models/shared/logon.ts`), the route that the page calls after it has signed in, and what makes a jigsaw user verified by Firebase accounts: the gate in
// front of the API (`gate.ts`) and the routes that add and take away the logins of a user (`link.ts`, `link-codes.ts`).

/** What the logons need from outside (the app gives Firebase and Firestore, the tests give memory). */
export interface LogonDeps {
  verifier?: TokenVerifier;
  accounts?: AccountStore;
  codes?: LinkCodeStore;
  directory?: AccountDirectory;
  now?: () => number;
}

/** The parts of the logons that `createJigsawApp` puts in the API, each in its place. */
export interface Logons {
  /** `POST /session` */
  session: express.Router;
  /** in front of everything that acts as a user */
  gate: RequestHandler;
  /** in front of the list of users: takes the logins that are gone away first */
  sweepList: RequestHandler;
  /** in front of the routes that start a round: when the call carries a good token, its UID is in `res.locals.logonUid` (never an error: a call with none or a bad one goes on without) */
  identify: RequestHandler;
  /** in front of the making of a user: `linkLogon` in the body makes it verified for the account that is signed in */
  attachLogon: RequestHandler;
  /** `/jigsaw-users/:id/logons` */
  link: express.Router;
  /** an account was changed (its logins, or its level): the gate reads it again at the next call, not after the 10 seconds it keeps it */
  forget(userId: string): void;
}

export function createLogons(users: UserStore, deps: LogonDeps = {}): Logons {
  const verifier = deps.verifier ?? firebaseVerifier();
  const accounts = deps.accounts ?? firestoreAccountStore();
  const now = deps.now ?? Date.now;
  const gate = createGate({ verifier, users, directory: deps.directory ?? firebaseDirectory(), now });

  /** `POST /session`: the person has signed in (the page sends the Firebase ID token); the account is made or updated, and the page is told who it is and which users it is verified for. */
  const session = apiRouter();
  session.post("/", requireAuth(verifier), async (_req, res) => {
    try {
      const token = tokenOf(res);
      const { account, created } = await accounts.sync(token);
      const linked = (await users.linkedTo(token.uid)).map(LogonAccounts.linkedUser);
      const answer: LogonSession = { ok: true, accountId: account.accountId, created, user: LogonAccounts.publicOf(account), users: linked };
      res.json(answer);
    } catch (err) {
      console.error("Could not keep the account", err);
      bad(res, "Could not keep your account: try again.", 500);
    }
  });

  /** `GET /session`: the jigsaw users the account that is signed in is verified for (the page asks when it has been signed in since before, without making a login of it). */
  session.get("/", requireAuth(verifier), async (_req, res) => {
    const linked = (await users.linkedTo(tokenOf(res).uid)).map(LogonAccounts.linkedUser);
    res.json({ users: linked });
  });

  const attachLogon: RequestHandler = (req, res, next) => {
    if (!(req.body as { linkLogon?: unknown } | undefined)?.linkLogon) return next();
    requireAuth(verifier)(req, res, () => {
      res.locals.logonUid = tokenOf(res).uid; // from the token that was checked, never from the body
      next();
    });
  };

  const identify: RequestHandler = async (req, res, next) => {
    const token = await verifiedToken(req, verifier);
    if (token) res.locals.logonUid = token.uid;
    next();
  };

  const codes = deps.codes ?? firestoreLinkCodes();
  return { session, gate: gate.gate, sweepList: gate.sweepList, forget: gate.forget, attachLogon, identify, link: linkRouter({ verifier, users, accounts, codes, changed: gate.forget, now }) };
}

export type { AccountStore, TokenVerifier };

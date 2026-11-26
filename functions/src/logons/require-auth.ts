import { NextFunction, Request, RequestHandler, Response } from "express";
import { getAuth } from "firebase-admin/auth";
import { LogonToken } from "../models";
import { bad } from "../common/http";

/** Checks a Firebase ID token and answers what it says; throws when it is not good. (In the app Firebase checks it, in the tests a fake does.) */
export interface TokenVerifier {
  verify(idToken: string): Promise<LogonToken>;
}

/**
 * A login that Firebase has deleted still has ID tokens that verify for up to an hour. Such a token must not do anything, so the login itself is looked up, at most every 15
 * seconds for each person. A look-up that fails for another reason lets the request through: Firebase being slow must not lock people out. (The same rule as Seven Friends.)
 */
const CHECK_LOGIN_EVERY_MS = 15_000;
const loginSeen = new Map<string, number>();

async function loginExists(uid: string): Promise<boolean> {
  const at = loginSeen.get(uid);
  if (at !== undefined && Date.now() - at < CHECK_LOGIN_EVERY_MS) return true;
  try {
    await getAuth().getUser(uid);
    if (loginSeen.size > 5000) loginSeen.clear();
    loginSeen.set(uid, Date.now());
    return true;
  } catch (err) {
    if ((err as { code?: string })?.code === "auth/user-not-found") {
      loginSeen.delete(uid);
      return false;
    }
    console.error("Could not look up a login (the request is let through):", err);
    return true;
  }
}

/** The verifier of the app: Firebase checks the token, and a deleted login is refused. */
export function firebaseVerifier(): TokenVerifier {
  return {
    async verify(idToken) {
      const token = await getAuth().verifyIdToken(idToken);
      if (!(await loginExists(token.uid))) throw new Error("This account was deleted");
      return token;
    },
  };
}

/** The token in `Authorization: Bearer <token>`, or nothing. */
const bearerOf = (req: Request): string | undefined => /^Bearer (.+)$/.exec(req.header("Authorization") ?? "")?.[1];

/** What the token that comes with a call says, when it comes with a good one: for the places where a call may go on without (a token that is not good is no token). */
export async function verifiedToken(req: Request, verifier: TokenVerifier): Promise<LogonToken | null> {
  const bearer = bearerOf(req);
  return bearer ? verifier.verify(bearer).catch(() => null) : null;
}

/** Lets a request through only with a good `Authorization: Bearer <token>`; the token is then in `res.locals.token` (see `who`). */
export function requireAuth(verifier: TokenVerifier): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const bearer = bearerOf(req);
    if (!bearer) return bad(res, "Sign in first.", 401);
    try {
      res.locals.token = await verifier.verify(bearer);
    } catch {
      return bad(res, "Your sign-in is not valid any more: sign in again.", 401);
    }
    next();
  };
}

/** The verified token of the person who asks (only behind `requireAuth`). */
export function tokenOf(res: Response): LogonToken {
  return res.locals.token as LogonToken;
}

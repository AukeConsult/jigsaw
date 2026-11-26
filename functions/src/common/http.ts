import express from "express";

// What the routes of the API share about requests and answers.
//
// Express 4 does not catch the promise of an `async` handler that is rejected: the request then hangs until the function times out. So every router of the API is made with `apiRouter`, which hands a
// rejection on as a thrown error is handed on, and the app ends with `answerFailure`, which tells the page to try again.

/** The header every call says who asks with: the id of the account that plays. */
const USER_HEADER = "X-Jigsaw-User";

/** Who the call says it is from (nothing when it says nobody). */
export const askerOf = (req: express.Request): string | undefined => req.get(USER_HEADER) || undefined;

/** The answer that says why not. */
export const bad = (res: express.Response, error: string, status = 400): void => void res.status(status).json({ error });

const METHODS = ["use", "get", "post", "put", "patch", "delete"] as const;

/** The same handler, with a rejected promise handed to `next`. A handler of errors (four parameters, which is how Express tells it apart) is left as it is. */
function handing(handler: express.RequestHandler): express.RequestHandler {
  if (handler.length === 4) return handler;
  return (req, res, next) => {
    // a rejection with nothing in it must still be an error: `next()` with nothing would let the request go on, past a guard that failed
    void Promise.resolve(handler(req, res, next)).catch((err: unknown) => next(err || new Error("A handler was rejected with no reason")));
  };
}

/** What is given to a route (paths, handlers, lists of them), with every handler wrapped. */
const wrapped = (given: unknown): unknown => (Array.isArray(given) ? given.map(wrapped) : typeof given === "function" ? handing(given as express.RequestHandler) : given);

/** An Express router whose `async` handlers answer when they fail. Every router of the API is one. */
export function apiRouter(options?: express.RouterOptions): express.Router {
  const router = express.Router(options);
  for (const method of METHODS) {
    const add = (router[method] as (...given: unknown[]) => unknown).bind(router);
    (router as unknown as Record<string, unknown>)[method] = (...given: unknown[]) => add(...given.map(wrapped));
  }
  return router;
}

/** The last handler of the app: what no route caught is logged and answered 503. A request that is not right in itself (a body that is not JSON, or too big: `expose`) keeps the answer Express gives it. */
export const answerFailure: express.ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent || (err as { expose?: boolean }).expose) return next(err);
  console.error(`Could not answer ${req.method} ${req.path}`, err);
  bad(res, "Try again.", 503);
};

import { HttpErrorResponse } from '@angular/common/http';

/** The reason the API gave when it refused a call (`{ error }` in its answer); nothing when it gave none (it could not be reached, or something else failed). */
export function apiError(err: unknown): string | undefined {
  const said = err instanceof HttpErrorResponse ? (err.error as { error?: unknown } | null)?.error : undefined;
  return typeof said === 'string' && said ? said : undefined;
}

import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 413 | 415 | 422 | 429 | 500 | 502 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const unauthorised = () => new HttpError(401, 'unauthorised', 'Please sign in.');
export const forbidden = (msg = 'You do not have permission to do that.') => new HttpError(403, 'forbidden', msg);
/** Used for both missing and not-owned resources, so existence is never leaked. */
export const notFound = (what = 'Resource') => new HttpError(404, 'not_found', `${what} not found.`);
export const conflict = (msg: string) => new HttpError(409, 'conflict', msg);
export const invalid = (msg: string, code = 'invalid') => new HttpError(422, code, msg);
export const notConfigured = (what: string) => new HttpError(503, 'not_configured', `${what} is not configured on this server.`);

export function toResponseBody(err: unknown): { status: number; body: { error: string; message: string; issues?: unknown } } {
  if (err instanceof HttpError) return { status: err.status, body: { error: err.code, message: err.message } };
  if (err instanceof ZodError) {
    return { status: 422, body: { error: 'validation', message: 'Some fields are invalid.', issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })) } };
  }
  // Never echo internal error messages to clients.
  return { status: 500, body: { error: 'internal', message: 'Something went wrong. Please try again.' } };
}

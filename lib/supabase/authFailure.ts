/**
 * Telling "this visitor is not signed in" apart from "Supabase Auth could not
 * answer".
 *
 * Both reach a caller as an error with no user, and a page that redirects on
 * no user turns a slow Auth server into a sign-out. On 2026-09-25 that is what
 * members saw: a password sign-in that succeeded, then Home, whose claim check
 * timed out fetching the signing keys, sending them straight to /landing with
 * their session cookie still intact.
 */
export function isRetryableAuthFailure(error: unknown): boolean {
  const source = error as { name?: unknown; status?: unknown; message?: unknown } | null;
  const name = typeof source?.name === "string" ? source.name : "";
  const message = typeof source?.message === "string" ? source.message : "";
  return (
    source?.status === 0 ||
    source?.status === 409 ||
    name.includes("Retryable") ||
    name.includes("Timeout") ||
    message.includes("did not respond within") ||
    message.includes("concurrent token refresh")
  );
}

/**
 * Thrown where a page would otherwise have redirected a member to sign in, when
 * the real answer is that Auth did not respond. The route's error boundary
 * offers a retry, and the session cookie is left alone.
 */
export class AuthUnavailableError extends Error {
  readonly reason: unknown;

  constructor(reason: unknown) {
    super("Supabase Auth did not answer, so the session could not be checked.");
    this.name = "AuthUnavailableError";
    this.reason = reason;
  }
}

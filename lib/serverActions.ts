import "server-only";

import { getCurrentUser } from "@/lib/serverAuth";

/**
 * The shape every mutation migrated off the browser returns, and the one way
 * those mutations learn who is acting.
 *
 * Two rules are encoded here rather than left to each call site:
 *
 *   - **The viewer is derived, never supplied.** `requireViewer()` reads the
 *     session. No migrated action takes a user id, a profile id or an owner id
 *     as an argument, because an argument is something a caller can choose and
 *     a browser is a caller. This is the single most important property of the
 *     Phase 2 migration: RLS used to make a forged id harmless, and after the
 *     move to a direct PostgreSQL connection it will not.
 *   - **A failure is a value, not a thrown database error.** `fail()` carries a
 *     sentence a reader can act on. Passing `error.message` straight through
 *     leaks column names, constraint names and policy names to the client,
 *     which is how a UI ends up displaying
 *     "new row violates row-level security policy for table posts".
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export function ok(): ActionResult<null>;
export function ok<T>(data: T): ActionResult<T>;
export function ok<T>(data?: T): ActionResult<T | null> {
  return { ok: true, data: data ?? null };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}

/**
 * The acting user for this request, or null when there is no session.
 *
 * Memoised for the render by `lib/serverAuth.ts`, so an action that needs the
 * viewer in two places pays for one Auth round trip rather than two.
 */
export async function requireViewer(): Promise<{ userId: string } | null> {
  const user = await getCurrentUser();
  return user ? { userId: user.id } : null;
}

/**
 * A rejection that does not say which of "no such row" and "not yours" was
 * true.
 *
 * Distinguishing them turns any mutation endpoint into an existence oracle:
 * a stranger who can tell "no such post" from "not your post" can enumerate
 * private drafts by id without ever reading one. The server still logs the
 * difference; the client is told the same thing either way.
 */
export const NOT_FOUND_OR_FORBIDDEN =
  "That item does not exist, or you do not have permission to change it.";

export const NOT_SIGNED_IN = "You must be signed in to do that.";

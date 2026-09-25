import "server-only";

import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { AuthUnavailableError, isRetryableAuthFailure } from "@/lib/supabase/authFailure";
import { createClient } from "@/lib/supabase/server";

/**
 * The viewer for one server render.
 *
 * `supabase.auth.getUser()` is not a local cookie read: it posts the token to
 * Supabase Auth and waits for it to be validated. `/post/[slug]` called it
 * twice per request, once in `generateMetadata()` and once in the page, so
 * every article view cost two auth round trips. During the outages that was
 * two chances to collect a 504.
 *
 * Memoised with React's `cache()`, which lasts exactly one server render. This
 * is deliberately NOT a cross-request cache: the value identifies a person, and
 * caching it beyond the render that asked for it would hand one reader's
 * session to the next.
 */
async function loadCurrentUser(): Promise<User | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ?? null;
}

export const getCurrentUser = cache(loadCurrentUser);

/** The uncached implementation, for tests. */
export { loadCurrentUser as loadCurrentUserUncached };

/**
 * The signed-in user, for a page that sends everyone else to sign in.
 *
 * `getUser()` answers "no user" both for a visitor with no session and for a
 * session Auth did not get round to checking, and redirecting on the second
 * signs a member out because Supabase was slow. Here no session is null, and
 * an Auth server that did not answer throws, so the route's error boundary
 * offers a retry and the session cookie is left alone.
 */
export async function getUserForProtectedPage(
  supabase: Pick<SupabaseClient, "auth">
): Promise<User | null> {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error && isRetryableAuthFailure(error)) throw new AuthUnavailableError(error);
  return user ?? null;
}

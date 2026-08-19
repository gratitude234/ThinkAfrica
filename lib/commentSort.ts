/**
 * The sort vocabulary for a comment thread, kept apart from commentThread.ts
 * so both sides can import it.
 *
 * commentThread.ts reaches `lib/blocking` and from there `lib/supabase/admin`,
 * which is `server-only`. A client component importing a *value* from that
 * chain pulls the whole thing into the browser bundle and the build fails, so
 * the shared contract lives here where it costs nothing to import.
 */

export type CommentSort = "top" | "new";

/**
 * Score first, by default.
 *
 * Every comment has carried an upvote button, a running count and a SECURITY
 * DEFINER RPC keeping `comments.upvotes` in step with `comment_votes` -- and
 * the score was never read back, because the only ordering was `created_at
 * desc`. Voting changed nothing, and newest-first put the least considered
 * replies on top.
 */
export const DEFAULT_COMMENT_SORT: CommentSort = "top";

export function isCommentSort(value: unknown): value is CommentSort {
  return value === "top" || value === "new";
}

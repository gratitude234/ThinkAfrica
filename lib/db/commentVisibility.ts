import "server-only";

/**
 * The `comments` row-visibility rule, as SQL.
 *
 * The policy is
 *
 *     hidden_at IS NULL OR auth.uid() = author_id OR public.is_admin()
 *
 * and `is_admin()` is a `SECURITY DEFINER` function whose whole body is a
 * lookup of `auth.uid()` in `profiles.role`. A direct connection has neither
 * `auth.uid()` nor the request context the function reads, so both halves have
 * to be carried explicitly.
 *
 * Moderation is the reason this matters more than most. A comment is hidden
 * because someone decided it should not be read; a port that quietly drops the
 * predicate republishes it, and nothing about the page looks wrong afterwards.
 *
 * `lib/db/feed.ts` inlined this before the helper existed and is the reason
 * the shape is known to be right. It now uses the helper, so the feed's
 * comment count and the comment thread cannot drift apart about what a visible
 * comment is.
 */

/**
 * True for the comment rows `viewerParam` may read.
 *
 * `alias` and `viewerParam` are SQL fragments the repository chooses, never
 * values from a request. The viewer id itself travels as a bound parameter.
 *
 * The admin branch is a subquery rather than a caller-supplied "isAdmin" flag,
 * deliberately: a flag is something a call site can get wrong, and the one
 * place that would show is a moderated comment appearing on a public page.
 */
export function commentVisibleSql(alias: string, viewerParam: string): string {
  return `(
    ${alias}.hidden_at is null
    or (${viewerParam}::uuid is not null and ${alias}.author_id = ${viewerParam}::uuid)
    or exists (
      select 1 from public.profiles admin_check
      where admin_check.id = ${viewerParam}::uuid
        and admin_check.role = 'admin'
    )
  )`;
}

import "server-only";

/**
 * The `posts` row-visibility rule, as SQL.
 *
 * The policy is
 *
 *     status = 'published'
 *     OR auth.uid() = author_id
 *     OR public.is_post_reviewer(id)
 *     OR public.is_post_coauthor(id)
 *
 * with a second policy admitting editors and admins to the editorial statuses.
 * The two `SECURITY DEFINER` helpers read `auth.uid()`, which a direct
 * connection does not have, so both are inlined against a parameter.
 *
 * ## Most queries do not need this
 *
 * A query that already filters `status = 'published'`, or one that filters
 * `author_id = <the viewer>`, satisfies the policy by its own WHERE clause and
 * gains nothing from repeating it. That is the common case across `lib/db`,
 * and repeating the rule there would only make the plan worse.
 *
 * This exists for the queries that do not: an embed of a post reached through
 * some other table, where the post's own status is unconstrained. A pending
 * co-author invitation is the clearest example. The post is usually a draft,
 * and it is visible only because the invitee counts as a co-author, which is a
 * fact about `post_authors` rather than about the post.
 *
 * ## Two notes on faithfulness
 *
 * `is_post_coauthor` deliberately has no `accepted_at` filter, so a pending
 * invitee can see the draft they were invited to. Adding one here would break
 * the invitation screen while looking like a tightening.
 *
 * `is_post_reviewer` filters `removed_at is null`, so a reviewer taken off a
 * post loses access. Dropping that would leave a former reviewer able to read
 * an unpublished submission.
 */

/** True for the post rows `viewerParam` may read. */
export function postVisibleSql(alias: string, viewerParam: string): string {
  return `(
    ${alias}.status = 'published'
    or (${viewerParam}::uuid is not null and ${alias}.author_id = ${viewerParam}::uuid)
    or exists (
      select 1 from public.post_reviews reviewer_check
      where reviewer_check.post_id = ${alias}.id
        and reviewer_check.reviewer_id = ${viewerParam}::uuid
        and reviewer_check.removed_at is null
    )
    or exists (
      select 1 from public.post_authors coauthor_check
      where coauthor_check.post_id = ${alias}.id
        and coauthor_check.user_id = ${viewerParam}::uuid
    )
  )`;
}

/**
 * The `post_references` rule, which is not the posts rule and is easy to
 * mistake for it.
 *
 *     EXISTS (published post)  OR  is_post_reviewer(post_id)
 *                              OR  is_post_coauthor(post_id)
 *
 * The author is deliberately absent. An author reading the reference count on
 * their own *unpublished* draft therefore sees zero, which is what production
 * shows today. It looks like an oversight in the policy and may well be one,
 * but a migration is the wrong place to decide that: changing it here would
 * alter a number on the dashboard with no product decision behind it.
 */
export function postReferenceVisibleSql(
  alias: string,
  viewerParam: string
): string {
  return `(
    exists (
      select 1 from public.posts reference_post
      where reference_post.id = ${alias}.post_id
        and reference_post.status = 'published'
    )
    or exists (
      select 1 from public.post_reviews reviewer_check
      where reviewer_check.post_id = ${alias}.post_id
        and reviewer_check.reviewer_id = ${viewerParam}::uuid
        and reviewer_check.removed_at is null
    )
    or exists (
      select 1 from public.post_authors coauthor_check
      where coauthor_check.post_id = ${alias}.post_id
        and coauthor_check.user_id = ${viewerParam}::uuid
    )
  )`;
}

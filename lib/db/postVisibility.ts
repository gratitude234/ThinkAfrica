import "server-only";

/**
 * Canonical visibility for a publication on the direct-Postgres path.
 *
 * Co-authoring and editorial review are retired products. Unpublished work is
 * readable only by its primary author; published work is public. Keeping this
 * rule independent of post_reviews/post_authors lets Phase 2J remove those
 * legacy tables without changing the product contract.
 */
export function postVisibleSql(alias: string, viewerParam: string): string {
  return `(
    ${alias}.status = 'published'
    or (${viewerParam}::uuid is not null and ${alias}.author_id = ${viewerParam}::uuid)
  )`;
}

/**
 * References follow the publication they belong to. A published publication's
 * sources are public; an unpublished publication's sources are visible only to
 * its primary author.
 */
export function postReferenceVisibleSql(
  alias: string,
  viewerParam: string
): string {
  return `exists (
    select 1 from public.posts reference_post
    where reference_post.id = ${alias}.post_id
      and (
        reference_post.status = 'published'
        or (${viewerParam}::uuid is not null and reference_post.author_id = ${viewerParam}::uuid)
      )
  )`;
}

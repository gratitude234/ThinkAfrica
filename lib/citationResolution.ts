import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  collectInternalWorkRefs,
  parseInternalWorkRef,
  type ResolvableReference,
} from "@/lib/internalWorkLink";

/**
 * Turning reference URLs into canonical citation edges at save time.
 *
 * The backfill in 20260827000001 handles history; this handles everything
 * written from now on, so the edge exists the moment an author saves rather
 * than waiting for a periodic job. One query per save regardless of how many
 * references there are: the URLs are resolved as a batch.
 */
export interface ResolvedReference extends ResolvableReference {
  referenced_post_id: string | null;
}

/**
 * Resolves each reference's URL to the published work it points at.
 *
 * Only published works resolve. A reference to a draft produces no edge, and
 * if that draft is later published the backfill picks it up; an edge to
 * unpublished work would otherwise leak its existence through a citation
 * count.
 *
 * The first reference to a given work keeps the edge. A bibliography that
 * lists the same piece twice produces one edge, which is also what the
 * partial unique index enforces, so this is not merely cosmetic: sending both
 * would fail the insert.
 */
export async function resolveReferenceCitations<T extends ResolvableReference>(
  supabase: SupabaseClient,
  references: T[],
  options: { appUrl?: string | null; citingPostId?: string | null } = {}
): Promise<Array<T & { referenced_post_id: string | null }>> {
  const refs = collectInternalWorkRefs(references, options.appUrl);
  if (refs.length === 0) {
    return references.map((reference) => ({ ...reference, referenced_post_id: null }));
  }

  const slugs = refs.filter((ref) => ref.kind === "slug").map((ref) => ref.value);
  const citationIds = refs
    .filter((ref) => ref.kind === "citation_id")
    .map((ref) => ref.value);

  const [slugResult, citationResult] = await Promise.all([
    slugs.length > 0
      ? supabase
          .from("posts")
          .select("id, slug, citation_id")
          .in("slug", slugs)
          .eq("status", "published")
      : Promise.resolve({ data: [], error: null }),
    citationIds.length > 0
      ? supabase
          .from("posts")
          .select("id, slug, citation_id")
          .in("citation_id", citationIds)
          .eq("status", "published")
      : Promise.resolve({ data: [], error: null }),
  ]);

  type Row = { id: string; slug: string; citation_id: string | null };
  const bySlug = new Map<string, string>();
  const byCitationId = new Map<string, string>();

  for (const row of [
    ...((slugResult.data ?? []) as Row[]),
    ...((citationResult.data ?? []) as Row[]),
  ]) {
    bySlug.set(row.slug.toLowerCase(), row.id);
    if (row.citation_id) byCitationId.set(row.citation_id.toUpperCase(), row.id);
  }

  const claimed = new Set<string>();
  return references.map((reference) => {
    const parsed = parseInternalWorkRef(reference.url, options.appUrl);
    if (!parsed) return { ...reference, referenced_post_id: null };

    const postId =
      parsed.kind === "slug"
        ? bySlug.get(parsed.value.toLowerCase())
        : byCitationId.get(parsed.value.toUpperCase());

    // A work never cites itself through this mechanism: the edge would be
    // meaningless, and the view excludes it anyway.
    if (!postId || postId === options.citingPostId) {
      return { ...reference, referenced_post_id: null };
    }
    if (claimed.has(postId)) return { ...reference, referenced_post_id: null };

    claimed.add(postId);
    return { ...reference, referenced_post_id: postId };
  });
}

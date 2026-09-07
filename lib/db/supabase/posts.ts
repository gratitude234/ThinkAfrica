import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  VISIBLE_POST_STATUSES,
  type PostRecord,
  type PostsRepository,
} from "@/lib/db/types";

/**
 * The production implementation: the same PostgREST query the post route has
 * always run, moved behind the repository interface without a single filter
 * changing.
 *
 * This is the default and stays the default for the whole of the migration.
 * Nothing in here is new work; the point of the move is that the route now
 * names a capability rather than a provider, so the Postgres implementation
 * can be swapped in one domain at a time.
 */

/**
 * The union of what the page render and the metadata pass each used to select
 * separately. Metadata needed title/excerpt/content/cover/type/status/author,
 * and the page needed all of that plus the rest; one select covering both is
 * cheaper than two overlapping ones, because a wide select over a single row
 * costs a fraction of a second round trip.
 *
 * PostgREST-specific, which is why it lives here rather than in lib/db/types.
 */
export const POST_CORE_SELECT = `
      id, title, slug, content, excerpt, type, content_kind, article_format, tags, status, author_id,
      created_at, published_at, view_count, impression_count, read_count, cover_image_url, citation_id,
      published_version_id, current_round, revision_due_at,
      in_response_to,
      audio_summary_url,
      document_path, document_original_name, document_mime_type, document_size_bytes,
      profiles!posts_author_id_fkey (id, username, full_name, university, field_of_study, bio, avatar_url, verified, verified_type)
    `;

export const supabasePostsRepository: PostsRepository = {
  async findBySlug(slug: string): Promise<PostRecord | null> {
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("posts")
      .select(POST_CORE_SELECT)
      .eq("slug", slug)
      .in("status", VISIBLE_POST_STATUSES as unknown as string[])
      .maybeSingle();

    if (error) {
      console.error(`[post/${slug}] core post query failed`, error);
      throw new Error(`Failed to load post "${slug}".`);
    }

    return (data as PostRecord | null) ?? null;
  },
};

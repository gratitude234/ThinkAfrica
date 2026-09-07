/**
 * The row shapes and repository contracts that cross the lib/db boundary.
 *
 * Everything here is provider-neutral on purpose. A type in this file must be
 * satisfiable by a PostgREST response and by a row from a direct `select`
 * alike, because both implementations return it and callers cannot tell which
 * one answered. Anything that only one provider can produce belongs in that
 * provider's own directory instead.
 */

/**
 * Statuses a slug lookup is allowed to resolve.
 *
 * Draft, pending and pending_revision come back so the caller can gate them on
 * the viewer; rejected posts are not addressable by slug at all. This is a
 * route contract rather than an authorization decision, and it is the same
 * under both adapters. See the note on `PostsRepository.findBySlug`.
 */
export const VISIBLE_POST_STATUSES = [
  "published",
  "pending",
  "pending_revision",
  "draft",
] as const;

export type VisiblePostStatus = (typeof VISIBLE_POST_STATUSES)[number];

export interface AuthorProfile {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
  verified?: boolean;
  verified_type?: string | null;
}

export interface PostRecord {
  id: string;
  title: string | null;
  slug: string;
  content: string | null;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  tags: string[] | null;
  status: string;
  author_id: string;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  cover_image_url: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  current_round: number | null;
  revision_due_at: string | null;
  in_response_to: string | null;
  audio_summary_url: string | null;
  document_path: string | null;
  document_original_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
  /** PostgREST returns an embedded one-to-one either as an object or as a
   *  single-element array depending on how it resolves the relationship. The
   *  Postgres adapter always builds an object. `getPostAuthor` absorbs both. */
  profiles: AuthorProfile | AuthorProfile[] | null;
}

/** Normalises the embedded author whichever shape the provider returned. */
export function getPostAuthor(post: PostRecord): AuthorProfile | null {
  const profiles = post.profiles;
  if (!profiles) return null;
  return Array.isArray(profiles) ? profiles[0] ?? null : profiles;
}

export interface PostsRepository {
  /**
   * The core row for a post addressed by slug, or null.
   *
   * IMPORTANT, and the single most consequential line in this file: this
   * returns drafts and in-review posts. It is a lookup, not a permission
   * check, and it performs no authorization of its own under either adapter.
   *
   * Under Supabase the row also passes through RLS, so a stranger's draft
   * comes back null before the route ever sees it. Under a direct Postgres
   * connection there is no such second gate, and the route's own status
   * checks become the whole of the authorization. Those checks live in
   * `PostPage()` and are pinned by lib/db/posts.authorization.test.ts.
   */
  findBySlug(slug: string): Promise<PostRecord | null>;
}

/** Everything lib/db exposes, grouped by domain. One domain today; the shape
 *  is what lets the next one be added without touching call sites. */
export interface Database {
  /** Which implementation answered. Useful in logs during the migration. */
  readonly adapter: "supabase" | "postgres";
  readonly posts: PostsRepository;
}

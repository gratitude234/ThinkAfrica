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
  content_kind?: string | null;
  tags: string[] | null;
  status: string;
  author_id: string;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  cover_image_url: string | null;
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
  findBySlug(
    slug: string,
    viewerId: string | null
  ): Promise<PostRecord | null>;
}

/** Everything lib/db exposes, grouped by domain. One domain today; the shape
 *  is what lets the next one be added without touching call sites. */
export interface Database {
  /** Which implementation answered. Useful in logs during the migration. */
  readonly adapter: "supabase" | "postgres";
  readonly posts: PostsRepository;
  readonly profiles: ProfilesRepository;
}

// ---------------------------------------------------------------------------
// Profiles
// ---------------------------------------------------------------------------

/**
 * The public identity of a member, as a writer's profile renders it.
 *
 * Deliberately the *public* projection and nothing more. `notification_prefs`
 * and `privacy_settings` are absent because they are viewer-private, and
 * moving a private read behind an adapter before its authorization semantics
 * are explicit is exactly what the Phase 4 brief says not to do.
 *
 * The publishing reset, Phase 2G, took the persona type, the positioning
 * statement, the organisation, the cover image and the alumni flag out of it.
 * Their columns are still in the database; nothing on a profile reads them.
 *
 * Mirrors `ProfileIdentityRecord` in lib/profileViewData.ts, which re-exports
 * this so no caller has to move.
 */
export interface ProfileIdentityRecord {
  /** Existing writer-supplied organisation URL; read-only on this surface. */
  organization_website?: string | null;
  id: string;
  username: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  /** The member's own headline, shown under their name. */
  professional_title: string | null;
  /** Location, on About. */
  country: string | null;
  /** Education, on About. Ordinary optional facts, never a requirement. */
  university: string | null;
  field_of_study: string | null;
  graduation_year: number | null;
  interests: string[] | null;
  verified: boolean;
  verified_type: string | null;
  /** When the member joined, as the ISO string PostgREST serialises. */
  created_at: string;
}

export interface ProfilesRepository {
  /**
   * One member's public identity, by username, or null.
   *
   * A public read: it returns what any visitor may see, so unlike
   * `PostsRepository.findBySlug` there is no status gate for the caller to
   * apply afterwards. What it does share with that method is that it performs
   * no authorization of its own, and it is not the place to add any: a
   * private field would need a viewer, and this method has none by design.
   */
  findIdentityByUsername(
    username: string,
    viewerId: string | null
  ): Promise<ProfileIdentityRecord | null>;
}

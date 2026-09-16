import "server-only";

/**
 * The member's saved posts, as PostgreSQL.
 *
 * ## Why this exists at all
 *
 * The bookmarks page was a client component that queried the database from the
 * browser, against the anon key, and RLS made that safe: `bookmarks` is
 * `USING (auth.uid() = user_id)`, so a browser could only ever read its own.
 *
 * That stops working the moment the database is Neon. There is no anon key to
 * give a browser and there is no version of this migration where one exists: a
 * connection string is not a public credential. So the query moves to the
 * server, behind `/api/bookmarks`, and the browser asks the application
 * instead of asking the database. This is the same move search made, for the
 * same reason.
 *
 * The ownership rule therefore stops being RLS and becomes an explicit
 * `user_id = <the viewer the server resolved>`. The route never reads a user
 * id from the request: an id a caller can choose is an id a caller can forge,
 * and this is somebody's private reading list.
 *
 * ## What the post filter does and does not do
 *
 * `posts` is joined, not filtered on status. A bookmark can outlive the
 * publication of what it points at, and the PostgREST embed returned the row
 * whenever RLS let it through, which for the bookmark's owner includes their
 * own unpublished work. `postVisibleSql` reproduces exactly that.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { postVisibleSql } from "@/lib/db/postVisibility";
import { visibleProfileJoin } from "@/lib/db/profileVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface BookmarkedPostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  content_kind: string | null;
  tags: string[] | null;
  created_at: string;
  published_at: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  word_count: number | null;
  cover_image_url: string | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
}

export interface BookmarksRepository {
  /** This member's bookmarked posts, newest bookmark first. */
  list(viewerId: string): Promise<BookmarkedPostRow[]>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const LIST_SQL = `
  select
    p.id, p.author_id, p.title, p.slug, p.excerpt,
    p.content_kind, to_jsonb(p.tags) as tags,
    p.created_at, p.published_at, p.view_count, p.impression_count,
    p.read_count, p.word_count, p.cover_image_url,
    case when author.id is null then null else jsonb_build_object(
      'username', author.username,
      'full_name', author.full_name,
      'avatar_url', author.avatar_url
    ) end as profiles
  from public.bookmarks b
  join public.posts p
    on p.id = b.post_id
   and ${postVisibleSql("p", "$1")}
  ${visibleProfileJoin("author", "p.author_id", "$1")}
  where b.user_id = $1::uuid
  order by b.created_at desc
`;

// ── Shared ───────────────────────────────────────────────────────────

const SELECT = `post_id, posts!bookmarks_post_id_fkey (
            id, author_id, title, slug, excerpt, content_kind, tags, created_at, published_at, view_count, impression_count, read_count, word_count, cover_image_url,
            profiles!posts_author_id_fkey (username, full_name, avatar_url)
          )`;

export function createSupabaseBookmarksRepository(
  supabase: SupabaseClient
): BookmarksRepository {
  return {
    backend: "supabase",

    async list(viewerId) {
      const { data, error } = await supabase
        .from("bookmarks")
        .select(SELECT)
        .eq("user_id", viewerId)
        .order("created_at", { ascending: false });

      if (error) throw new Error(`bookmarks failed: ${error.message}`);

      // The embed comes back nested; the page has always flattened it. Doing
      // it here means both backends hand the caller the same shape.
      return ((data ?? []) as unknown as Array<{
        posts: BookmarkedPostRow | BookmarkedPostRow[] | null;
      }>).flatMap((row) => {
        const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
        return post ? [post] : [];
      });
    },
  };
}

export function createPostgresBookmarksRepository(
  executor: SqlExecutor
): BookmarksRepository {
  return {
    backend: "postgres",

    async list(viewerId) {
      return executor.query<BookmarkedPostRow>(LIST_SQL, [viewerId]);
    },
  };
}

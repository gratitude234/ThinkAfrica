import "server-only";

/**
 * The composer's reads: a member's drafts, one post's revision history, and
 * whether a username is taken.
 *
 * ## Why these exist
 *
 * All three were queries a client component issued against the anon key. RLS
 * made them safe, and RLS has no successor: after the migration there is no
 * key a browser can hold, because a connection string is not a public
 * credential.
 *
 * Moving them server-side changes what enforces the rules, and each one needed
 * a different answer:
 *
 * - **Drafts** were filtered `author_id = <a prop>`. The prop is now ignored
 *   and the viewer comes from the session. RLS refused a wrong id; nothing
 *   would refuse it on a direct connection.
 * - **Revisions** were filtered by `post_id` alone, with *no* ownership
 *   predicate at all. The `post_revisions` policy was doing the whole job, so
 *   this is the one that needed a rule written rather than moved.
 * - **Username availability** compared against a browser-supplied profile id
 *   to exclude "myself". That is now the session's viewer, so a caller cannot
 *   ask whether a name is free for somebody else.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { postVisibleSql } from "@/lib/db/postVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface DraftRow {
  id: string;
  title: string | null;
  excerpt: string | null;
  word_count: number | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  updated_at: string;
}

/** The narrower projection the "continue where you left off" row reads. */
export interface ResumableDraftRow {
  id: string;
  title: string | null;
  type: string;
  content_kind: string | null;
  updated_at: string;
}

export interface RevisionRow {
  id: string;
  title: string | null;
  excerpt: string | null;
  content: string | null;
  word_count: number | null;
  created_at: string;
}

export interface ComposerRepository {
  /** Every draft this member owns, newest edit first. */
  myDrafts(viewerId: string, limit: number): Promise<DraftRow[]>;
  /** The few most recent drafts, for the resume prompt. */
  resumableDrafts(viewerId: string, limit: number): Promise<ResumableDraftRow[]>;
  /**
   * One post's revision snapshots, newest first.
   *
   * Returns null when the viewer may not read the post at all, which is a
   * different answer from a post with no revisions.
   */
  postRevisions(
    postId: string,
    viewerId: string,
    limit: number
  ): Promise<RevisionRow[] | null>;
  /** Whether the name belongs to somebody who is not this member. */
  isUsernameTaken(username: string, viewerId: string): Promise<boolean>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

const MY_DRAFTS_SQL = `
  select
    p.id, p.title, p.excerpt, p.word_count, p.type,
    p.content_kind, p.article_format, p.updated_at
  from public.posts p
  where p.author_id = $1::uuid
    and p.status = 'draft'
  order by p.updated_at desc
  limit $2::int
`;

const RESUMABLE_SQL = `
  select p.id, p.title, p.type, p.content_kind, p.updated_at
  from public.posts p
  where p.author_id = $1::uuid
    and p.status = 'draft'
  order by p.updated_at desc
  limit $2::int
`;

/**
 * The access check the browser query never made.
 *
 * `post_revisions` was filtered on `post_id` alone; its policy decided the
 * rest. `postVisibleSql` is that decision written out: published, or the
 * author, or an assigned reviewer, or a co-author. The revisions themselves
 * are then unconditional, because a viewer who may read the post may read its
 * history.
 */
const REVISIONS_SQL = `
  select r.id, r.title, r.excerpt, r.content, r.word_count, r.created_at
  from public.post_revisions r
  where r.post_id = $1::uuid
    and exists (
      select 1 from public.posts p
      where p.id = r.post_id
        and ${postVisibleSql("p", "$2")}
    )
  order by r.created_at desc
  limit $3::int
`;

/** Whether the viewer may see the post at all, asked separately so "no access"
 *  and "no revisions yet" are different answers. */
const CAN_READ_POST_SQL = `
  select 1 as ok
  from public.posts p
  where p.id = $1::uuid
    and ${postVisibleSql("p", "$2")}
`;

const USERNAME_TAKEN_SQL = `
  select 1 as taken
  from public.profiles p
  where p.username = $1::text
    and p.id <> $2::uuid
  limit 1
`;

// ── Shared ───────────────────────────────────────────────────────────

function rows<T>(result: { data?: unknown; error?: unknown }, label: string): T[] {
  if (result.error) {
    const source = result.error as { message?: unknown };
    throw new Error(
      `${label}: ${typeof source.message === "string" ? source.message : "database error"}`
    );
  }
  return (result.data ?? []) as T[];
}

const DRAFT_SELECT =
  "id, title, excerpt, word_count, type, content_kind, article_format, updated_at";
const RESUMABLE_SELECT = "id, title, type, content_kind, updated_at";
const REVISION_SELECT = "id, title, excerpt, content, word_count, created_at";

// ── Supabase ─────────────────────────────────────────────────────────

export function createSupabaseComposerRepository(
  supabase: SupabaseClient
): ComposerRepository {
  return {
    backend: "supabase",

    async myDrafts(viewerId, limit) {
      const result = await supabase
        .from("posts")
        .select(DRAFT_SELECT)
        .eq("author_id", viewerId)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(limit);
      return rows<DraftRow>(result, "drafts");
    },

    async resumableDrafts(viewerId, limit) {
      const result = await supabase
        .from("posts")
        .select(RESUMABLE_SELECT)
        .eq("author_id", viewerId)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(limit);
      return rows<ResumableDraftRow>(result, "resumable drafts");
    },

    async postRevisions(postId, viewerId, limit) {
      // The policy decides visibility on this side, so a viewer without access
      // sees no rows. Asking about the post first is what turns that into the
      // same null the PostgreSQL side returns.
      const access = await supabase
        .from("posts")
        .select("id")
        .eq("id", postId)
        .maybeSingle();
      if (access.error) {
        throw new Error(`revision access: ${access.error.message}`);
      }
      if (!access.data) return null;

      const result = await supabase
        .from("post_revisions")
        .select(REVISION_SELECT)
        .eq("post_id", postId)
        .order("created_at", { ascending: false })
        .limit(limit);
      return rows<RevisionRow>(result, "revisions");
    },

    async isUsernameTaken(username, viewerId) {
      const result = await supabase
        .from("profiles")
        .select("id")
        .eq("username", username)
        .neq("id", viewerId)
        .maybeSingle();

      // A username lookup that fails must not report "available": the member
      // would be sent into a submit that then rejects them.
      if (result.error) {
        throw new Error(`username check: ${result.error.message}`);
      }
      return result.data !== null;
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

export function createPostgresComposerRepository(
  executor: SqlExecutor
): ComposerRepository {
  return {
    backend: "postgres",

    async myDrafts(viewerId, limit) {
      return executor.query<DraftRow>(MY_DRAFTS_SQL, [viewerId, limit]);
    },

    async resumableDrafts(viewerId, limit) {
      return executor.query<ResumableDraftRow>(RESUMABLE_SQL, [viewerId, limit]);
    },

    async postRevisions(postId, viewerId, limit) {
      const access = await executor.query<{ ok: number }>(CAN_READ_POST_SQL, [
        postId,
        viewerId,
      ]);
      if (access.length === 0) return null;

      return executor.query<RevisionRow>(REVISIONS_SQL, [postId, viewerId, limit]);
    },

    async isUsernameTaken(username, viewerId) {
      const result = await executor.query<{ taken: number }>(USERNAME_TAKEN_SQL, [
        username,
        viewerId,
      ]);
      return result.length > 0;
    },
  };
}

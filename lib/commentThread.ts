/**
 * Reads a post's comment thread. Shared by the server component that renders
 * the first page and the server action behind "Load more", so the grouping,
 * ordering, block-filtering and vote hydration can't drift apart.
 *
 * Always call this with the *viewer's* Supabase client, never the admin one:
 * moderated comments are excluded by the RLS SELECT policy
 * (`hidden_at is null or auth.uid() = author_id or public.is_admin()`), so a
 * service-role read would leak hidden content.
 */

import { getBlockedUserIds } from "@/lib/blocking";

export interface CommentAuthorProfile {
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
}

export interface ThreadReply {
  id: string;
  content: string;
  created_at: string;
  updated_at: string | null;
  upvotes: number;
  parent_id: string | null;
  author_id: string;
  userVoted?: boolean;
  profiles: CommentAuthorProfile | null;
}

export interface ThreadComment extends ThreadReply {
  replies: ThreadReply[];
  replyCount: number;
}

export interface CommentPage {
  comments: ThreadComment[];
  hasMore: boolean;
  /** `created_at` of the last top-level comment returned, for the next page. */
  nextCursor: string | null;
  userVotedCommentIds: string[];
}

/** Top-level comments per page. Replies to those always come with them -- a
 *  thread that stops mid-answer is worse than a long one. */
export const COMMENT_PAGE_SIZE = 20;

const COMMENT_SELECT =
  "id, content, created_at, updated_at, upvotes, parent_id, author_id, profiles!comments_author_id_fkey (username, full_name, avatar_url)";

type SupabaseLike = { from: (table: string) => any };

function normalizeRow(row: any): ThreadReply {
  return {
    id: row.id as string,
    content: row.content as string,
    created_at: row.created_at as string,
    updated_at: (row.updated_at ?? null) as string | null,
    upvotes: (row.upvotes ?? 0) as number,
    parent_id: (row.parent_id ?? null) as string | null,
    author_id: row.author_id as string,
    profiles: Array.isArray(row.profiles) ? (row.profiles[0] ?? null) : (row.profiles ?? null),
  };
}

export async function fetchCommentPage(
  supabase: SupabaseLike,
  {
    postId,
    viewerId,
    viewerProfileId,
    before,
    pageSize = COMMENT_PAGE_SIZE,
  }: {
    postId: string;
    viewerId: string | null;
    viewerProfileId?: string | null;
    /** `created_at` cursor: return top-level comments older than this. */
    before?: string | null;
    pageSize?: number;
  }
): Promise<CommentPage> {
  // Ask for one more top-level comment than needed, so `hasMore` is a fact
  // rather than a guess -- same trick fetchFeedPage uses.
  let topLevelQuery = supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .eq("post_id", postId)
    .is("parent_id", null)
    .order("created_at", { ascending: false })
    .limit(pageSize + 1);

  if (before) topLevelQuery = topLevelQuery.lt("created_at", before);

  const [{ data: topLevelRaw }, blockedIds] = await Promise.all([
    topLevelQuery,
    getBlockedUserIds(viewerId),
  ]);

  const blockedSet = new Set(blockedIds);
  const topLevelRows = ((topLevelRaw ?? []) as any[])
    .map(normalizeRow)
    .filter((row) => !blockedSet.has(row.author_id));

  const hasMore = topLevelRows.length > pageSize;
  const pageRows = topLevelRows.slice(0, pageSize);

  if (pageRows.length === 0) {
    return { comments: [], hasMore: false, nextCursor: null, userVotedCommentIds: [] };
  }

  const parentIds = pageRows.map((row) => row.id);
  const { data: repliesRaw } = await supabase
    .from("comments")
    .select(COMMENT_SELECT)
    .in("parent_id", parentIds)
    // Oldest-first within a thread so an exchange reads downwards.
    .order("created_at", { ascending: true });

  const repliesByParent = ((repliesRaw ?? []) as any[])
    .map(normalizeRow)
    .filter((row) => !blockedSet.has(row.author_id))
    .reduce<Record<string, ThreadReply[]>>((acc, reply) => {
      const key = reply.parent_id as string;
      acc[key] = [...(acc[key] ?? []), reply];
      return acc;
    }, {});

  const comments: ThreadComment[] = pageRows.map((row) => {
    const replies = repliesByParent[row.id] ?? [];
    return { ...row, parent_id: null, replies, replyCount: replies.length };
  });

  let userVotedCommentIds: string[] = [];
  if (viewerId) {
    const ids = comments.flatMap((comment) => [
      comment.id,
      ...comment.replies.map((reply) => reply.id),
    ]);
    if (ids.length > 0) {
      const { data: votes } = await supabase
        .from("comment_votes")
        .select("comment_id")
        .eq("user_id", viewerProfileId ?? viewerId)
        .in("comment_id", ids);
      userVotedCommentIds = ((votes ?? []) as Array<{ comment_id: string }>).map(
        (vote) => vote.comment_id
      );
    }
  }

  return {
    comments,
    hasMore,
    nextCursor: pageRows[pageRows.length - 1]?.created_at ?? null,
    userVotedCommentIds,
  };
}

/**
 * Total comments on a post, as the viewer is allowed to see them. Deliberately
 * a separate count rather than `comments.length`, so the heading is right when
 * only the first page is loaded.
 */
export async function countComments(
  supabase: SupabaseLike,
  postId: string
): Promise<number> {
  const { count } = await supabase
    .from("comments")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId);
  return count ?? 0;
}

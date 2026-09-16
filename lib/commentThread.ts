/**
 * Reads a post's comment thread. Shared by the server component that renders
 * the first page and the server action behind "Load more", so the grouping,
 * ordering, block-filtering and vote hydration can't drift apart.
 *
 * Always call this with the *viewer's* Supabase client, never the admin one:
 * on the PostgREST path, moderated comments are excluded by the RLS SELECT
 * policy (`hidden_at is null or auth.uid() = author_id or public.is_admin()`),
 * so a service-role read would leak hidden content.
 *
 * The queries themselves live in `lib/db/comments.ts`, in both transports. On
 * the PostgreSQL path there is no policy to lean on, so the same rule is
 * written into the SQL and the viewer arrives as a parameter. That is why
 * `viewerId` is now load-bearing rather than only being used for votes: it
 * decides which comments exist.
 */

import { getBlockedUserIds } from "@/lib/blocking";
import { commentsRepository } from "@/lib/db/readAdapter";
import { DEFAULT_COMMENT_SORT, type CommentSort } from "@/lib/commentSort";

export { DEFAULT_COMMENT_SORT, isCommentSort, type CommentSort } from "@/lib/commentSort";

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

/**
 * Keyset cursors, one shape per sort.
 *
 * `new` pages on `created_at` alone. `top` needs the tiebreaker in the cursor
 * as well, or every comment sharing a score would repeat or vanish across the
 * page boundary -- so it encodes `upvotes|created_at` and filters on the pair.
 */
function encodeCursor(sort: CommentSort, row: ThreadReply): string {
  return sort === "top" ? `${row.upvotes}|${row.created_at}` : row.created_at;
}

function decodeCursor(sort: CommentSort, cursor: string) {
  if (sort !== "top") return { createdAt: cursor, upvotes: null as number | null };
  const separator = cursor.indexOf("|");
  if (separator === -1) return { createdAt: cursor, upvotes: null as number | null };
  const upvotes = Number.parseInt(cursor.slice(0, separator), 10);
  return {
    createdAt: cursor.slice(separator + 1),
    upvotes: Number.isFinite(upvotes) ? upvotes : null,
  };
}

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
    sort = DEFAULT_COMMENT_SORT,
    pageSize = COMMENT_PAGE_SIZE,
  }: {
    postId: string;
    viewerId: string | null;
    viewerProfileId?: string | null;
    /** Keyset cursor from the previous page's `nextCursor`. Shape depends on
     *  `sort`, so the two must always be sent together. */
    before?: string | null;
    sort?: CommentSort;
    pageSize?: number;
  }
): Promise<CommentPage> {
  const repository = commentsRepository(supabase as never);
  const cursor = before
    ? decodeCursor(sort, before)
    : { createdAt: null as string | null, upvotes: null as number | null };

  // Ask for one more top-level comment than needed, so `hasMore` is a fact
  // rather than a guess -- same trick fetchFeedPage uses.
  const [topLevelRaw, blockedIds] = await Promise.all([
    repository.topLevel({
      postId,
      viewerId,
      sort,
      cursorCreatedAt: cursor.createdAt,
      cursorUpvotes: cursor.upvotes,
      limit: pageSize + 1,
    }),
    getBlockedUserIds(viewerId),
  ]);

  const blockedSet = new Set(blockedIds);
  const topLevelRows = (topLevelRaw as any[])
    .map(normalizeRow)
    .filter((row) => !blockedSet.has(row.author_id));

  const hasMore = topLevelRows.length > pageSize;
  const pageRows = topLevelRows.slice(0, pageSize);

  if (pageRows.length === 0) {
    return { comments: [], hasMore: false, nextCursor: null, userVotedCommentIds: [] };
  }

  const parentIds = pageRows.map((row) => row.id);
  // Oldest-first within a thread so an exchange reads downwards.
  const repliesRaw = await repository.replies(parentIds, viewerId);

  const repliesByParent = (repliesRaw as any[])
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
      userVotedCommentIds = await repository.votedCommentIds(
        ids,
        viewerProfileId ?? viewerId
      );
    }
  }

  const lastRow = pageRows[pageRows.length - 1];

  return {
    comments,
    hasMore,
    nextCursor: lastRow ? encodeCursor(sort, lastRow) : null,
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
  postId: string,
  viewerId: string | null
): Promise<number> {
  return commentsRepository(supabase as never).count(postId, viewerId);
}

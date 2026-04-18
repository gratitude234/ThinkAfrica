import type { PostCardData } from "@/components/post/PostCard";
import { rankPosts, type RankingContext } from "@/lib/feedRanking";

export type FeedTabKey = "home" | "following" | "latest";
export type FeedTimeframe = "all" | "week" | "month";

export interface FeedPageResult {
  posts: PostCardData[];
  hasMore: boolean;
}

interface FeedOptions {
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>;
  tab: FeedTabKey;
  page: number;
  pageSize: number;
  type: string | null;
  timeframe: FeedTimeframe;
  userId: string | null;
  userInterests: string[];
  userUniversity: string | null;
  followedIds: string[];
}

const POST_SELECT = `id, title, slug, excerpt, type, tags, created_at, published_at, view_count, cover_image_url, author_id,
  profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type)`;

function getTimeframeCutoff(timeframe: FeedTimeframe): string | null {
  if (timeframe === "week") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (timeframe === "month") {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

export async function getCountsByPostId(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  table: "likes" | "bookmarks" | "comments",
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const { data } = await supabase.from(table).select("post_id").in("post_id", postIds);

  return (data ?? []).reduce(
    (acc, row) => {
      const key = (row as { post_id?: string }).post_id;
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

function normalizePosts(
  raw: unknown[],
  likeCounts: Record<string, number>,
  bookmarkCounts: Record<string, number>,
  commentCounts: Record<string, number>
): PostCardData[] {
  return (raw as Array<Record<string, unknown>>).map((post) => {
    const id = (post.id as string) ?? "";
    return {
      ...(post as object),
      profiles: Array.isArray(post.profiles)
        ? (post.profiles as unknown[])[0]
        : post.profiles,
      like_count: likeCounts[id] ?? 0,
      bookmark_count: bookmarkCounts[id] ?? 0,
      comment_count: commentCounts[id] ?? 0,
    } as PostCardData;
  });
}

async function enrichPosts(
  supabase: FeedOptions["supabase"],
  raw: unknown[]
): Promise<PostCardData[]> {
  const ids = (raw as Array<{ id: string }>).map((post) => post.id);
  const [likeCounts, bookmarkCounts, commentCounts] = await Promise.all([
    getCountsByPostId(supabase, "likes", ids),
    getCountsByPostId(supabase, "bookmarks", ids),
    getCountsByPostId(supabase, "comments", ids),
  ]);

  return normalizePosts(raw, likeCounts, bookmarkCounts, commentCounts);
}

function applyPostFilters(
  query: any,
  {
    type,
    cutoff,
  }: {
    type: string | null;
    cutoff: string | null;
  }
) {
  let nextQuery = query.eq("status", "published");
  if (type && type !== "all") {
    nextQuery = nextQuery.eq("type", type);
  }
  if (cutoff) {
    nextQuery = nextQuery.gte("published_at", cutoff);
  }
  return nextQuery;
}

export async function fetchFeedPage({
  supabase,
  tab,
  page,
  pageSize,
  type,
  timeframe,
  userId,
  userInterests,
  userUniversity,
  followedIds,
}: FeedOptions): Promise<FeedPageResult> {
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(pageSize, 1), 30);
  const cutoff = getTimeframeCutoff(timeframe);

  if (tab === "following") {
    if (followedIds.length === 0) {
      return { posts: [], hasMore: false };
    }

    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const query = applyPostFilters(
      supabase.from("posts").select(POST_SELECT),
      { type, cutoff }
    );
    const { data } = await query
      .in("author_id", followedIds)
      .order("published_at", { ascending: false })
      .range(start, end);

    const raw = data ?? [];
    const posts = await enrichPosts(supabase, raw.slice(0, safePageSize));
    return { posts, hasMore: raw.length > safePageSize };
  }

  if (tab === "latest") {
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const query = applyPostFilters(
      supabase.from("posts").select(POST_SELECT),
      { type, cutoff }
    );
    const { data } = await query
      .order("published_at", { ascending: false })
      .range(start, end);

    const raw = data ?? [];
    const posts = await enrichPosts(supabase, raw.slice(0, safePageSize));
    return { posts, hasMore: raw.length > safePageSize };
  }

  const candidateLimit = Math.max(80, safePage * safePageSize + 20);
  const homeCutoff =
    cutoff ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const query = applyPostFilters(
    supabase.from("posts").select(POST_SELECT),
    {
      type,
      cutoff: homeCutoff,
    }
  );

  const { data } = await query
    .order("published_at", { ascending: false })
    .limit(candidateLimit);

  const enriched = await enrichPosts(supabase, data ?? []);
  const rankingContext: RankingContext = {
    userId,
    followedIds: new Set(followedIds),
    userInterests,
    userUniversity,
    userCountry: null,
  };

  const ranked = rankPosts(enriched, rankingContext);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    posts: ranked.slice(start, end),
    hasMore: ranked.length > end,
  };
}

import type { PostCardData } from "@/components/post/PostCard";
import { unstable_cache } from "next/cache";
import { rankPosts, type RankingContext } from "@/lib/feedRanking";
import {
  getFeedSurfaceReason,
  getPublicQualitySignals,
} from "@/lib/postQuality";
import { createAdminClient } from "@/lib/supabase/admin";

export type FeedTabKey = "home" | "following" | "latest";
export type FeedTimeframe = "all" | "week" | "month";

export interface FeedPageResult {
  posts: PostCardData[];
  hasMore: boolean;
}

interface FeedOptions {
  supabase: {
    from: (table: string) => any;
  };
  tab: FeedTabKey;
  page: number;
  pageSize: number;
  type: string | null;
  timeframe: FeedTimeframe;
  userId: string | null;
  userInterests: string[];
  userUniversity: string | null;
  followedIds: string[];
  excludedAuthorIds?: string[];
}

type PublicFeedCacheInput = Pick<
  FeedOptions,
  "tab" | "page" | "pageSize" | "type" | "timeframe"
>;

const POST_SELECT =
  "id, title, slug, in_response_to, excerpt, type, tags, created_at, published_at, view_count, impression_count, read_count, cover_image_url, citation_id, published_version_id, document_original_name, document_mime_type, document_size_bytes, author_id";

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
  supabase: {
    from: (table: string) => any;
  },
  table: "likes" | "bookmarks" | "comments" | "post_references",
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const { data } = await supabase.from(table).select("post_id").in("post_id", postIds);

  return (data ?? []).reduce(
    (acc: Record<string, number>, row: { post_id?: string }) => {
      const key = (row as { post_id?: string }).post_id;
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

async function enrichPosts(
  supabase: {
    from: (table: string) => any;
  },
  raw: unknown[],
  rankingContext?: RankingContext
): Promise<PostCardData[]> {
  const ids = (raw as Array<{ id: string }>).map((post) => post.id);
  const authorIds = Array.from(
    new Set(
      (raw as Array<{ author_id?: string }>)
        .map((post) => post.author_id)
        .filter(Boolean) as string[]
    )
  );

  const [
    likeCounts,
    bookmarkCounts,
    commentCounts,
    referenceCounts,
    responseCounts,
    profilesResult,
    postAuthorsResult,
  ] = await Promise.all([
    getCountsByPostId(supabase, "likes", ids),
    getCountsByPostId(supabase, "bookmarks", ids),
    getCountsByPostId(supabase, "comments", ids),
    getCountsByPostId(supabase, "post_references", ids),
    ids.length > 0
      ? supabase.from("posts").select("in_response_to").in("in_response_to", ids)
      : Promise.resolve({ data: [], error: null }),
    authorIds.length > 0
      ? supabase
          .from("profiles")
          .select(
            "id, username, full_name, university, avatar_url, verified, verified_type"
          )
          .in("id", authorIds)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? supabase
          .from("post_authors")
          .select("post_id, user_id, display_order")
          .in("post_id", ids)
          .not("accepted_at", "is", null)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const responseCountsByPostId = ((responseCounts.data ?? []) as Array<{
    in_response_to?: string | null;
  }>).reduce(
    (acc, row) => {
      if (row.in_response_to) {
        acc[row.in_response_to] = (acc[row.in_response_to] ?? 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const profiles = (profilesResult.data ?? []) as Array<{
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    verified?: boolean;
    verified_type?: string | null;
  }>;

  const acceptedPostAuthors = (postAuthorsResult.data ?? []) as Array<{
    post_id: string;
    user_id: string;
    display_order: number;
  }>;

  const coAuthorIds = Array.from(
    new Set(acceptedPostAuthors.map((row) => row.user_id).filter(Boolean))
  );

  const coAuthorProfilesResult =
    coAuthorIds.length > 0
      ? await supabase
          .from("profiles")
          .select("id, username, full_name")
          .in("id", coAuthorIds)
      : { data: [], error: null };

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const coAuthorProfilesById = new Map(
    ((coAuthorProfilesResult.data ?? []) as Array<{
      id: string;
      username: string;
      full_name: string | null;
    }>).map((profile) => [profile.id, profile])
  );

  const coAuthorsByPostId = acceptedPostAuthors.reduce(
    (acc, row) => {
      const nextRow = {
        user_id: row.user_id,
        profile: coAuthorProfilesById.get(row.user_id)
          ? {
              username: coAuthorProfilesById.get(row.user_id)!.username,
              full_name: coAuthorProfilesById.get(row.user_id)!.full_name,
            }
          : null,
      };

      const current = acc[row.post_id] ?? [];
      current.push(nextRow);
      acc[row.post_id] = current;
      return acc;
    },
    {} as Record<
      string,
      Array<{
        user_id: string;
        profile: { username: string; full_name: string | null } | null;
      }>
    >
  );

  return (raw as Array<Record<string, unknown>>).map((post) => {
    const id = (post.id as string) ?? "";
    const authorId = (post.author_id as string) ?? "";
    const coAuthors = (coAuthorsByPostId[id] ?? []).filter(
      (coAuthor) => coAuthor.user_id !== authorId
    );

    const profile = profilesById.get(authorId) ?? null;
    const tags = (post.tags as string[] | null) ?? null;
    const followedAuthor = Boolean(
      authorId && rankingContext?.followedIds.has(authorId)
    );
    const interestMatch = Boolean(
      tags &&
        rankingContext?.userInterests.length &&
        tags.some((tag) => rankingContext.userInterests.includes(tag))
    );
    const qualityInput = {
      type: post.type as string | null,
      citationId: post.citation_id as string | null,
      publishedVersionId: post.published_version_id as string | null,
      referenceCount: referenceCounts[id] ?? 0,
      responseCount: responseCountsByPostId[id] ?? 0,
      commentCount: commentCounts[id] ?? 0,
      likeCount: likeCounts[id] ?? 0,
      bookmarkCount: bookmarkCounts[id] ?? 0,
      viewCount: post.view_count as number | null,
      publishedAt: post.published_at as string | null,
      createdAt: post.created_at as string | null,
      tags,
      author: profile,
      followedAuthor,
      interestMatch,
    };
    const qualitySignals = getPublicQualitySignals(qualityInput);

    return {
      ...(post as object),
      profiles: profile,
      co_authors: coAuthors,
      like_count: likeCounts[id] ?? 0,
      bookmark_count: bookmarkCounts[id] ?? 0,
      comment_count: commentCounts[id] ?? 0,
      reference_count: referenceCounts[id] ?? 0,
      response_count: responseCountsByPostId[id] ?? 0,
      quality_badges: qualitySignals.badges,
      surface_reason: getFeedSurfaceReason(qualityInput),
      quality_score: qualitySignals.score,
    } as PostCardData;
  });
}

export async function fetchCitableFeed(
  supabase: {
    from: (table: string) => any;
  },
  pageSize = 8
): Promise<PostCardData[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return fetchCachedCitableFeed(pageSize);
  }

  return fetchCitableFeedUncached(supabase, pageSize);
}

async function fetchCitableFeedUncached(
  supabase: {
    from: (table: string) => any;
  },
  pageSize = 8
): Promise<PostCardData[]> {
  const reader = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  const safePageSize = Math.min(Math.max(pageSize, 1), 30);

  const { data: citableRows } = await reader
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .not("citation_id", "is", null)
    .order("published_at", { ascending: false })
    .limit(safePageSize);

  const rows = [...(citableRows ?? [])];

  if (rows.length < safePageSize) {
    const existingIds = new Set(rows.map((post: { id?: string }) => post.id));
    const { data: reviewedRows } = await reader
      .from("posts")
      .select(POST_SELECT)
      .eq("status", "published")
      .in("type", ["research", "policy_brief"])
      .order("published_at", { ascending: false })
      .limit(safePageSize * 2);

    for (const row of reviewedRows ?? []) {
      if (rows.length >= safePageSize) break;
      if (!existingIds.has(row.id)) {
        rows.push(row);
        existingIds.add(row.id);
      }
    }
  }

  return enrichPosts(reader, rows.slice(0, safePageSize));
}

const fetchCachedCitableFeed = unstable_cache(
  async (pageSize: number) => {
    const admin = createAdminClient();
    return fetchCitableFeedUncached(admin, pageSize);
  },
  ["citable-feed"],
  { revalidate: 300, tags: ["feed", "citable-feed"] }
);

function applyPostFilters(
  query: any,
  {
    type,
    cutoff,
    excludedAuthorIds,
  }: {
    type: string | null;
    cutoff: string | null;
    excludedAuthorIds?: string[];
  }
) {
  let nextQuery = query.eq("status", "published");
  if (type && type !== "all") {
    nextQuery = nextQuery.eq("type", type);
  }
  if (cutoff) {
    nextQuery = nextQuery.gte("published_at", cutoff);
  }
  if (excludedAuthorIds && excludedAuthorIds.length > 0) {
    nextQuery = nextQuery.not(
      "author_id",
      "in",
      `(${excludedAuthorIds.join(",")})`
    );
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
  excludedAuthorIds,
}: FeedOptions): Promise<FeedPageResult> {
  const shouldUsePublicCache =
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !userId &&
    userInterests.length === 0 &&
    !userUniversity &&
    followedIds.length === 0 &&
    (excludedAuthorIds?.length ?? 0) === 0 &&
    tab !== "following";

  if (shouldUsePublicCache) {
    return fetchCachedPublicFeedPage({ tab, page, pageSize, type, timeframe });
  }

  return fetchFeedPageUncached({
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
    excludedAuthorIds,
  });
}

async function fetchFeedPageUncached({
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
  excludedAuthorIds,
}: FeedOptions): Promise<FeedPageResult> {
  const reader = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  const safePage = Math.max(1, page);
  const safePageSize = Math.min(Math.max(pageSize, 1), 30);
  const cutoff = getTimeframeCutoff(timeframe);
  const excluded = excludedAuthorIds ?? [];

  if (tab === "following") {
    const visibleFollowedIds =
      excluded.length > 0
        ? followedIds.filter((id) => !excluded.includes(id))
        : followedIds;

    if (visibleFollowedIds.length === 0) {
      return { posts: [], hasMore: false };
    }

    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const query = applyPostFilters(
      reader.from("posts").select(POST_SELECT),
      { type, cutoff, excludedAuthorIds: excluded }
    );
    const { data } = await query
      .in("author_id", visibleFollowedIds)
      .order("published_at", { ascending: false })
      .range(start, end);

    const raw = data ?? [];
    const rankingContext: RankingContext = {
      userId,
      followedIds: new Set(followedIds),
      userInterests,
      userUniversity,
      userCountry: null,
    };
    const posts = await enrichPosts(
      reader,
      raw.slice(0, safePageSize),
      rankingContext
    );
    return { posts, hasMore: raw.length > safePageSize };
  }

  if (tab === "latest") {
    const start = (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const query = applyPostFilters(
      reader.from("posts").select(POST_SELECT),
      { type, cutoff, excludedAuthorIds: excluded }
    );
    const { data } = await query
      .order("published_at", { ascending: false })
      .range(start, end);

    const raw = data ?? [];
    const rankingContext: RankingContext = {
      userId,
      followedIds: new Set(followedIds),
      userInterests,
      userUniversity,
      userCountry: null,
    };
    const posts = await enrichPosts(
      reader,
      raw.slice(0, safePageSize),
      rankingContext
    );
    return { posts, hasMore: raw.length > safePageSize };
  }

  const candidateLimit = Math.max(
    safePageSize * 2,
    safePage * safePageSize + 12
  );
  const query = applyPostFilters(
    reader.from("posts").select(POST_SELECT),
    {
      type,
      cutoff,
      excludedAuthorIds: excluded,
    }
  );

  const { data } = await query
    .order("published_at", { ascending: false })
    .limit(candidateLimit);

  const rankingContext: RankingContext = {
    userId,
    followedIds: new Set(followedIds),
    userInterests,
    userUniversity,
    userCountry: null,
  };
  const enriched = await enrichPosts(reader, data ?? [], rankingContext);

  const ranked = rankPosts(enriched, rankingContext);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;

  return {
    posts: ranked.slice(start, end),
    hasMore: ranked.length > end,
  };
}

const fetchCachedPublicFeedPage = unstable_cache(
  async ({
    tab,
    page,
    pageSize,
    type,
    timeframe,
  }: PublicFeedCacheInput): Promise<FeedPageResult> => {
    const admin = createAdminClient();
    return fetchFeedPageUncached({
      supabase: admin,
      tab,
      page,
      pageSize,
      type,
      timeframe,
      userId: null,
      userInterests: [],
      userUniversity: null,
      followedIds: [],
    });
  },
  ["public-feed-page"],
  { revalidate: 120, tags: ["feed", "public-feed"] }
);

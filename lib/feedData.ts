import type { PostCardData } from "@/components/post/PostCard";
import { feedListRepository, feedRepository } from "@/lib/db/readAdapter";
import { unstable_cache } from "next/cache";
import { rankPosts } from "@/lib/feedRanking";
import { getVisibleCommentCountsByPostId } from "@/lib/postCounts";
import type { FeedListCriteria } from "@/lib/db/feedList";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HomeFeedTab } from "@/lib/homeFeedTabs";

/**
 * The publication feed: Home's two modes, and the Explore shelves that reuse
 * the For You ordering.
 *
 * Home is For You and Following, nothing else (see lib/homeFeedTabs.ts). The
 * publishing reset, Phase 2F, removed the Latest, Subscribed and Topics
 * branches, the evergreen candidate arms, reader-affinity and fatigue signals,
 * co-author enrichment, and the quality badges and "why you are seeing this"
 * line that cards used to carry.
 */
export type FeedTabKey = HomeFeedTab;
export type FeedTimeframe = "all" | "week" | "month";
export type FeedContentFilter = "all" | "post" | "article";

export function normalizeFeedContentFilter(
  value: string | null | undefined
): FeedContentFilter {
  if (value === "post" || value === "blog") return "post";
  if (
    value === "article" ||
    value === "essay" ||
    value === "policy_brief"
  ) {
    return "article";
  }
  // Anything else, including a legacy `type=research` link, falls back to All.
  // The rows those links pointed at are Articles now, and reachable as such.
  return "all";
}

export interface FeedPageResult {
  posts: PostCardData[];
  hasMore: boolean;
  nextCursor?: string | null;
}

export interface FeedOptions {
  supabase: {
    from: (table: string) => any;
    // Optional so the many test doubles and narrow call sites that only ever
    // needed `from` keep working. The aggregate-count path checks for it and
    // falls back when it is absent.
    rpc?: (
      fn: string,
      params?: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error?: unknown }>;
  };
  tab: FeedTabKey;
  page: number;
  pageSize: number;
  /** Explore narrows to one content kind. Home never does. */
  type: FeedContentFilter | null;
  /** Explore's Trending shelf reads one week. Home reads everything. */
  timeframe: FeedTimeframe;
  userId: string | null;
  userInterests: string[];
  followedIds: string[];
  excludedAuthorIds?: string[];
  cursor?: string | null;
}

type FeedSupabaseClient = FeedOptions["supabase"];

/**
 * A database failure while assembling feed data. Keeping the original error
 * (and its PostgREST code when present) lets route handlers report a real 5xx
 * instead of turning a broken query into a convincing empty feed.
 */
export class FeedDataError extends Error {
  readonly operation: string;
  readonly code?: string;
  readonly cause: unknown;

  constructor(operation: string, cause: unknown) {
    const source = cause as { message?: unknown; code?: unknown } | null;
    const detail =
      typeof source?.message === "string" && source.message.trim()
        ? source.message
        : "Unknown database error";
    super(`Feed data query failed (${operation}): ${detail}`);
    this.name = "FeedDataError";
    this.operation = operation;
    this.code =
      typeof source?.code === "string" && source.code ? source.code : undefined;
    this.cause = cause;
  }
}

export class FeedCursorError extends Error {
  constructor(message = "Invalid or mismatched feed cursor.") {
    super(message);
    this.name = "FeedCursorError";
  }
}

/**
 * One slice of the feed, through the repository. The defaults are the "no
 * restriction" values, so a caller states only what it actually narrows.
 *
 * A failure arrives as a FeedDataError carrying the database's code, so a
 * caller can tell an outage from an empty feed.
 */
async function listFeedPosts(
  reader: FeedSupabaseClient,
  operation: string,
  criteria: Partial<FeedListCriteria> & Pick<FeedListCriteria, "limit">
): Promise<Array<Record<string, unknown>>> {
  try {
    const rows = await feedListRepository(reader as never).listPosts({
      contentKind: null,
      cutoff: null,
      authorIds: null,
      excludedAuthorIds: [],
      excludedPostIds: [],
      cursor: null,
      offset: 0,
      ...criteria,
    });
    return rows as unknown as Array<Record<string, unknown>>;
  } catch (error) {
    throw new FeedDataError(operation, error);
  }
}

/** The content filter, as criteria. `type` of "all" means no restriction. */
function contentKindCriterion(type: FeedContentFilter | null): string | null {
  return type && type !== "all" ? type : null;
}

function normalizePositiveInteger(
  value: number,
  fallback: number,
  maximum: number
): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value), 1), maximum);
}

type PublicFeedCacheInput = Pick<
  FeedOptions,
  "tab" | "page" | "pageSize" | "type" | "timeframe" | "cursor"
>;

// How deep the ranked part of For You goes. Every page slices this same
// window, so it has to be a constant: widening the pool per page re-ranks a
// different set each time, and page 2 then repeats cards page 1 already served.
// Ten pages at the client's page size of 12; past it the feed pages in date
// order.
export const RANKED_FEED_WINDOW = 120;
export const MAX_FEED_PAGE = 100;
export const MAX_FEED_PAGE_SIZE = 30;

/**
 * Which part of For You a card came from, recorded on its signed exposure:
 * the ranked window, or the date-ordered tail past it.
 */
export type FeedCandidateArm = "for_you_ranked" | "for_you_tail";

/** Following is the only mode that pages by cursor. */
interface FeedCursorContext {
  tab: "following";
  type: FeedContentFilter;
  timeframe: FeedTimeframe;
}

interface FeedCursorPosition {
  publishedAt: string;
  id: string;
}

interface FeedCursorPayload extends FeedCursorContext, FeedCursorPosition {
  version: 1;
}

const FEED_CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 2048;
const SAFE_CURSOR_ID = /^[A-Za-z0-9_-]{1,128}$/;

function getCursorContext(
  tab: FeedTabKey,
  type: FeedContentFilter | null,
  timeframe: FeedTimeframe
): FeedCursorContext | null {
  if (tab !== "following") return null;
  return { tab, type: type ?? "all", timeframe };
}

function decodeFeedCursor(
  cursor: string | null | undefined,
  expectedContext: FeedCursorContext | null
): FeedCursorPosition | null {
  if (cursor == null) return null;
  if (!expectedContext) {
    throw new FeedCursorError("Cursors are not supported by the ranked home feed.");
  }
  if (
    cursor.length === 0 ||
    cursor.length > MAX_CURSOR_LENGTH ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw new FeedCursorError();
  }

  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) {
      throw new FeedCursorError();
    }
    // A cursor minted before Phase 2F also carries `subscriptionSource`, which
    // is ignored: a Following cursor from then still continues the same feed.
    const payload = JSON.parse(bytes.toString("utf8")) as Partial<FeedCursorPayload>;
    if (
      payload.version !== FEED_CURSOR_VERSION ||
      payload.tab !== expectedContext.tab ||
      payload.type !== expectedContext.type ||
      payload.timeframe !== expectedContext.timeframe ||
      typeof payload.publishedAt !== "string" ||
      typeof payload.id !== "string" ||
      !SAFE_CURSOR_ID.test(payload.id)
    ) {
      throw new FeedCursorError();
    }

    const canonicalPublishedAt = new Date(payload.publishedAt).toISOString();
    if (canonicalPublishedAt !== payload.publishedAt) {
      throw new FeedCursorError();
    }
    return { publishedAt: canonicalPublishedAt, id: payload.id };
  } catch (error) {
    if (error instanceof FeedCursorError) throw error;
    throw new FeedCursorError();
  }
}

function encodeFeedCursor(
  row: Record<string, unknown>,
  context: FeedCursorContext
): string {
  const rawPublishedAt = row.published_at;
  const id = row.id;
  if (
    typeof rawPublishedAt !== "string" ||
    !Number.isFinite(Date.parse(rawPublishedAt)) ||
    typeof id !== "string" ||
    !SAFE_CURSOR_ID.test(id)
  ) {
    throw new FeedCursorError(
      "The feed cannot continue because its last item has no valid cursor position."
    );
  }

  const payload: FeedCursorPayload = {
    version: FEED_CURSOR_VERSION,
    ...context,
    publishedAt: new Date(rawPublishedAt).toISOString(),
    id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function getNextCursor(
  rows: Array<Record<string, unknown>>,
  hasMore: boolean,
  context: FeedCursorContext
): string | null {
  if (!hasMore || rows.length === 0) return null;
  return encodeFeedCursor(rows[rows.length - 1], context);
}

function getTimeframeCutoff(timeframe: FeedTimeframe): string | null {
  if (timeframe === "week") {
    return new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (timeframe === "month") {
    return new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

/**
 * Posts crediting a blocked person as an accepted author. Filtering on
 * `posts.author_id` alone would let them back into the feed through an older
 * co-authored publication, so these ids are excluded too. Co-authoring is
 * retired as a product, but its credits are still data and blocking is not
 * presentation.
 */
async function getExcludedCreditedPostIds(
  reader: FeedSupabaseClient,
  excludedAuthorIds: string[]
): Promise<string[]> {
  if (excludedAuthorIds.length === 0) return [];

  try {
    return await feedListRepository(reader as never).postIdsCreditedTo(
      excludedAuthorIds
    );
  } catch (error) {
    throw new FeedDataError("load posts credited to excluded authors", error);
  }
}

async function applyViewerCommentCounts(
  viewerClient: FeedSupabaseClient,
  posts: PostCardData[]
): Promise<PostCardData[]> {
  if (posts.length === 0) return posts;

  try {
    const counts = await getVisibleCommentCountsByPostId(
      viewerClient,
      posts.map((post) => post.id)
    );
    return posts.map((post) => ({
      ...post,
      comment_count: counts[post.id] ?? 0,
    }));
  } catch (error) {
    // Public feed cards may come from the service-role cache, whose cached
    // comment total is not a viewer-safe fallback. If the viewer-specific
    // count cannot be loaded, show zero rather than failing the whole feed or
    // accidentally surfacing a count that includes moderated comments.
    console.warn(
      "[feed-hydration] viewer comment counts unavailable; rendering zero counts",
      error
    );
    return posts.map((post) => ({ ...post, comment_count: 0 }));
  }
}

/**
 * Turns selected rows into cards: the author, the numbers a card shows, and
 * whether this viewer has already liked or saved each one.
 *
 * The comment count is the one number that carries a security rule: on
 * PostgREST it is issued with the viewer's client so the RLS policy on
 * comments hides moderated rows, and the PostgreSQL side writes that policy
 * out. See lib/db/feed.ts.
 */
async function enrichPosts(
  reader: FeedSupabaseClient,
  raw: Array<Record<string, unknown>>,
  viewerId: string | null,
  viewerClient: FeedSupabaseClient | null = reader
): Promise<PostCardData[]> {
  const postIds = raw.map((post) => String(post.id));
  const authorIds = Array.from(
    new Set(
      raw
        .map((post) => post.author_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    )
  );

  const hydration = await feedRepository(
    reader as never,
    viewerClient as never
  ).hydrate({ postIds, authorIds, viewer: { id: viewerId } });

  const countsById = new Map(
    hydration.counts.map((entry) => [entry.postId, entry])
  );
  const profilesById = new Map(
    hydration.profiles.map((profile) => [profile.id, profile])
  );

  return raw.map((post) => {
    const id = String(post.id ?? "");
    const authorId = typeof post.author_id === "string" ? post.author_id : "";
    const counts = countsById.get(id);

    return {
      ...(post as object),
      profiles: profilesById.get(authorId) ?? null,
      like_count: counts?.likeCount ?? 0,
      bookmark_count: counts?.bookmarkCount ?? 0,
      comment_count: counts?.commentCount ?? 0,
      viewer_liked: counts?.viewerLiked ?? false,
      viewer_bookmarked: counts?.viewerBookmarked ?? false,
    } as PostCardData;
  });
}

export async function fetchFeedPage(options: FeedOptions): Promise<FeedPageResult> {
  const {
    supabase,
    tab,
    page,
    pageSize,
    type,
    timeframe,
    userId,
    userInterests,
    followedIds,
    excludedAuthorIds,
    cursor,
  } = options;

  // Validate before entering unstable_cache so bad cursors always surface as
  // the exported client error type rather than as a cached-function failure.
  decodeFeedCursor(cursor, getCursorContext(tab, type, timeframe));

  // Signed-out For You is the same for every reader, so it is served from a
  // short cache. Anything personal, including a block list, is not.
  const shouldUsePublicCache =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) &&
    tab === "home" &&
    !userId &&
    userInterests.length === 0 &&
    followedIds.length === 0 &&
    (excludedAuthorIds?.length ?? 0) === 0;

  if (shouldUsePublicCache) {
    const cached = await fetchCachedPublicFeedPage({
      tab,
      page,
      pageSize,
      type,
      timeframe,
      cursor,
    });
    return {
      ...cached,
      posts: await applyViewerCommentCounts(supabase, cached.posts),
    };
  }

  return fetchFeedPageUncached(options);
}

async function fetchFeedPageUncached(
  {
    supabase,
    tab,
    page,
    pageSize,
    type,
    timeframe,
    userId,
    userInterests,
    followedIds,
    excludedAuthorIds,
    cursor,
  }: FeedOptions,
  viewerClientOverride?: FeedSupabaseClient | null
): Promise<FeedPageResult> {
  const reader = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  const viewerClient =
    viewerClientOverride === undefined ? supabase : viewerClientOverride;
  const safePage = normalizePositiveInteger(page, 1, MAX_FEED_PAGE);
  const safePageSize = normalizePositiveInteger(
    pageSize,
    12,
    MAX_FEED_PAGE_SIZE
  );
  const cursorContext = getCursorContext(tab, type, timeframe);
  const cursorPosition = decodeFeedCursor(cursor, cursorContext);
  const excluded = Array.from(
    new Set((excludedAuthorIds ?? []).filter(Boolean))
  );
  const selection = {
    contentKind: contentKindCriterion(type),
    cutoff: getTimeframeCutoff(timeframe),
    excludedAuthorIds: excluded,
    excludedPostIds: await getExcludedCreditedPostIds(reader, excluded),
  };

  if (tab === "following") {
    const visibleFollowedIds = followedIds.filter((id) => !excluded.includes(id));
    if (visibleFollowedIds.length === 0) {
      return { posts: [], hasMore: false, nextCursor: null };
    }

    // Reverse-chronological, and never ranked.
    const raw = await listFeedPosts(reader, "load following feed", {
      ...selection,
      authorIds: visibleFollowedIds,
      cursor: cursorPosition,
      offset: cursorPosition ? 0 : (safePage - 1) * safePageSize,
      limit: safePageSize + 1,
    });
    const deliveredRows = raw.slice(0, safePageSize);
    const hasMore = raw.length > safePageSize;
    const posts = await enrichPosts(reader, deliveredRows, userId, viewerClient);
    return {
      posts,
      hasMore,
      nextCursor: getNextCursor(deliveredRows, hasMore, cursorContext!),
    };
  }

  // For You: the newest RANKED_FEED_WINDOW publications, ranked, then
  // everything older in date order. Both halves are whole pages, so the
  // ranked stream and the tail tile: the tail's first row is exactly the row
  // after the window, and nothing is served twice or skipped.
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;
  const rankedWindow =
    Math.ceil(RANKED_FEED_WINDOW / safePageSize) * safePageSize;

  if (start >= rankedWindow) {
    const raw = await listFeedPosts(reader, "load chronological feed tail", {
      ...selection,
      offset: start,
      limit: safePageSize + 1,
    });
    const rows = raw.slice(0, safePageSize);
    const posts = await enrichPosts(reader, rows, userId, viewerClient);
    return {
      posts: posts.map((post) => ({
        ...post,
        candidate_source: "for_you_tail" as FeedCandidateArm,
      })),
      hasMore: raw.length > safePageSize,
    };
  }

  // One row past the window, so the last ranked page knows whether the tail
  // holds anything rather than guessing.
  const raw = await listFeedPosts(reader, "load ranked feed candidates", {
    ...selection,
    limit: rankedWindow + 1,
  });
  const candidates = await enrichPosts(
    reader,
    raw.slice(0, rankedWindow),
    userId,
    viewerClient
  );
  const ranked = rankPosts(candidates, {
    userId,
    followedIds: new Set(followedIds),
    userInterests,
  });

  return {
    posts: ranked.slice(start, end).map((post) => ({
      ...post,
      candidate_source: "for_you_ranked" as FeedCandidateArm,
    })),
    hasMore: ranked.length > end || raw.length > rankedWindow,
  };
}

const fetchCachedPublicFeedPage = unstable_cache(
  async ({
    tab,
    page,
    pageSize,
    type,
    timeframe,
    cursor,
  }: PublicFeedCacheInput): Promise<FeedPageResult> => {
    const admin = createAdminClient();
    return fetchFeedPageUncached(
      {
        supabase: admin,
        tab,
        page,
        pageSize,
        type,
        timeframe,
        cursor,
        userId: null,
        userInterests: [],
        followedIds: [],
      },
      // Cached public cards deliberately omit comment counts. The request's
      // RLS client attaches visible counts after the cache lookup.
      null
    );
  },
  // Versioned with the ranking, so a deploy never serves a page cached under
  // the previous model's card shape.
  ["public-feed-page-v3"],
  { revalidate: 120, tags: ["feed", "public-feed"] }
);

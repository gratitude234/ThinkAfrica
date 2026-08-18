import type { PostCardData } from "@/components/post/PostCard";
import { unstable_cache } from "next/cache";
import { rankPosts, type RankingContext } from "@/lib/feedRanking";
import {
  getFeedSurfaceReason,
  getPublicQualitySignals,
} from "@/lib/postQuality";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
} from "@/lib/featureFlags";
import type {
  SubscriptionFeedSource,
  SubscriptionMatchReason,
} from "@/lib/publicationDelivery";

export type FeedTabKey =
  | "home"
  | "following"
  | "subscriptions"
  | "topics"
  | "latest";
export type FeedTimeframe = "all" | "week" | "month";
export type FeedContentFilter = "all" | "post" | "article" | "research";

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
  if (value === "research") return "research";
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
  };
  tab: FeedTabKey;
  page: number;
  pageSize: number;
  type: FeedContentFilter | null;
  timeframe: FeedTimeframe;
  userId: string | null;
  userInterests: string[];
  userUniversity: string | null;
  followedIds: string[];
  authorSubscriptionIds?: string[];
  topicSubscriptionKeys?: string[];
  subscriptionSource?: SubscriptionFeedSource;
  excludedAuthorIds?: string[];
  cursor?: string | null;
}

type FeedSupabaseClient = FeedOptions["supabase"];

interface FeedEnrichmentVisibility {
  excludedAuthorIds?: string[];
  excludedPostIds?: string[];
}

interface SupabaseQueryResult<T> {
  data: T | null;
  error?: unknown;
}

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

function expectRows<T>(
  result: SupabaseQueryResult<T[]>,
  operation: string
): T[] {
  if (result.error) throw new FeedDataError(operation, result.error);
  return result.data ?? [];
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

// topic_keys intentionally is not part of the baseline contract. That column
// belongs to the separately deployed topic-subscriptions schema; selecting it
// here made every feed fail when the feature migration was not installed.
// Only the topic-subscription branch asks PostgREST for it.
const POST_SELECT =
  "id, title, slug, in_response_to, excerpt, type, content_kind, article_format, tags, created_at, published_at, view_count, impression_count, read_count, cover_image_url, citation_id, published_version_id, document_original_name, document_mime_type, document_size_bytes, author_id";
const POST_SELECT_WITH_TOPIC_KEYS = `${POST_SELECT}, topic_keys`;

// How deep the score-ranked portion of the home feed goes. Every page of the
// "For you" tab slices this same window, so it has to be a constant -- see the
// comment at the ranking branch of fetchFeedPageUncached. Ten pages at the
// client's page size of 12; past it the feed pages reverse-chronologically.
export const RANKED_FEED_WINDOW = 120;
export const MAX_FEED_PAGE = 100;
export const MAX_FEED_PAGE_SIZE = 30;

type ChronologicalFeedTab = Exclude<FeedTabKey, "home">;

interface FeedCursorContext {
  tab: ChronologicalFeedTab;
  type: FeedContentFilter;
  timeframe: FeedTimeframe;
  subscriptionSource: SubscriptionFeedSource | null;
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
  timeframe: FeedTimeframe,
  subscriptionSource: SubscriptionFeedSource
): FeedCursorContext | null {
  if (tab === "home") return null;
  return {
    tab,
    type: type ?? "all",
    timeframe,
    subscriptionSource:
      tab === "topics"
        ? "topics"
        : tab === "subscriptions"
          ? subscriptionSource
          : null,
  };
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
    const payload = JSON.parse(bytes.toString("utf8")) as Partial<FeedCursorPayload>;
    if (
      payload.version !== FEED_CURSOR_VERSION ||
      payload.tab !== expectedContext.tab ||
      payload.type !== expectedContext.type ||
      payload.timeframe !== expectedContext.timeframe ||
      payload.subscriptionSource !== expectedContext.subscriptionSource ||
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

function applyKeysetCursor(query: any, cursor: FeedCursorPosition | null) {
  if (!cursor) return query;
  return query.or(
    `published_at.lt.${cursor.publishedAt},and(published_at.eq.${cursor.publishedAt},id.lt.${cursor.id})`
  );
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

export async function getCountsByPostId(
  supabase: {
    from: (table: string) => any;
  },
  table: "likes" | "bookmarks" | "comments" | "post_references",
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const result = (await supabase
    .from(table)
    .select("post_id")
    .in("post_id", postIds)) as SupabaseQueryResult<
    Array<{ post_id?: string }>
  >;
  const data = expectRows(result, `count ${table}`);

  return data.reduce(
    (acc: Record<string, number>, row: { post_id?: string }) => {
      const key = (row as { post_id?: string }).post_id;
      if (!key) return acc;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
}

// post_like_counts stores an already-maintained aggregate per post (see
// increment/decrement_post_like_count triggers), so it's a direct lookup rather
// than a row-count like getCountsByPostId does for likes/bookmarks/comments.
async function getLikeCountsByPostId(
  supabase: {
    from: (table: string) => any;
  },
  postIds: string[]
): Promise<Record<string, number>> {
  if (postIds.length === 0) return {};

  const result = (await supabase
    .from("post_like_counts")
    .select("post_id, like_count")
    .in("post_id", postIds)) as SupabaseQueryResult<
    Array<{ post_id: string; like_count: number }>
  >;
  const data = expectRows(result, "load like aggregates");

  return data.reduce(
    (acc, row) => {
      acc[row.post_id] = row.like_count;
      return acc;
    },
    {} as Record<string, number>
  );
}

async function getExcludedCreditedPostIds(
  reader: FeedSupabaseClient,
  excludedAuthorIds: string[]
): Promise<string[]> {
  if (excludedAuthorIds.length === 0) return [];

  const result = (await reader
    .from("post_authors")
    .select("post_id")
    .in("user_id", excludedAuthorIds)
    .not("accepted_at", "is", null)) as SupabaseQueryResult<
    Array<{ post_id: string }>
  >;

  return Array.from(
    new Set(
      expectRows(result, "load posts credited to excluded authors")
        .map((row) => row.post_id)
        .filter(Boolean)
    )
  );
}

async function applyViewerCommentCounts(
  viewerClient: FeedSupabaseClient,
  posts: PostCardData[]
): Promise<PostCardData[]> {
  if (posts.length === 0) return posts;
  const counts = await getCountsByPostId(
    viewerClient,
    "comments",
    posts.map((post) => post.id)
  );
  return posts.map((post) => ({
    ...post,
    comment_count: counts[post.id] ?? 0,
  }));
}

async function enrichPosts(
  reader: FeedSupabaseClient,
  raw: unknown[],
  rankingContext?: RankingContext,
  viewerClient: FeedSupabaseClient | null = reader,
  visibility: FeedEnrichmentVisibility = {}
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
    referenceCounts,
    commentCounts,
    responseCounts,
    profilesResult,
    postAuthorsResult,
    viewerLikesResult,
    viewerBookmarksResult,
  ] = await Promise.all([
    getLikeCountsByPostId(reader, ids),
    getCountsByPostId(reader, "bookmarks", ids),
    getCountsByPostId(reader, "post_references", ids),
    // Read with the caller's client, never the admin one: the RLS SELECT policy
    // on comments is what hides moderated rows, so a service-role count leaks
    // them. An author legitimately sees their own hidden comment, so this
    // number is per-viewer by design.
    viewerClient
      ? getCountsByPostId(viewerClient, "comments", ids)
      : Promise.resolve({} as Record<string, number>),
    ids.length > 0
      ? reader
          .from("posts")
          .select("in_response_to")
          .in("in_response_to", ids)
          .eq("status", "published")
      : Promise.resolve({ data: [], error: null }),
    authorIds.length > 0
      ? reader
          .from("profiles")
          .select(
            "id, username, full_name, university, avatar_url, verified, verified_type"
          )
          .in("id", authorIds)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0
      ? reader
          .from("post_authors")
          .select("post_id, user_id, display_order")
          .in("post_id", ids)
          .not("accepted_at", "is", null)
          .order("display_order", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0 && rankingContext?.userId
      ? reader
          .from("likes")
          .select("post_id")
          .eq("user_id", rankingContext.userId)
          .in("post_id", ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length > 0 && rankingContext?.userId
      ? reader
          .from("bookmarks")
          .select("post_id")
          .eq("user_id", rankingContext.userId)
          .in("post_id", ids)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const responseRows = expectRows<{ in_response_to?: string | null }>(
    responseCounts,
    "count published responses"
  );
  const profileRows = expectRows<{
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    verified?: boolean;
    verified_type?: string | null;
  }>(profilesResult, "load feed author profiles");
  const acceptedPostAuthorRows = expectRows<{
    post_id: string;
    user_id: string;
    display_order: number;
  }>(postAuthorsResult, "load accepted post authors");
  const viewerLikeRows = expectRows<{ post_id: string }>(
    viewerLikesResult,
    "load viewer likes"
  );
  const viewerBookmarkRows = expectRows<{ post_id: string }>(
    viewerBookmarksResult,
    "load viewer bookmarks"
  );

  const responseCountsByPostId = responseRows.reduce(
    (acc, row) => {
      if (row.in_response_to) {
        acc[row.in_response_to] = (acc[row.in_response_to] ?? 0) + 1;
      }
      return acc;
    },
    {} as Record<string, number>
  );

  const profiles = profileRows;

  const acceptedPostAuthors = acceptedPostAuthorRows;

  const coAuthorIds = Array.from(
    new Set(acceptedPostAuthors.map((row) => row.user_id).filter(Boolean))
  );

  const coAuthorProfilesResult =
    coAuthorIds.length > 0
      ? await reader
          .from("profiles")
          .select("id, username, full_name")
          .in("id", coAuthorIds)
      : { data: [], error: null };
  const coAuthorProfiles = expectRows<{
    id: string;
    username: string;
    full_name: string | null;
  }>(coAuthorProfilesResult, "load coauthor profiles");

  // Response context (Part 5): batch-fetch the parent post's title/author for
  // any row that is itself a response, so the feed can render a real
  // "Responding to X by Y" line instead of a generic fallback. A parent that
  // no longer resolves (unpublished/removed) is simply omitted -- callers
  // fail safe to the generic line rather than crash or link to nothing.
  const excludedParentPostIds = new Set(
    (visibility.excludedPostIds ?? []).filter(Boolean)
  );
  const excludedParentAuthorIds = Array.from(
    new Set((visibility.excludedAuthorIds ?? []).filter(Boolean))
  );
  const responseToIds = Array.from(
    new Set(
      (raw as Array<{ in_response_to?: string | null }>)
        .map((post) => post.in_response_to)
        .filter(
          (id): id is string =>
            typeof id === "string" && !excludedParentPostIds.has(id)
        )
    )
  );

  let parentPostsQuery =
    responseToIds.length > 0
      ? reader
          .from("posts")
          .select("id, slug, title, type, content_kind, author_id")
          .in("id", responseToIds)
          .eq("status", "published")
      : null;
  if (parentPostsQuery && excludedParentAuthorIds.length > 0) {
    parentPostsQuery = parentPostsQuery.not(
      "author_id",
      "in",
      `(${excludedParentAuthorIds.join(",")})`
    );
  }
  const parentPostsResult = parentPostsQuery
    ? await parentPostsQuery
    : { data: [], error: null };
  const parentPostRows = expectRows<{
    id: string;
    slug: string;
    title: string | null;
    type: string;
    content_kind: string | null;
    author_id: string;
  }>(parentPostsResult, "load response parent posts");

  const parentPosts = parentPostRows;

  const parentAuthorIds = Array.from(
    new Set(parentPosts.map((parent) => parent.author_id).filter(Boolean))
  );

  const parentAuthorProfilesResult =
    parentAuthorIds.length > 0
      ? await reader
          .from("profiles")
          .select("id, username, full_name")
          .in("id", parentAuthorIds)
      : { data: [], error: null };
  const parentAuthorProfiles = expectRows<{
    id: string;
    username: string;
    full_name: string | null;
  }>(parentAuthorProfilesResult, "load response parent authors");

  const parentAuthorProfilesById = new Map(
    parentAuthorProfiles.map((profile) => [profile.id, profile])
  );

  const parentPostsById = new Map(
    parentPosts.map((parent) => [
      parent.id,
      {
        slug: parent.slug,
        title: parent.title,
        type: parent.type,
        content_kind: parent.content_kind,
        profiles: parentAuthorProfilesById.get(parent.author_id)
          ? {
              username: parentAuthorProfilesById.get(parent.author_id)!.username,
              full_name: parentAuthorProfilesById.get(parent.author_id)!.full_name,
            }
          : null,
      },
    ])
  );

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const viewerLikedIds = new Set(
    viewerLikeRows.map((row) => row.post_id)
  );
  const viewerBookmarkedIds = new Set(
    viewerBookmarkRows.map((row) => row.post_id)
  );
  const coAuthorProfilesById = new Map(
    coAuthorProfiles.map((profile) => [profile.id, profile])
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
  // Keep explanatory metadata aligned with feedRanking's relevance signal.
  // Raw profile interests and post tags are user-entered, so exact-string
  // comparison loses matches that differ only by surrounding space or case.
  const normalizedInterests = new Set(
    (rankingContext?.userInterests ?? [])
      .map((interest) => interest.trim().toLocaleLowerCase("en"))
      .filter(Boolean)
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
        normalizedInterests.size > 0 &&
        tags.some((tag) =>
          normalizedInterests.has(tag.trim().toLocaleLowerCase("en"))
        )
    );
    const qualityInput = {
      type: post.type as string | null,
      citationId: post.citation_id as string | null,
      publishedVersionId: post.published_version_id as string | null,
      referenceCount: referenceCounts[id] ?? 0,
      responseCount: responseCountsByPostId[id] ?? 0,
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
    const inResponseTo = post.in_response_to as string | null | undefined;

    return {
      ...(post as object),
      profiles: profile,
      co_authors: coAuthors,
      like_count: likeCounts[id] ?? 0,
      bookmark_count: bookmarkCounts[id] ?? 0,
      reference_count: referenceCounts[id] ?? 0,
      response_count: responseCountsByPostId[id] ?? 0,
      // Deliberately separate from response_count, which lib/postQuality.ts and
      // lib/feedRanking.ts score and badge from -- folding comments into it
      // would quietly change feed order.
      comment_count: commentCounts[id] ?? 0,
      quality_badges: qualitySignals.badges,
      surface_reason: getFeedSurfaceReason(qualityInput),
      quality_score: qualitySignals.score,
      viewer_liked: viewerLikedIds.has(id),
      viewer_bookmarked: viewerBookmarkedIds.has(id),
      response_to: inResponseTo ? (parentPostsById.get(inResponseTo) ?? null) : null,
    } as PostCardData;
  });
}

/**
 * Fetches the published Posts/Articles/Research that respond to a given post
 * (via `in_response_to`) and hydrates them into full feed cards — same counts,
 * viewer state, and quality signals as the main feed. Used by the post detail
 * page's Responses section so a response renders identically to a feed card.
 */
export const RESPONSE_PAGE_SIZE = 10;

export interface ResponsePage {
  cards: PostCardData[];
  hasMore: boolean;
}

/**
 * A page of responses plus whether more exist, so the detail page can offer to
 * show them. Over-fetches one row to make `hasMore` a fact rather than a guess,
 * the same way fetchFeedPage does.
 */
export async function fetchResponsePage(
  supabase: { from: (table: string) => any },
  postId: string,
  viewerId: string | null,
  limit = RESPONSE_PAGE_SIZE
): Promise<ResponsePage> {
  const safeLimit = normalizePositiveInteger(
    limit,
    RESPONSE_PAGE_SIZE,
    MAX_FEED_PAGE_SIZE
  );
  const cards = await fetchResponseCards(
    supabase,
    postId,
    viewerId,
    safeLimit + 1
  );
  return {
    cards: cards.slice(0, safeLimit),
    hasMore: cards.length > safeLimit,
  };
}

export async function fetchResponseCards(
  supabase: {
    from: (table: string) => any;
  },
  postId: string,
  viewerId: string | null,
  limit = RESPONSE_PAGE_SIZE
): Promise<PostCardData[]> {
  const safeLimit = normalizePositiveInteger(
    limit,
    RESPONSE_PAGE_SIZE,
    MAX_FEED_PAGE_SIZE + 1
  );
  const result = (await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("in_response_to", postId)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(safeLimit)) as SupabaseQueryResult<unknown[]>;

  const rows = expectRows(result, "load responses for post");
  if (rows.length === 0) return [];

  const rankingContext: RankingContext = {
    userId: viewerId,
    followedIds: new Set(),
    userInterests: [],
    userUniversity: null,
    userCountry: null,
  };

  return enrichPosts(supabase, rows, rankingContext);
}

/**
 * Public response-discovery feed. Unlike fetchResponsePage(), which is scoped
 * to one parent post, this returns recent published responses across the
 * network so Responses can be a first-class navigation destination.
 */
export async function fetchRecentResponsePage(
  supabase: { from: (table: string) => any },
  viewerId: string | null,
  page = 1,
  pageSize = 20
): Promise<ResponsePage> {
  const safePage = normalizePositiveInteger(page, 1, MAX_FEED_PAGE);
  const safePageSize = normalizePositiveInteger(
    pageSize,
    20,
    MAX_FEED_PAGE_SIZE
  );
  const offset = (safePage - 1) * safePageSize;
  const result = (await supabase
    .from("posts")
    .select(POST_SELECT)
    .not("in_response_to", "is", null)
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .range(offset, offset + safePageSize)) as SupabaseQueryResult<unknown[]>;

  const rows = expectRows(result, "load recent responses");
  const hasMore = rows.length > safePageSize;
  const rankingContext: RankingContext = {
    userId: viewerId,
    followedIds: new Set(),
    userInterests: [],
    userUniversity: null,
    userCountry: null,
  };
  const cards = await enrichPosts(
    supabase,
    rows.slice(0, safePageSize),
    rankingContext
  );

  return { cards, hasMore };
}

export async function fetchCitableFeed(
  supabase: {
    from: (table: string) => any;
  },
  pageSize = 8
): Promise<PostCardData[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    const posts = await fetchCachedCitableFeed(pageSize);
    return applyViewerCommentCounts(supabase, posts);
  }

  return fetchCitableFeedUncached(supabase, pageSize, supabase);
}

async function fetchCitableFeedUncached(
  supabase: FeedSupabaseClient,
  pageSize = 8,
  viewerClient: FeedSupabaseClient | null = supabase
): Promise<PostCardData[]> {
  const reader = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createAdminClient()
    : supabase;
  const safePageSize = normalizePositiveInteger(
    pageSize,
    8,
    MAX_FEED_PAGE_SIZE
  );

  const result = (await reader
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .not("citation_id", "is", null)
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(safePageSize)) as SupabaseQueryResult<unknown[]>;
  const citableRows = expectRows(result, "load citable feed");

  // Phase 4A: this used to pad a short "Citable" shelf with
  // .in("type", ["research", "policy_brief"]) rows regardless of whether
  // they actually carried citation_id -- name-based, not evidence-based.
  // In practice that padding was already a no-op for legacy content
  // (guard_locked_post_write blocks a research/policy_brief row from ever
  // reaching status='published' without publishReviewedPost() setting
  // citation_id in the same call -- see
  // supabase/migrations/20260720000001_lock_accepted_and_removed_posts.sql),
  // but for the new model it was also silently wrong in the other
  // direction: a published Policy-Brief-*format* Article (content_kind
  // "article", article_format "policy_brief") is never formally reviewed
  // and must never appear here just because of its genre. Rather than
  // pad with a second, weaker query, this shelf now shows only what the
  // evidence-based query above actually found -- fewer than pageSize
  // items is correct when fewer than pageSize posts have real citation
  // evidence yet.
  return enrichPosts(
    reader,
    citableRows.slice(0, safePageSize),
    undefined,
    viewerClient
  );
}

const fetchCachedCitableFeed = unstable_cache(
  async (pageSize: number) => {
    const admin = createAdminClient();
    // Viewer-visible comment counts are attached after the cached result is
    // read, through the request's RLS client. Never cache an admin count.
    return fetchCitableFeedUncached(admin, pageSize, null);
  },
  ["citable-feed"],
  { revalidate: 300, tags: ["feed", "citable-feed"] }
);

export function applyPostFilters(
  query: any,
  {
    type,
    cutoff,
    excludedAuthorIds,
    excludedPostIds,
  }: {
    type: FeedContentFilter | null;
    cutoff: string | null;
    excludedAuthorIds?: string[];
    excludedPostIds?: string[];
  }
) {
  let nextQuery = query.eq("status", "published");
  if (type && type !== "all") {
    // Home filters use the three top-level content kinds. Article genres
    // remain descriptive metadata and are deliberately not peer filters.
    nextQuery = nextQuery.eq("content_kind", type);
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
  if (excludedPostIds && excludedPostIds.length > 0) {
    // A blocked user can be the primary author or an accepted coauthor. The
    // latter needs an id anti-filter because PostgREST does not expose a
    // reliable NOT-EXISTS relation filter in this query shape.
    for (let index = 0; index < excludedPostIds.length; index += 100) {
      nextQuery = nextQuery.not(
        "id",
        "in",
        `(${excludedPostIds.slice(index, index + 100).join(",")})`
      );
    }
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
  authorSubscriptionIds,
  topicSubscriptionKeys,
  subscriptionSource,
  excludedAuthorIds,
  cursor,
}: FeedOptions): Promise<FeedPageResult> {
  // Validate before entering unstable_cache so bad cursors always surface as
  // the exported client error type rather than as a cached-function failure.
  decodeFeedCursor(
    cursor,
    getCursorContext(tab, type, timeframe, subscriptionSource ?? "all")
  );
  const shouldUsePublicCache =
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    !userId &&
    userInterests.length === 0 &&
    !userUniversity &&
    followedIds.length === 0 &&
    (authorSubscriptionIds?.length ?? 0) === 0 &&
    (topicSubscriptionKeys?.length ?? 0) === 0 &&
    (excludedAuthorIds?.length ?? 0) === 0 &&
    tab !== "following" &&
    tab !== "topics" &&
    tab !== "subscriptions";

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
    authorSubscriptionIds,
    topicSubscriptionKeys,
    subscriptionSource,
    excludedAuthorIds,
    cursor,
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
  authorSubscriptionIds,
  topicSubscriptionKeys,
  subscriptionSource = "all",
  excludedAuthorIds,
  cursor,
}: FeedOptions,
viewerClientOverride?: FeedSupabaseClient | null): Promise<FeedPageResult> {
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
  const cutoff = getTimeframeCutoff(timeframe);
  const cursorContext = getCursorContext(
    tab,
    type,
    timeframe,
    subscriptionSource
  );
  const cursorPosition = decodeFeedCursor(cursor, cursorContext);
  const excluded = Array.from(
    new Set((excludedAuthorIds ?? []).filter(Boolean))
  );
  const excludedPostIds = await getExcludedCreditedPostIds(reader, excluded);
  const enrichmentVisibility: FeedEnrichmentVisibility = {
    excludedAuthorIds: excluded,
    excludedPostIds,
  };

  if (tab === "following") {
    const visibleFollowedIds =
      excluded.length > 0
        ? followedIds.filter((id) => !excluded.includes(id))
        : followedIds;

    if (visibleFollowedIds.length === 0) {
      return { posts: [], hasMore: false, nextCursor: null };
    }

    const start = cursorPosition ? 0 : (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    let query = applyPostFilters(
      reader.from("posts").select(POST_SELECT),
      { type, cutoff, excludedAuthorIds: excluded, excludedPostIds }
    ).in("author_id", visibleFollowedIds);
    query = applyKeysetCursor(query, cursorPosition)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });
    const result = (await (cursorPosition
      ? query.limit(safePageSize + 1)
      : query.range(start, end))) as SupabaseQueryResult<
      Array<Record<string, unknown>>
    >;

    const raw = expectRows<Record<string, unknown>>(
      result,
      "load following feed"
    );
    const deliveredRows = raw.slice(0, safePageSize);
    const hasMore = raw.length > safePageSize;
    const rankingContext: RankingContext = {
      userId,
      followedIds: new Set(followedIds),
      userInterests,
      userUniversity,
      userCountry: null,
    };
    const posts = await enrichPosts(
      reader,
      deliveredRows,
      rankingContext,
      viewerClient,
      enrichmentVisibility
    );
    return {
      posts,
      hasMore,
      nextCursor: getNextCursor(deliveredRows, hasMore, cursorContext!),
    };
  }

  if (tab === "topics" || tab === "subscriptions") {
    const source = tab === "topics" ? "topics" : subscriptionSource;
    const subscribedTopics = topicSubscriptionKeys ?? [];
    const subscribedAuthors = (authorSubscriptionIds ?? []).filter(
      (id) => id !== userId && !excluded.includes(id)
    );
    const includeAuthors = source !== "topics" && subscribedAuthors.length > 0;
    const includeTopics =
      source !== "authors" &&
      isTopicSubscriptionsEnabled() &&
      subscribedTopics.length > 0;
    if (
      !userId ||
      (tab === "subscriptions" && !isAuthorSubscriptionsUxV2Enabled()) ||
      (!includeAuthors && !includeTopics)
    ) {
      return { posts: [], hasMore: false, nextCursor: null };
    }

    const start = cursorPosition ? 0 : (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    const candidateLimit = cursorPosition
      ? safePageSize + 1
      : end + safePageSize + 1;
    const excludedWithSelf = Array.from(new Set([...excluded, userId]));
    // Self-authored subscription entries include accepted coauthor credits,
    // not only primary authorship. Resolve those ids before any source applies
    // its limit; deleting them after the merge could turn a full candidate
    // window into an empty/exhausted page while older eligible posts remained.
    const viewerCreditedPostIds = await getExcludedCreditedPostIds(reader, [
      userId,
    ]);
    const subscriptionExcludedPostIds = Array.from(
      new Set([...excludedPostIds, ...viewerCreditedPostIds])
    );
    const rowsById = new Map<string, Record<string, unknown>>();
    const matchedAuthorsByPost = new Map<string, Set<string>>();
    const matchedTopicsByPost = new Map<string, string[]>();

    if (includeTopics) {
      let query = applyPostFilters(
        reader.from("posts").select(POST_SELECT_WITH_TOPIC_KEYS),
        {
          type,
          cutoff,
          excludedAuthorIds: excludedWithSelf,
          excludedPostIds: subscriptionExcludedPostIds,
        }
      ).overlaps("topic_keys", subscribedTopics);
      query = applyKeysetCursor(query, cursorPosition)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
      const result = (await query.limit(candidateLimit)) as SupabaseQueryResult<
        Array<Record<string, unknown>>
      >;
      const topicRows = expectRows(result, "load topic subscription feed");
      for (const row of topicRows) {
        const id = row.id as string;
        rowsById.set(id, row);
        matchedTopicsByPost.set(
          id,
          ((row.topic_keys as string[] | null) ?? []).filter((key) =>
            subscribedTopics.includes(key)
          )
        );
      }
    }

    if (includeAuthors) {
      let primaryQuery = applyPostFilters(
        reader.from("posts").select(POST_SELECT),
        {
          type,
          cutoff,
          excludedAuthorIds: excludedWithSelf,
          excludedPostIds: subscriptionExcludedPostIds,
        }
      ).in("author_id", subscribedAuthors);
      primaryQuery = applyKeysetCursor(primaryQuery, cursorPosition)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });
      // Query coauthor matches from posts, not from an arbitrarily limited
      // slice of post_authors. The top-level recency order and cursor now pick
      // the candidates, so prolific subscribed authors cannot have newer work
      // silently omitted by an unordered credit lookup.
      let coauthorQuery = applyPostFilters(
        reader
          .from("posts")
          .select(
            `${POST_SELECT}, subscription_author_credits:post_authors!inner(user_id, accepted_at)`
          ),
        {
          type,
          cutoff,
          excludedAuthorIds: excludedWithSelf,
          excludedPostIds: subscriptionExcludedPostIds,
        }
      )
        .in("subscription_author_credits.user_id", subscribedAuthors)
        .not("subscription_author_credits.accepted_at", "is", null);
      coauthorQuery = applyKeysetCursor(coauthorQuery, cursorPosition)
        .order("published_at", { ascending: false })
        .order("id", { ascending: false });

      const [primaryResult, coauthoredResult] = await Promise.all([
        primaryQuery.limit(candidateLimit),
        coauthorQuery.limit(candidateLimit),
      ]);
      const primaryRows = expectRows<Record<string, unknown>>(
        primaryResult,
        "load author subscription feed"
      );
      const coauthoredRows = expectRows<
        Record<string, unknown> & {
          subscription_author_credits?:
            | Array<{ user_id?: string; accepted_at?: string | null }>
            | { user_id?: string; accepted_at?: string | null }
            | null;
        }
      >(
        coauthoredResult,
        "load subscribed coauthor posts"
      );

      for (const row of primaryRows) {
        const id = row.id as string;
        rowsById.set(id, row);
        matchedAuthorsByPost.set(id, new Set([row.author_id as string]));
      }

      for (const row of coauthoredRows) {
        const { subscription_author_credits: embeddedCredits, ...postRow } = row;
        const id = postRow.id as string;
        rowsById.set(id, postRow);

        const credits = Array.isArray(embeddedCredits)
          ? embeddedCredits
          : embeddedCredits
            ? [embeddedCredits]
            : [];
        const matches = matchedAuthorsByPost.get(id) ?? new Set<string>();
        for (const credit of credits) {
          if (
            typeof credit.user_id === "string" &&
            credit.accepted_at != null &&
            subscribedAuthors.includes(credit.user_id)
          ) {
            matches.add(credit.user_id);
          }
        }
        if (matches.size > 0) matchedAuthorsByPost.set(id, matches);
      }
    }
    const orderedRows = Array.from(rowsById.values()).sort((left, right) => {
      const leftDate =
        (left.published_at as string | null) ??
        (left.created_at as string | null) ??
        "";
      const rightDate =
        (right.published_at as string | null) ??
        (right.created_at as string | null) ??
        "";
      return (
        rightDate.localeCompare(leftDate) ||
        String(right.id).localeCompare(String(left.id))
      );
    });
    const rankingContext: RankingContext = {
      userId,
      followedIds: new Set(followedIds),
      userInterests,
      userUniversity,
      userCountry: null,
    };
    const deliveredRows = orderedRows.slice(start, end);
    const hasMore = orderedRows.length > end;
    const posts = await enrichPosts(
      reader,
      deliveredRows,
      rankingContext,
      viewerClient,
      enrichmentVisibility
    );
    for (const post of posts) {
      const authorIds = Array.from(matchedAuthorsByPost.get(post.id) ?? []);
      const topicKeys = matchedTopicsByPost.get(post.id) ?? [];
      const reasons: SubscriptionMatchReason[] = [];
      for (const authorId of authorIds) {
        const matchedProfile =
          post.author_id === authorId
            ? post.profiles
            : post.co_authors?.find(
                (coauthor) => coauthor.user_id === authorId
              )?.profile;
        reasons.push({
          kind: "author",
          key: authorId,
          label:
            matchedProfile?.full_name ??
            matchedProfile?.username ??
            "this author",
        });
      }
      for (const key of topicKeys) {
        const tag =
          (post.tags ?? []).find(
            (candidate) =>
              candidate.trim().toLowerCase().replace(/\s+/g, " ") === key
          ) ?? key;
        reasons.push({ kind: "topic", key, label: tag });
      }
      post.subscription_match = { authorIds, topicKeys, reasons };
    }
    return {
      posts,
      hasMore,
      nextCursor: getNextCursor(deliveredRows, hasMore, cursorContext!),
    };
  }

  if (tab === "latest") {
    const start = cursorPosition ? 0 : (safePage - 1) * safePageSize;
    const end = start + safePageSize;
    let query = applyPostFilters(
      reader.from("posts").select(POST_SELECT),
      { type, cutoff, excludedAuthorIds: excluded, excludedPostIds }
    );
    query = applyKeysetCursor(query, cursorPosition)
      .order("published_at", { ascending: false })
      .order("id", { ascending: false });
    const result = (await (cursorPosition
      ? query.limit(safePageSize + 1)
      : query.range(start, end))) as SupabaseQueryResult<
      Array<Record<string, unknown>>
    >;

    const raw = expectRows<Record<string, unknown>>(result, "load latest feed");
    const deliveredRows = raw.slice(0, safePageSize);
    const hasMore = raw.length > safePageSize;
    const rankingContext: RankingContext = {
      userId,
      followedIds: new Set(followedIds),
      userInterests,
      userUniversity,
      userCountry: null,
    };
    const posts = await enrichPosts(
      reader,
      deliveredRows,
      rankingContext,
      viewerClient,
      enrichmentVisibility
    );
    return {
      posts,
      hasMore,
      nextCursor: getNextCursor(deliveredRows, hasMore, cursorContext!),
    };
  }

  // The ranked window has to be the same set of posts on every page, and this
  // is the whole reason: `rankPosts` orders by score, not by date, so widening
  // the candidate pool per page (which is what `page * pageSize + 12` did)
  // re-ranks a *different* set each time and then slices it by index. An older
  // post with real engagement outscores a fresh one with none, so page 2's pool
  // slotted such posts above the ones page 1 had already delivered and pushed
  // page 1's tail down into page 2's slice -- the reader scrolls and sees the
  // same cards again, while whatever got shoved past the window never arrives.
  //
  // A fixed window makes every page a slice of one identical ranking, so the
  // slices tile instead of overlapping. Snapped up to a whole number of pages
  // so no page straddles the boundary and comes back short.
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;
  const rankedWindow =
    Math.ceil(RANKED_FEED_WINDOW / safePageSize) * safePageSize;

  const rankingContext: RankingContext = {
    userId,
    followedIds: new Set(followedIds),
    userInterests,
    userUniversity,
    userCountry: null,
  };

  // Past the ranked window there is nothing left to rank against, so the tail
  // falls back to plain reverse-chronological paging. It starts at date index
  // `start`, which is at or beyond the window, and the window is exactly the
  // newest `rankedWindow` posts -- so the tail can never repeat one of them.
  if (start >= rankedWindow) {
    const tailQuery = applyPostFilters(
      reader.from("posts").select(POST_SELECT),
      { type, cutoff, excludedAuthorIds: excluded, excludedPostIds }
    );
    const tailResult = (await tailQuery
      .order("published_at", { ascending: false })
      .order("id", { ascending: false })
      .range(start, end)) as SupabaseQueryResult<unknown[]>;

    const raw = expectRows(tailResult, "load chronological feed tail");
    const posts = await enrichPosts(
      reader,
      raw.slice(0, safePageSize),
      rankingContext,
      viewerClient,
      enrichmentVisibility
    );
    return { posts, hasMore: raw.length > safePageSize };
  }

  const query = applyPostFilters(
    reader.from("posts").select(POST_SELECT),
    {
      type,
      cutoff,
      excludedAuthorIds: excluded,
      excludedPostIds,
    }
  );

  // One row past the window, so the last ranked page knows whether the
  // chronological tail has anything in it rather than guessing.
  const result = (await query
    .order("published_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(rankedWindow + 1)) as SupabaseQueryResult<unknown[]>;
  const data = expectRows(result, "load ranked feed candidates");

  const candidates = data.slice(0, rankedWindow);
  const hasTail = data.length > rankedWindow;
  const enriched = await enrichPosts(
    reader,
    candidates,
    rankingContext,
    viewerClient,
    enrichmentVisibility
  );

  const ranked = rankPosts(enriched, rankingContext);

  return {
    posts: ranked.slice(start, end),
    hasMore: ranked.length > end || hasTail,
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
        userUniversity: null,
        followedIds: [],
      },
      // Cached public cards deliberately omit comment counts. The request's
      // RLS client attaches visible counts after the cache lookup.
      null
    );
  },
  ["public-feed-page"],
  { revalidate: 120, tags: ["feed", "public-feed"] }
);

import type { PostCardData } from "@/components/post/PostCard";
import { feedListRepository, feedRepository } from "@/lib/db/readAdapter";
import { unstable_cache } from "next/cache";
import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import {
  rankPosts,
  type HybridCandidateSource,
  type ViewerPostEngagementSignal,
} from "@/lib/feedRanking";
import { getVisibleCommentCountsByPostId } from "@/lib/postCounts";
import type { FeedListCriteria } from "@/lib/db/feedList";
import type { FeedHydration, FeedPostCounts, FeedRankingCount } from "@/lib/db/feed";
import { createAdminClient } from "@/lib/supabase/admin";
import type { HomeFeedTab } from "@/lib/homeFeedTabs";

/**
 * Home has two modes: For You and Following.
 *
 * v4 makes an important architectural distinction:
 * - Following is a simple reverse-chronological keyset feed.
 * - For You is ranked once, then frozen into a signed snapshot cursor. Later
 *   pages resolve those exact ids instead of re-ranking a moving data set.
 */
export type FeedTabKey = HomeFeedTab;
export type FeedTimeframe = "all" | "week" | "month";
export type FeedContentFilter = "all" | "post" | "article";

export function normalizeFeedContentFilter(
  value: string | null | undefined
): FeedContentFilter {
  if (value === "post" || value === "blog") return "post";
  if (value === "article" || value === "essay" || value === "policy_brief") {
    return "article";
  }
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
    rpc?: (
      fn: string,
      params?: Record<string, unknown>
    ) => PromiseLike<{ data: unknown; error?: unknown }>;
  };
  tab: FeedTabKey;
  page: number;
  pageSize: number;
  type: FeedContentFilter | null;
  timeframe: FeedTimeframe;
  userId: string | null;
  userInterests: string[];
  followedIds: string[];
  excludedAuthorIds?: string[];
  cursor?: string | null;
}

type FeedSupabaseClient = FeedOptions["supabase"];

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

async function listFeedPostsByIds(
  reader: FeedSupabaseClient,
  operation: string,
  postIds: readonly string[],
  criteria: Pick<
    FeedListCriteria,
    "contentKind" | "cutoff" | "excludedAuthorIds" | "excludedPostIds"
  >
): Promise<Array<Record<string, unknown>>> {
  if (postIds.length === 0) return [];
  try {
    const rows = await feedListRepository(reader as never).listPostsByIds(
      postIds,
      criteria
    );
    return rows as unknown as Array<Record<string, unknown>>;
  } catch (error) {
    throw new FeedDataError(operation, error);
  }
}

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

/** Sixteen 12-card screens: broad enough for hybrid discovery, small enough for a compact cursor. */
export const RANKED_FEED_WINDOW = 192;
export const MAX_FEED_PAGE = 100;
export const MAX_FEED_PAGE_SIZE = 30;

export type FeedCandidateArm = HybridCandidateSource | "for_you_tail";

interface FeedCursorContext {
  tab: FeedTabKey;
  type: FeedContentFilter;
  timeframe: FeedTimeframe;
}

interface FeedCursorPosition {
  publishedAt: string;
  id: string;
}

interface FollowingCursorPayload extends FeedCursorContext, FeedCursorPosition {
  version: 1;
  tab: "following";
}

const HOME_CURSOR_VERSION = 2;
const FOLLOWING_CURSOR_VERSION = 1;
const MAX_CURSOR_LENGTH = 12_000;
const MAX_CURSOR_JSON_BYTES = 64 * 1024;
const SAFE_CURSOR_ID = /^[A-Za-z0-9_-]{1,128}$/;
const HOME_CURSOR_PREFIX = "fy4";
/** A feed session is intentionally short-lived; stale sessions restart cleanly. */
const HOME_CURSOR_MAX_AGE_MS = 60 * 60 * 1000;
const HOME_CURSOR_FUTURE_SKEW_MS = 5 * 60 * 1000;

type ArmCode = "p" | "f" | "d" | "t" | "e";
type SnapshotCursorItem = [id: string, source: ArmCode];

interface HomeCursorPayload extends FeedCursorContext {
  version: 2;
  tab: "home";
  snapshotAt: string;
  remaining: SnapshotCursorItem[];
  tail: FeedCursorPosition | null;
}

type DecodedFeedCursor =
  | { kind: "following"; position: FeedCursorPosition }
  | { kind: "home"; snapshot: HomeCursorPayload };

function getCursorContext(
  tab: FeedTabKey,
  type: FeedContentFilter | null,
  timeframe: FeedTimeframe
): FeedCursorContext {
  return { tab, type: type ?? "all", timeframe };
}

function canonicalTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp).toISOString();
}

function getCursorSigningSecret(): string {
  const secret =
    process.env.FEED_CURSOR_SIGNING_SECRET?.trim() ||
    process.env.FEED_EXPOSURE_SIGNING_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "indegenius-feed-cursor-development-secret";
  }
  throw new FeedCursorError("Feed cursor signing is not configured.");
}

function armToCode(source: HybridCandidateSource): ArmCode {
  switch (source) {
    case "for_you_personalized":
      return "p";
    case "for_you_fresh":
      return "f";
    case "for_you_discovery":
      return "d";
    case "for_you_trending":
      return "t";
    case "for_you_evergreen":
      return "e";
  }
}

function codeToArm(code: ArmCode): HybridCandidateSource {
  switch (code) {
    case "p":
      return "for_you_personalized";
    case "f":
      return "for_you_fresh";
    case "d":
      return "for_you_discovery";
    case "t":
      return "for_you_trending";
    case "e":
      return "for_you_evergreen";
  }
}

function isArmCode(value: unknown): value is ArmCode {
  return value === "p" || value === "f" || value === "d" || value === "t" || value === "e";
}

function decodeFollowingCursor(
  cursor: string,
  expectedContext: FeedCursorContext
): FeedCursorPosition {
  if (
    cursor.length === 0 ||
    cursor.length > 2048 ||
    !/^[A-Za-z0-9_-]+$/.test(cursor)
  ) {
    throw new FeedCursorError();
  }

  try {
    const bytes = Buffer.from(cursor, "base64url");
    if (bytes.toString("base64url") !== cursor) throw new FeedCursorError();
    const payload = JSON.parse(bytes.toString("utf8")) as Partial<FollowingCursorPayload>;
    const publishedAt = canonicalTimestamp(payload.publishedAt);
    if (
      payload.version !== FOLLOWING_CURSOR_VERSION ||
      payload.tab !== "following" ||
      expectedContext.tab !== "following" ||
      payload.type !== expectedContext.type ||
      payload.timeframe !== expectedContext.timeframe ||
      !publishedAt ||
      typeof payload.id !== "string" ||
      !SAFE_CURSOR_ID.test(payload.id)
    ) {
      throw new FeedCursorError();
    }
    return { publishedAt, id: payload.id };
  } catch (error) {
    if (error instanceof FeedCursorError) throw error;
    throw new FeedCursorError();
  }
}

function decodeHomeCursor(
  cursor: string,
  expectedContext: FeedCursorContext
): HomeCursorPayload {
  if (cursor.length === 0 || cursor.length > MAX_CURSOR_LENGTH) {
    throw new FeedCursorError();
  }
  const parts = cursor.split(".");
  if (parts.length !== 3 || parts[0] !== HOME_CURSOR_PREFIX) {
    throw new FeedCursorError();
  }
  const [, encoded, signature] = parts;
  if (
    !/^[A-Za-z0-9_-]+$/.test(encoded) ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    throw new FeedCursorError();
  }

  const expectedSignature = Buffer.from(
    createHmac("sha256", getCursorSigningSecret()).update(encoded).digest("base64url")
  );
  const providedSignature = Buffer.from(signature);
  if (
    providedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(providedSignature, expectedSignature)
  ) {
    throw new FeedCursorError();
  }

  try {
    const compressed = Buffer.from(encoded, "base64url");
    const json = inflateRawSync(compressed, { maxOutputLength: MAX_CURSOR_JSON_BYTES }).toString("utf8");
    const payload = JSON.parse(json) as Partial<HomeCursorPayload>;
    const snapshotAt = canonicalTimestamp(payload.snapshotAt);
    const snapshotAtMs = snapshotAt ? Date.parse(snapshotAt) : NaN;
    const now = Date.now();
    const tailPublishedAt = payload.tail ? canonicalTimestamp(payload.tail.publishedAt) : null;
    if (
      payload.version !== HOME_CURSOR_VERSION ||
      payload.tab !== "home" ||
      expectedContext.tab !== "home" ||
      payload.type !== expectedContext.type ||
      payload.timeframe !== expectedContext.timeframe ||
      !snapshotAt ||
      snapshotAtMs > now + HOME_CURSOR_FUTURE_SKEW_MS ||
      now - snapshotAtMs > HOME_CURSOR_MAX_AGE_MS ||
      !Array.isArray(payload.remaining) ||
      payload.remaining.length > RANKED_FEED_WINDOW ||
      (payload.tail !== null &&
        (!payload.tail ||
          !tailPublishedAt ||
          typeof payload.tail.id !== "string" ||
          !SAFE_CURSOR_ID.test(payload.tail.id)))
    ) {
      throw new FeedCursorError();
    }

    const remaining: SnapshotCursorItem[] = [];
    for (const item of payload.remaining) {
      if (
        !Array.isArray(item) ||
        item.length !== 2 ||
        typeof item[0] !== "string" ||
        !SAFE_CURSOR_ID.test(item[0]) ||
        !isArmCode(item[1])
      ) {
        throw new FeedCursorError();
      }
      remaining.push([item[0], item[1]]);
    }

    return {
      version: HOME_CURSOR_VERSION,
      tab: "home",
      type: payload.type,
      timeframe: payload.timeframe,
      snapshotAt,
      remaining,
      tail: payload.tail
        ? { publishedAt: tailPublishedAt!, id: payload.tail.id }
        : null,
    };
  } catch (error) {
    if (error instanceof FeedCursorError) throw error;
    throw new FeedCursorError();
  }
}

function decodeFeedCursor(
  cursor: string | null | undefined,
  expectedContext: FeedCursorContext
): DecodedFeedCursor | null {
  if (cursor == null) return null;
  if (expectedContext.tab === "home") {
    return { kind: "home", snapshot: decodeHomeCursor(cursor, expectedContext) };
  }
  return { kind: "following", position: decodeFollowingCursor(cursor, expectedContext) };
}

function encodeFollowingCursor(
  row: Record<string, unknown>,
  context: FeedCursorContext
): string {
  const publishedAt = canonicalTimestamp(row.published_at);
  const id = row.id;
  if (
    context.tab !== "following" ||
    !publishedAt ||
    typeof id !== "string" ||
    !SAFE_CURSOR_ID.test(id)
  ) {
    throw new FeedCursorError(
      "The feed cannot continue because its last item has no valid cursor position."
    );
  }

  const payload: FollowingCursorPayload = {
    version: FOLLOWING_CURSOR_VERSION,
    tab: "following",
    type: context.type,
    timeframe: context.timeframe,
    publishedAt,
    id,
  };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function encodeHomeCursor(payload: HomeCursorPayload): string {
  const encoded = deflateRawSync(Buffer.from(JSON.stringify(payload), "utf8"), {
    level: 9,
  }).toString("base64url");
  const signature = createHmac("sha256", getCursorSigningSecret())
    .update(encoded)
    .digest("base64url");
  const cursor = `${HOME_CURSOR_PREFIX}.${encoded}.${signature}`;
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new FeedCursorError("The feed snapshot is too large to continue safely.");
  }
  return cursor;
}

function cursorPositionFromRow(row: Record<string, unknown>): FeedCursorPosition {
  const publishedAt = canonicalTimestamp(row.published_at);
  const id = row.id;
  if (!publishedAt || typeof id !== "string" || !SAFE_CURSOR_ID.test(id)) {
    throw new FeedCursorError(
      "The feed cannot continue because its last item has no valid cursor position."
    );
  }
  return { publishedAt, id };
}

function getFollowingNextCursor(
  rows: Array<Record<string, unknown>>,
  hasMore: boolean,
  context: FeedCursorContext
): string | null {
  if (!hasMore || rows.length === 0) return null;
  return encodeFollowingCursor(rows[rows.length - 1], context);
}

function getTimeframeCutoff(
  timeframe: FeedTimeframe,
  nowMs = Date.now()
): string | null {
  if (timeframe === "week") {
    return new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  }
  if (timeframe === "month") {
    return new Date(nowMs - 30 * 24 * 60 * 60 * 1000).toISOString();
  }
  return null;
}

async function getExcludedCreditedPostIds(
  reader: FeedSupabaseClient,
  excludedAuthorIds: string[]
): Promise<string[]> {
  if (excludedAuthorIds.length === 0) return [];
  try {
    return await feedListRepository(reader as never).postIdsCreditedTo(excludedAuthorIds);
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
    return posts.map((post) => ({ ...post, comment_count: counts[post.id] ?? 0 }));
  } catch (error) {
    console.warn(
      "[feed-hydration] viewer comment counts unavailable; rendering zero counts",
      error
    );
    return posts.map((post) => ({ ...post, comment_count: 0 }));
  }
}

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

  // The post list is the feed's required data. Card hydration is decoration. If
  // Supabase is degraded, a profile/count timeout must not throw away a list we
  // already loaded successfully. This is especially important for the new
  // single-RPC hydration path: do not answer one failed RPC with six retries.
  let hydration: FeedHydration;
  try {
    hydration = await feedRepository(reader as never, viewerClient as never).hydrate({
      postIds,
      authorIds,
      viewer: { id: viewerId },
    });
  } catch (error) {
    console.warn(
      "[feed-hydration] card hydration unavailable; rendering readable cards without decoration",
      error
    );
    hydration = { counts: [], profiles: [] };
  }

  const countsById = new Map<string, FeedPostCounts>(
    hydration.counts.map((entry) => [entry.postId, entry])
  );
  const profilesById = new Map(hydration.profiles.map((profile) => [profile.id, profile]));

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

async function enrichRankingCandidates(
  reader: FeedSupabaseClient,
  raw: Array<Record<string, unknown>>,
  viewerId: string | null,
  viewerClient: FeedSupabaseClient | null = reader
): Promise<PostCardData[]> {
  const postIds = raw.map((post) => String(post.id ?? "")).filter(Boolean);
  let counts: FeedRankingCount[] = [];

  try {
    counts = await feedRepository(reader as never, viewerClient as never).rankingCounts({
      postIds,
      viewer: { id: viewerId },
    });
  } catch (error) {
    // Ranking metrics are optional signals. During a database incident we keep
    // freshness/relevance/affinity ranking rather than turning the whole Home
    // page into an error or launching a retry storm.
    console.warn(
      "[feed-ranking] candidate counters unavailable; ranking with zero counters",
      error
    );
  }

  const countsById = new Map(counts.map((entry) => [entry.postId, entry]));
  return raw.map((post) => {
    const id = String(post.id ?? "");
    const entry = countsById.get(id);
    return {
      ...(post as object),
      profiles: null,
      like_count: entry?.likeCount ?? 0,
      bookmark_count: entry?.bookmarkCount ?? 0,
      comment_count: entry?.commentCount ?? 0,
      viewer_liked: false,
      viewer_bookmarked: false,
    } as PostCardData;
  });
}

function hydrateRankedPage(
  ranked: PostCardData[],
  hydrated: PostCardData[]
): PostCardData[] {
  const hydratedById = new Map(hydrated.map((post) => [post.id, post]));
  return ranked.map((rankedPost) => ({
    ...(hydratedById.get(rankedPost.id) ?? rankedPost),
    score: rankedPost.score,
    candidate_source: rankedPost.candidate_source,
  }));
}

function normalizeSignalKey(value: string) {
  return value.trim().toLocaleLowerCase("en");
}

function normalizeAffinity(entries: Array<{ key: string; weight: number }>) {
  const max = entries.reduce((current, entry) => Math.max(current, entry.weight), 0);
  const result = new Map<string, number>();
  if (max <= 0) return result;
  for (const entry of entries) {
    // Square root keeps one dominant past interest from crushing useful secondary ones.
    result.set(entry.key, Math.sqrt(Math.max(0, entry.weight) / max));
  }
  return result;
}

async function loadRankingSignals(
  reader: FeedSupabaseClient,
  userId: string | null,
  postIds: string[],
  snapshotAt: string
): Promise<{
  authorAffinity: Map<string, number>;
  topicAffinity: Map<string, number>;
  viewerEngagement: Map<string, ViewerPostEngagementSignal>;
}> {
  const empty = {
    authorAffinity: new Map<string, number>(),
    topicAffinity: new Map<string, number>(),
    viewerEngagement: new Map<string, ViewerPostEngagementSignal>(),
  };
  if (!userId || postIds.length === 0 || typeof reader.rpc !== "function") return empty;

  const snapshotMs = Date.parse(snapshotAt);
  const affinitySince = new Date(snapshotMs - 90 * 24 * 60 * 60 * 1000).toISOString();
  const fatigueSince = new Date(snapshotMs - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [affinityResult, engagementResult] = await Promise.allSettled([
    reader.rpc("get_reader_affinity", {
      p_user_id: userId,
      p_since: affinitySince,
      p_limit: 32,
    }),
    reader.rpc("get_viewer_post_engagement", {
      p_user_id: userId,
      p_post_ids: postIds,
      p_since: fatigueSince,
    }),
  ]);

  const affinityRows =
    affinityResult.status === "fulfilled" && !affinityResult.value.error && Array.isArray(affinityResult.value.data)
      ? (affinityResult.value.data as Array<Record<string, unknown>>)
      : [];
  const engagementRows =
    engagementResult.status === "fulfilled" && !engagementResult.value.error && Array.isArray(engagementResult.value.data)
      ? (engagementResult.value.data as Array<Record<string, unknown>>)
      : [];

  if (affinityResult.status === "rejected" || (affinityResult.status === "fulfilled" && affinityResult.value.error)) {
    console.warn("[feed-ranking] reader affinity unavailable; continuing without it");
  }
  if (engagementResult.status === "rejected" || (engagementResult.status === "fulfilled" && engagementResult.value.error)) {
    console.warn("[feed-ranking] viewer fatigue unavailable; continuing without it");
  }

  const authors: Array<{ key: string; weight: number }> = [];
  const topics: Array<{ key: string; weight: number }> = [];
  for (const row of affinityRows) {
    const key = typeof row.key === "string" ? row.key.trim() : "";
    const weight = Number(row.weight);
    if (!key || !Number.isFinite(weight) || weight <= 0) continue;
    if (row.kind === "author") authors.push({ key, weight });
    if (row.kind === "topic") topics.push({ key: normalizeSignalKey(key), weight });
  }

  const viewerEngagement = new Map<string, ViewerPostEngagementSignal>();
  for (const row of engagementRows) {
    const postId = typeof row.post_id === "string" ? row.post_id : "";
    const impressions = Math.max(0, Number(row.impressions) || 0);
    if (!postId) continue;
    viewerEngagement.set(postId, {
      impressions,
      hasRead: row.has_read === true,
    });
  }

  return {
    authorAffinity: normalizeAffinity(authors),
    topicAffinity: normalizeAffinity(topics),
    viewerEngagement,
  };
}

function snapshotItem(post: PostCardData): SnapshotCursorItem {
  const source = post.candidate_source as HybridCandidateSource | undefined;
  const safeSource: HybridCandidateSource =
    source === "for_you_personalized" ||
    source === "for_you_fresh" ||
    source === "for_you_discovery" ||
    source === "for_you_trending" ||
    source === "for_you_evergreen"
      ? source
      : "for_you_discovery";
  return [post.id, armToCode(safeSource)];
}

function makeHomeCursor(
  context: FeedCursorContext,
  snapshotAt: string,
  remaining: SnapshotCursorItem[],
  tail: FeedCursorPosition | null
): string | null {
  if (remaining.length === 0 && !tail) return null;
  return encodeHomeCursor({
    version: HOME_CURSOR_VERSION,
    tab: "home",
    type: context.type,
    timeframe: context.timeframe,
    snapshotAt,
    remaining,
    tail,
  });
}

async function consumeChronologicalTail(
  reader: FeedSupabaseClient,
  viewerClient: FeedSupabaseClient | null,
  viewerId: string | null,
  selection: Pick<
    FeedListCriteria,
    "contentKind" | "cutoff" | "excludedAuthorIds" | "excludedPostIds"
  >,
  tail: FeedCursorPosition,
  limit: number
): Promise<{ posts: PostCardData[]; nextTail: FeedCursorPosition | null }> {
  if (limit <= 0) return { posts: [], nextTail: tail };
  const raw = await listFeedPosts(reader, "load chronological feed tail", {
    ...selection,
    cursor: tail,
    limit: limit + 1,
  });
  const deliveredRows = raw.slice(0, limit);
  const posts = await enrichPosts(reader, deliveredRows, viewerId, viewerClient);
  const hasMore = raw.length > limit;
  return {
    posts: posts.map((post) => ({ ...post, candidate_source: "for_you_tail" })),
    nextTail:
      hasMore && deliveredRows.length > 0
        ? cursorPositionFromRow(deliveredRows[deliveredRows.length - 1])
        : null,
  };
}

async function continueHomeSnapshot(
  reader: FeedSupabaseClient,
  viewerClient: FeedSupabaseClient | null,
  viewerId: string | null,
  snapshot: HomeCursorPayload,
  selection: Pick<
    FeedListCriteria,
    "contentKind" | "cutoff" | "excludedAuthorIds" | "excludedPostIds"
  >,
  pageSize: number,
  context: FeedCursorContext
): Promise<FeedPageResult> {
  const remaining = [...snapshot.remaining];
  const foundRows: Array<Record<string, unknown>> = [];
  const sources = new Map<string, HybridCandidateSource>();
  let consumed = 0;

  // A snapshotted post can disappear (deleted/unpublished/newly blocked).
  // Consume further ids until this page is full rather than returning holes.
  while (foundRows.length < pageSize && consumed < remaining.length) {
    const needed = pageSize - foundRows.length;
    const batch = remaining.slice(consumed, consumed + needed);
    consumed += batch.length;
    const raw = await listFeedPostsByIds(
      reader,
      "resolve ranked feed snapshot",
      batch.map(([id]) => id),
      selection
    );
    const byId = new Map(raw.map((row) => [String(row.id), row]));
    for (const [id, code] of batch) {
      const row = byId.get(id);
      if (!row) continue;
      foundRows.push(row);
      sources.set(id, codeToArm(code));
    }
  }

  const nextRemaining = remaining.slice(consumed);
  const rankedPosts = (await enrichPosts(reader, foundRows, viewerId, viewerClient)).map(
    (post) => ({
      ...post,
      candidate_source: sources.get(post.id) ?? "for_you_discovery",
    })
  );

  let posts: PostCardData[] = rankedPosts;
  let nextTail = snapshot.tail;
  if (posts.length < pageSize && nextRemaining.length === 0 && nextTail) {
    const tailResult = await consumeChronologicalTail(
      reader,
      viewerClient,
      viewerId,
      selection,
      nextTail,
      pageSize - posts.length
    );
    posts = [...posts, ...tailResult.posts];
    nextTail = tailResult.nextTail;
  }

  const nextCursor = makeHomeCursor(
    context,
    snapshot.snapshotAt,
    nextRemaining,
    nextTail
  );
  return { posts, hasMore: Boolean(nextCursor), nextCursor };
}

async function firstPageChronologicalFallback(
  reader: FeedSupabaseClient,
  viewerClient: FeedSupabaseClient | null,
  viewerId: string | null,
  selection: Pick<
    FeedListCriteria,
    "contentKind" | "cutoff" | "excludedAuthorIds" | "excludedPostIds"
  >,
  pageSize: number,
  context: FeedCursorContext,
  snapshotAt: string
): Promise<FeedPageResult> {
  const raw = await listFeedPosts(reader, "load safe chronological feed fallback", {
    ...selection,
    limit: pageSize + 1,
  });
  const deliveredRows = raw.slice(0, pageSize);
  const posts = (await enrichPosts(reader, deliveredRows, viewerId, viewerClient)).map(
    (post) => ({ ...post, candidate_source: "for_you_tail" })
  );
  const hasMore = raw.length > pageSize;
  const tail =
    hasMore && deliveredRows.length > 0
      ? cursorPositionFromRow(deliveredRows[deliveredRows.length - 1])
      : null;
  const nextCursor = makeHomeCursor(context, snapshotAt, [], tail);
  return { posts, hasMore: Boolean(nextCursor), nextCursor };
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

  decodeFeedCursor(cursor, getCursorContext(tab, type, timeframe));

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
  const reader = process.env.SUPABASE_SERVICE_ROLE_KEY ? createAdminClient() : supabase;
  const viewerClient = viewerClientOverride === undefined ? supabase : viewerClientOverride;
  const safePage = normalizePositiveInteger(page, 1, MAX_FEED_PAGE);
  const safePageSize = normalizePositiveInteger(pageSize, 12, MAX_FEED_PAGE_SIZE);
  const cursorContext = getCursorContext(tab, type, timeframe);
  const decodedCursor = decodeFeedCursor(cursor, cursorContext);
  const excluded = Array.from(new Set((excludedAuthorIds ?? []).filter(Boolean)));

  if (tab === "following") {
    const position = decodedCursor?.kind === "following" ? decodedCursor.position : null;
    const selection = {
      contentKind: contentKindCriterion(type),
      cutoff: getTimeframeCutoff(timeframe),
      excludedAuthorIds: excluded,
      excludedPostIds: await getExcludedCreditedPostIds(reader, excluded),
    };
    const visibleFollowedIds = followedIds.filter((id) => !excluded.includes(id));
    if (visibleFollowedIds.length === 0) {
      return { posts: [], hasMore: false, nextCursor: null };
    }

    const raw = await listFeedPosts(reader, "load following feed", {
      ...selection,
      authorIds: visibleFollowedIds,
      cursor: position,
      offset: position ? 0 : (safePage - 1) * safePageSize,
      limit: safePageSize + 1,
    });
    const deliveredRows = raw.slice(0, safePageSize);
    const hasMore = raw.length > safePageSize;
    const posts = await enrichPosts(reader, deliveredRows, userId, viewerClient);
    return {
      posts,
      hasMore,
      nextCursor: getFollowingNextCursor(deliveredRows, hasMore, cursorContext),
    };
  }

  if (decodedCursor && decodedCursor.kind !== "home") {
    throw new FeedCursorError();
  }
  if (!decodedCursor && safePage > 1) {
    throw new FeedCursorError(
      "For You continuation requires the snapshot cursor from the previous page."
    );
  }

  const snapshotAt =
    decodedCursor?.kind === "home"
      ? decodedCursor.snapshot.snapshotAt
      : new Date().toISOString();
  const snapshotMs = Date.parse(snapshotAt);
  const selection = {
    contentKind: contentKindCriterion(type),
    cutoff: getTimeframeCutoff(timeframe, snapshotMs),
    excludedAuthorIds: excluded,
    excludedPostIds: await getExcludedCreditedPostIds(reader, excluded),
  };

  if (decodedCursor?.kind === "home") {
    return continueHomeSnapshot(
      reader,
      viewerClient,
      userId,
      decodedCursor.snapshot,
      selection,
      safePageSize,
      cursorContext
    );
  }

  // First For You page: rank a broad, lightweight candidate set, then hydrate
  // only the small page that will actually be rendered. The old v4 path fully
  // hydrated all 192 candidates (profiles, viewer state and counters) before
  // throwing 180 of them away, which amplified PostgREST traffic during every
  // Home load.
  try {
    const raw = await listFeedPosts(reader, "load hybrid feed candidates", {
      ...selection,
      limit: RANKED_FEED_WINDOW + 1,
    });
    const candidateRows = raw.slice(0, RANKED_FEED_WINDOW);
    const candidates = await enrichRankingCandidates(
      reader,
      candidateRows,
      userId,
      viewerClient
    );
    const signals = await loadRankingSignals(
      reader,
      userId,
      candidates.map((post) => post.id),
      snapshotAt
    );
    const ranked = rankPosts(candidates, {
      userId,
      followedIds: new Set(followedIds),
      userInterests,
      snapshotAt,
      ...signals,
    });

    const selected = ranked.slice(0, safePageSize);
    const rowsById = new Map(candidateRows.map((row) => [String(row.id), row]));
    const selectedRows = selected
      .map((post) => rowsById.get(post.id))
      .filter((row): row is Record<string, unknown> => Boolean(row));
    const firstPage = hydrateRankedPage(
      selected,
      await enrichPosts(reader, selectedRows, userId, viewerClient)
    );
    const remaining = ranked.slice(safePageSize).map(snapshotItem);
    const tail =
      raw.length > RANKED_FEED_WINDOW && candidateRows.length > 0
        ? cursorPositionFromRow(candidateRows[candidateRows.length - 1])
        : null;
    const nextCursor = makeHomeCursor(cursorContext, snapshotAt, remaining, tail);

    return {
      posts: firstPage,
      hasMore: Boolean(nextCursor),
      nextCursor,
    };
  } catch (error) {
    if (!(error instanceof FeedDataError)) throw error;
    console.warn(
      "[home-feed] ranked first page unavailable; using strict chronological fallback",
      error
    );
    // Viewer/block exclusions were already resolved before entering this block,
    // so this fallback never weakens trust-and-safety. It simply asks for a
    // tiny newest-first page instead of the broad ranking window.
    return firstPageChronologicalFallback(
      reader,
      viewerClient,
      userId,
      selection,
      safePageSize,
      cursorContext,
      snapshotAt
    );
  }
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
      null
    );
  },
  ["public-feed-page-v4"],
  { revalidate: 120, tags: ["feed", "public-feed"] }
);

import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PostCardData } from "@/components/post/PostCard";
import type { FeedPageResult, FeedTabKey } from "@/lib/feedData";

export const FEED_ALGORITHM_VERSION = "feed-v2.0.0";

export type FeedCandidateSource =
  | "for_you_ranked"
  | "for_you_tail"
  | "followed_author"
  | "subscription"
  | "subscribed_topic"
  | "latest";

export interface FeedExposure {
  postId: string;
  slug: string;
  exposureId: string;
  feedSessionId: string;
  requestId: string;
  algorithmVersion: string;
  experimentVariant: "ranking_v2";
  surface: FeedTabKey | "home_featured";
  candidateSource: FeedCandidateSource | "featured_editorial" | "featured_recommended" | "featured_latest";
  position: number;
  page: number;
  servedAt: string;
  signature?: string;
}

type UnsignedFeedExposure = Omit<FeedExposure, "signature">;

const FEED_EXPOSURE_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FEED_EXPOSURE_FUTURE_SKEW_MS = 5 * 60 * 1000;
const SAFE_EXPOSURE_ID = /^[A-Za-z0-9:_-]{1,256}$/;
const SAFE_POST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const CANDIDATE_SOURCES = new Set<FeedExposure["candidateSource"]>([
  "for_you_ranked",
  "for_you_tail",
  "followed_author",
  "subscription",
  "subscribed_topic",
  "latest",
  "featured_editorial",
  "featured_recommended",
  "featured_latest",
]);
const EXPOSURE_SURFACES = new Set<FeedExposure["surface"]>([
  "home",
  "following",
  "subscriptions",
  "topics",
  "latest",
  "home_featured",
]);

function getSigningSecret(): string | null {
  return (
    process.env.FEED_EXPOSURE_SIGNING_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    null
  );
}

function canonicalExposure(exposure: UnsignedFeedExposure): string {
  return JSON.stringify([
    exposure.postId,
    exposure.slug,
    exposure.exposureId,
    exposure.feedSessionId,
    exposure.requestId,
    exposure.algorithmVersion,
    exposure.experimentVariant,
    exposure.surface,
    exposure.candidateSource,
    exposure.position,
    exposure.page,
    exposure.servedAt,
  ]);
}

function signExposure(exposure: UnsignedFeedExposure): string | undefined {
  const secret = getSigningSecret();
  if (!secret) return undefined;
  return createHmac("sha256", secret)
    .update(canonicalExposure(exposure))
    .digest("base64url");
}

function parseUnsignedExposure(value: unknown): UnsignedFeedExposure | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const servedAtMs =
    typeof source.servedAt === "string" ? Date.parse(source.servedAt) : NaN;
  const now = Date.now();

  if (
    typeof source.postId !== "string" ||
    !SAFE_POST_ID.test(source.postId) ||
    typeof source.slug !== "string" ||
    source.slug.length === 0 ||
    source.slug.length > 256 ||
    typeof source.exposureId !== "string" ||
    !SAFE_EXPOSURE_ID.test(source.exposureId) ||
    typeof source.feedSessionId !== "string" ||
    !SAFE_EXPOSURE_ID.test(source.feedSessionId) ||
    typeof source.requestId !== "string" ||
    !SAFE_EXPOSURE_ID.test(source.requestId) ||
    source.algorithmVersion !== FEED_ALGORITHM_VERSION ||
    source.experimentVariant !== "ranking_v2" ||
    !EXPOSURE_SURFACES.has(source.surface as FeedExposure["surface"]) ||
    !CANDIDATE_SOURCES.has(
      source.candidateSource as FeedExposure["candidateSource"]
    ) ||
    typeof source.position !== "number" ||
    !Number.isSafeInteger(source.position) ||
    source.position < 0 ||
    typeof source.page !== "number" ||
    !Number.isSafeInteger(source.page) ||
    source.page < 1 ||
    !Number.isFinite(servedAtMs) ||
    servedAtMs > now + FEED_EXPOSURE_FUTURE_SKEW_MS ||
    now - servedAtMs > FEED_EXPOSURE_MAX_AGE_MS
  ) {
    return null;
  }

  return {
    postId: source.postId,
    slug: source.slug,
    exposureId: source.exposureId,
    feedSessionId: source.feedSessionId,
    requestId: source.requestId,
    algorithmVersion: FEED_ALGORITHM_VERSION,
    experimentVariant: "ranking_v2",
    surface: source.surface as FeedExposure["surface"],
    candidateSource: source.candidateSource as FeedExposure["candidateSource"],
    position: source.position,
    page: source.page,
    servedAt: new Date(servedAtMs).toISOString(),
  };
}

export function verifyFeedExposureMetadata(
  value: unknown,
  expectedSlug: string
): FeedExposure | null {
  const secret = getSigningSecret();
  const exposure = parseUnsignedExposure(value);
  const signature =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>).signature
      : null;
  if (
    !secret ||
    !exposure ||
    exposure.slug !== expectedSlug ||
    typeof signature !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)
  ) {
    return null;
  }

  const expected = Buffer.from(
    createHmac("sha256", secret)
      .update(canonicalExposure(exposure))
      .digest("base64url")
  );
  const provided = Buffer.from(signature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }
  return { ...exposure, signature };
}

function getCandidateSource(
  tab: FeedTabKey,
  page: number,
  pageSize: number,
  rankedWindow: number
): FeedCandidateSource {
  if (tab === "home") {
    return (page - 1) * pageSize < rankedWindow
      ? "for_you_ranked"
      : "for_you_tail";
  }
  if (tab === "following") return "followed_author";
  if (tab === "topics") return "subscribed_topic";
  if (tab === "subscriptions") return "subscription";
  return "latest";
}

function stripRankingInternals(post: PostCardData): PostCardData {
  const {
    score: _score,
    quality_score: _qualityScore,
    impression_count: _impressions,
    read_count: _reads,
    view_count: _views,
    reference_count: _references,
    bookmark_count: _bookmarks,
    ...card
  } = post;

  return card;
}

export function prepareFeedPageForClient(
  result: FeedPageResult,
  options: {
    tab: FeedTabKey;
    page: number;
    pageSize: number;
    rankedWindow: number;
    requestId?: string;
    feedSessionId?: string;
    servedAt?: string;
  }
): FeedPageResult {
  const requestId = options.requestId ?? crypto.randomUUID();
  const feedSessionId = options.feedSessionId ?? requestId;
  const servedAt = options.servedAt ?? new Date().toISOString();
  const candidateSource = getCandidateSource(
    options.tab,
    options.page,
    options.pageSize,
    options.rankedWindow
  );

  return {
    ...result,
    posts: result.posts.map((post, index) => {
      const position = (options.page - 1) * options.pageSize + index + 1;
      const exposure: UnsignedFeedExposure = {
        postId: post.id,
        slug: post.slug,
        exposureId: `${requestId}:${position}:${post.id}`,
        feedSessionId,
        requestId,
        algorithmVersion: FEED_ALGORITHM_VERSION,
        experimentVariant: "ranking_v2",
        surface: options.tab,
        candidateSource,
        position,
        page: options.page,
        servedAt,
      };
      return {
        ...stripRankingInternals(post),
        feed_exposure: {
          ...exposure,
          signature: signExposure(exposure),
        },
      };
    }),
  };
}

export function createFeaturedExposure(
  postId: string,
  slug: string,
  provenance: "editorial" | "recommended" | "latest",
  requestId = crypto.randomUUID(),
  feedSessionId = requestId,
  servedAt = new Date().toISOString()
): FeedExposure {
  const exposure: UnsignedFeedExposure = {
    postId,
    slug,
    exposureId: `${requestId}:0:${postId}`,
    feedSessionId,
    requestId,
    algorithmVersion: FEED_ALGORITHM_VERSION,
    experimentVariant: "ranking_v2",
    surface: "home_featured",
    candidateSource:
      provenance === "editorial"
        ? "featured_editorial"
        : provenance === "latest"
          ? "featured_latest"
          : "featured_recommended",
    position: 0,
    page: 1,
    servedAt,
  };
  return { ...exposure, signature: signExposure(exposure) };
}

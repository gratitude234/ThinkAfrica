import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { PostCardData } from "@/components/post/PostCard";
import type {
  FeedCandidateArm,
  FeedPageResult,
  FeedTabKey,
} from "@/lib/feedData";

// v4: hybrid candidate lanes + stable snapshot pagination + reader fatigue and
// qualified-read affinity. Exposures from v3 are intentionally not comparable.
export const FEED_ALGORITHM_VERSION = "feed-v4.1.0";

export type FeedCandidateSource = FeedCandidateArm | "followed_author";

export interface FeedExposure {
  postId: string;
  slug: string;
  exposureId: string;
  feedSessionId: string;
  requestId: string;
  algorithmVersion: string;
  experimentVariant: "ranking_v4";
  surface: FeedTabKey;
  candidateSource: FeedCandidateSource;
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
const CANDIDATE_SOURCES = new Set<FeedCandidateSource>([
  "for_you_personalized",
  "for_you_fresh",
  "for_you_discovery",
  "for_you_trending",
  "for_you_evergreen",
  "for_you_tail",
  "followed_author",
]);
const EXPOSURE_SURFACES = new Set<FeedTabKey>(["home", "following"]);

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
    source.experimentVariant !== "ranking_v4" ||
    !EXPOSURE_SURFACES.has(source.surface as FeedTabKey) ||
    !CANDIDATE_SOURCES.has(source.candidateSource as FeedCandidateSource) ||
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
    experimentVariant: "ranking_v4",
    surface: source.surface as FeedTabKey,
    candidateSource: source.candidateSource as FeedCandidateSource,
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

/**
 * Where a card came from, when the card itself does not say. For You labels
 * each row with the part of the feed that supplied it; this is the answer for
 * Following, where the surface and the source are the same fact, and the
 * fallback for a For You row without a label.
 */
function getCandidateSource(
  tab: FeedTabKey,
  page: number,
  pageSize: number,
  rankedWindow: number
): FeedCandidateSource {
  if (tab === "following") return "followed_author";
  return (page - 1) * pageSize < rankedWindow
    ? "for_you_discovery"
    : "for_you_tail";
}

function resolveCandidateSource(
  post: PostCardData,
  fallback: FeedCandidateSource
): FeedCandidateSource {
  const labelled = post.candidate_source;
  return labelled && CANDIDATE_SOURCES.has(labelled as FeedCandidateSource)
    ? (labelled as FeedCandidateSource)
    : fallback;
}

function stripRankingInternals(post: PostCardData): PostCardData {
  const {
    score: _score,
    impression_count: _impressions,
    read_count: _reads,
    view_count: _views,
    bookmark_count: _bookmarks,
    // Which part of the feed supplied the card is server bookkeeping. It
    // travels on the signed exposure, where it cannot be edited, not as a
    // loose field on the card, where it could be.
    candidate_source: _candidateSource,
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
  const fallbackCandidateSource = getCandidateSource(
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
        experimentVariant: "ranking_v4",
        surface: options.tab,
        candidateSource: resolveCandidateSource(post, fallbackCandidateSource),
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

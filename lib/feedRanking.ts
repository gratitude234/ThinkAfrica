import type { PostCardData } from "@/components/post/PostCard";

/**
 * Indegenius For You v4.
 *
 * Ranking is deliberately split into two jobs:
 *   1. score publications using bounded, explainable reader/content signals;
 *   2. compose each screen from soft candidate lanes so fresh/discovery work
 *      cannot be starved by already-popular publications.
 *
 * Pagination stability is handled in lib/feedData.ts. The order produced here
 * is frozen into the first page's snapshot cursor and is never recomputed for
 * later pages in the same feed session.
 */

export interface ViewerPostEngagementSignal {
  impressions: number;
  hasRead: boolean;
}

export interface RankingContext {
  userId: string | null;
  followedIds: Set<string>;
  /** The topics the reader explicitly chose, compared case-insensitively. */
  userInterests: string[];
  /** Learned from qualified reads over the recent affinity window, normalized 0..1. */
  authorAffinity?: Map<string, number>;
  /** Learned from qualified reads over the recent affinity window, normalized 0..1. */
  topicAffinity?: Map<string, number>;
  /** Per-viewer exposure/read history used only as a fatigue/novelty signal. */
  viewerEngagement?: Map<string, ViewerPostEngagementSignal>;
  /** Freezes all time-based scoring for one feed snapshot. */
  snapshotAt?: string | number | Date;
}

export type RankablePost = PostCardData;

export type HybridCandidateSource =
  | "for_you_personalized"
  | "for_you_fresh"
  | "for_you_discovery"
  | "for_you_trending"
  | "for_you_evergreen";

/** v4 weights. Fresh content also has a guaranteed lane; freshness is not its only chance. */
export const SCORE_WEIGHTS = {
  relevance: 0.3,
  satisfaction: 0.25,
  freshness: 0.2,
  writerAffinity: 0.1,
  novelty: 0.1,
  exploration: 0.05,
} as const;

/** Following has its own chronological tab, so topics carry more weight here. */
export const RELEVANCE_WEIGHTS = {
  followedAuthor: 0.35,
  topic: 0.65,
} as const;

/**
 * Qualified reads and saves are stronger than lightweight reactions.
 * All rates are normalized against exposure and Bayesian-smoothed below.
 */
export const SATISFACTION_WEIGHTS = {
  reads: 0.45,
  bookmarks: 0.3,
  comments: 0.15,
  likes: 0.1,
} as const;

/** A publication loses half of its freshness every two days. */
export const FRESHNESS_HALF_LIFE_HOURS = 48;

/**
 * Exposure assumed before observed rates are trusted. This prevents one early
 * action from making a nearly-unseen publication look universally loved.
 */
export const PRIOR_EXPOSURES = 75;

/**
 * New-content distribution is a product guarantee, not merely a score boost.
 * Every unseen publication receives strong protection while it is building its
 * first audience, then that support fades gradually instead of falling off a
 * hard impression cliff.
 */
export const INITIAL_DISTRIBUTION_IMPRESSIONS = 30;
export const EXPLORATION_FADE_OUT_IMPRESSIONS = 250;
export const NEW_CONTENT_PROTECTION_HOURS = 72;
/** Backward-compatible name used by older tests/docs. */
export const FRESH_LANE_HOURS = NEW_CONTENT_PROTECTION_HOURS;
export const TRENDING_LANE_HOURS = 7 * 24;
export const EVERGREEN_MIN_AGE_HOURS = 7 * 24;

export const DIVERSITY_WINDOW_SIZE = 12;
export const MAX_POSTS_PER_AUTHOR_PER_WINDOW = 2;
/** Soft topic cap so one interest cannot monopolize an entire screen. */
export const MAX_POSTS_PER_TOPIC_PER_WINDOW = 4;

/** Soft target mix for each 12-card window. Any empty lane is backfilled by score. */
export const FEED_LANE_TARGETS: ReadonlyArray<
  readonly [HybridCandidateSource, number]
> = [
  ["for_you_fresh", 5],
  ["for_you_personalized", 3],
  ["for_you_discovery", 2],
  ["for_you_trending", 1],
  ["for_you_evergreen", 1],
] as const;

/**
 * Five protected fresh slots out of twelve (41.7%) whenever enough unseen
 * recent inventory exists. Fresh cards are deliberately spread through the
 * screen rather than stacked in one chronological block.
 */
const FEED_LANE_SCHEDULE: ReadonlyArray<HybridCandidateSource | null> = [
  "for_you_fresh",
  "for_you_personalized",
  "for_you_discovery",
  "for_you_fresh",
  "for_you_personalized",
  "for_you_fresh",
  "for_you_trending",
  "for_you_discovery",
  "for_you_fresh",
  "for_you_personalized",
  "for_you_evergreen",
  "for_you_fresh",
];

function nonNegativeFinite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

function bounded01(value: number | null | undefined): number {
  return Math.max(0, Math.min(1, nonNegativeFinite(value)));
}

/**
 * Bounded action rate with a prior. Impressions only ever appear in the
 * denominator, so simply being shown more cannot increase satisfaction.
 */
function boundedActionRate(
  actions: number | null | undefined,
  impressions: number,
  expectedRate: number
): number {
  const safeActions = nonNegativeFinite(actions);
  if (safeActions === 0) return 0;

  const observedRate = safeActions / (impressions + PRIOR_EXPOSURES);
  return 1 - Math.exp(-observedRate / expectedRate);
}

function normalizeTopic(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

function snapshotMs(ctx: RankingContext): number {
  const raw = ctx.snapshotAt ?? Date.now();
  const value = raw instanceof Date ? raw.getTime() : typeof raw === "number" ? raw : Date.parse(raw);
  return Number.isFinite(value) ? value : Date.now();
}

function ageHours(post: RankablePost, ctx: RankingContext): number {
  const publishedAtMs = Date.parse(post.published_at ?? post.created_at);
  if (!Number.isFinite(publishedAtMs)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (snapshotMs(ctx) - publishedAtMs) / 3_600_000);
}

function explicitTopicMatch(post: RankablePost, ctx: RankingContext): boolean {
  const interests = new Set(ctx.userInterests.map(normalizeTopic).filter(Boolean));
  return (
    interests.size > 0 &&
    (post.tags ?? []).some((tag) => interests.has(normalizeTopic(tag)))
  );
}

function getRelevance(post: RankablePost, ctx: RankingContext): number {
  const authorId = post.author_id ?? "";
  let relevance = explicitTopicMatch(post, ctx) ? RELEVANCE_WEIGHTS.topic : 0;
  if (authorId && ctx.followedIds.has(authorId)) {
    relevance += RELEVANCE_WEIGHTS.followedAuthor;
  }
  return Math.min(1, relevance);
}

function getSatisfaction(post: RankablePost): number {
  const impressions = nonNegativeFinite(post.impression_count);
  return (
    boundedActionRate(post.read_count, impressions, 0.22) *
      SATISFACTION_WEIGHTS.reads +
    boundedActionRate(post.bookmark_count, impressions, 0.035) *
      SATISFACTION_WEIGHTS.bookmarks +
    boundedActionRate(post.comment_count, impressions, 0.025) *
      SATISFACTION_WEIGHTS.comments +
    boundedActionRate(post.like_count, impressions, 0.07) *
      SATISFACTION_WEIGHTS.likes
  );
}

function getFreshness(post: RankablePost, ctx: RankingContext): number {
  const hours = ageHours(post, ctx);
  if (!Number.isFinite(hours)) return 0;
  return Math.pow(0.5, hours / FRESHNESS_HALF_LIFE_HOURS);
}

function getWriterAffinity(post: RankablePost, ctx: RankingContext): number {
  const authorId = post.author_id?.trim();
  const author = authorId ? bounded01(ctx.authorAffinity?.get(authorId)) : 0;
  let topic = 0;
  for (const tag of post.tags ?? []) {
    topic = Math.max(topic, bounded01(ctx.topicAffinity?.get(normalizeTopic(tag))));
  }
  // A learned writer relationship is stronger than a learned topic relationship.
  return Math.min(1, author * 0.65 + topic * 0.35);
}

function getNovelty(post: RankablePost, ctx: RankingContext): number {
  const signal = ctx.viewerEngagement?.get(post.id);
  if (!signal) return 1;
  if (signal.hasRead) return 0.15;
  if (signal.impressions <= 0) return 1;
  if (signal.impressions === 1) return 0.8;
  if (signal.impressions === 2) return 0.55;
  return 0.3;
}

function newContentAgeSupport(hours: number): number {
  if (!Number.isFinite(hours) || hours < 0 || hours >= NEW_CONTENT_PROTECTION_HOURS) {
    return 0;
  }
  // 0-24h: strongest protection. 24-48h: still heavily protected.
  // 48-72h: taper to zero so old winners can take over naturally.
  if (hours <= 24) return 1;
  if (hours <= 48) return 1 - ((hours - 24) / 24) * 0.3;
  return 0.7 * (1 - (hours - 48) / 24);
}

function distributionExposureNeed(impressions: number): number {
  if (impressions < INITIAL_DISTRIBUTION_IMPRESSIONS) return 1;
  if (impressions >= EXPLORATION_FADE_OUT_IMPRESSIONS) return 0;
  const progress =
    (impressions - INITIAL_DISTRIBUTION_IMPRESSIONS) /
    (EXPLORATION_FADE_OUT_IMPRESSIONS - INITIAL_DISTRIBUTION_IMPRESSIONS);
  return bounded01(1 - progress);
}

function getExploration(post: RankablePost, ctx: RankingContext): number {
  const hours = ageHours(post, ctx);
  const ageSupport = newContentAgeSupport(hours);
  if (ageSupport <= 0) return 0;

  const impressions = nonNegativeFinite(post.impression_count);
  const exposureNeed = distributionExposureNeed(impressions);
  if (exposureNeed <= 0) return 0;

  // Already-read/repeated content can still rank on quality/relevance, but it
  // should not receive the same new-content exploration assistance.
  return bounded01(ageSupport * exposureNeed * getNovelty(post, ctx));
}

export interface FeedScoreBreakdown {
  relevance: number;
  satisfaction: number;
  freshness: number;
  writerAffinity: number;
  novelty: number;
  exploration: number;
  total: number;
}

export function scorePostBreakdown(
  post: RankablePost,
  ctx: RankingContext
): FeedScoreBreakdown {
  const relevance = getRelevance(post, ctx);
  const satisfaction = getSatisfaction(post);
  const freshness = getFreshness(post, ctx);
  const writerAffinity = getWriterAffinity(post, ctx);
  const novelty = getNovelty(post, ctx);
  const exploration = getExploration(post, ctx);
  const total =
    100 *
    (relevance * SCORE_WEIGHTS.relevance +
      satisfaction * SCORE_WEIGHTS.satisfaction +
      freshness * SCORE_WEIGHTS.freshness +
      writerAffinity * SCORE_WEIGHTS.writerAffinity +
      novelty * SCORE_WEIGHTS.novelty +
      exploration * SCORE_WEIGHTS.exploration);

  return {
    relevance,
    satisfaction,
    freshness,
    writerAffinity,
    novelty,
    exploration,
    total,
  };
}

export function scorePost(post: RankablePost, ctx: RankingContext): number {
  return scorePostBreakdown(post, ctx).total;
}

interface ScoredPost<T extends RankablePost> {
  post: T;
  score: number;
  breakdown: FeedScoreBreakdown;
}

function publishedAtMs(post: RankablePost): number {
  const value = Date.parse(post.published_at ?? post.created_at);
  return Number.isFinite(value) ? value : 0;
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortScored<T extends RankablePost>(items: Array<ScoredPost<T>>) {
  return items.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    const dateDifference = publishedAtMs(right.post) - publishedAtMs(left.post);
    if (dateDifference !== 0) return dateDifference;
    return compareIds(left.post.id, right.post.id);
  });
}

function isFresh<T extends RankablePost>(candidate: ScoredPost<T>, ctx: RankingContext) {
  const viewerSignal = ctx.viewerEngagement?.get(candidate.post.id);
  return (
    ageHours(candidate.post, ctx) < NEW_CONTENT_PROTECTION_HOURS &&
    !viewerSignal?.hasRead &&
    (viewerSignal?.impressions ?? 0) <= 0
  );
}

/**
 * Ordering inside the protected fresh lane is intentionally different from
 * the general relevance/quality score. The first job is fair circulation:
 * publications that have not yet reached the initial test audience are served
 * before already-well-exposed fresh publications. Only after that do recency,
 * reader relevance and early satisfaction break ties.
 */
function compareFreshDistribution<T extends RankablePost>(
  left: ScoredPost<T>,
  right: ScoredPost<T>,
  ctx: RankingContext
): number {
  const leftImpressions = nonNegativeFinite(left.post.impression_count);
  const rightImpressions = nonNegativeFinite(right.post.impression_count);
  const leftInitial = leftImpressions < INITIAL_DISTRIBUTION_IMPRESSIONS ? 1 : 0;
  const rightInitial = rightImpressions < INITIAL_DISTRIBUTION_IMPRESSIONS ? 1 : 0;
  if (leftInitial !== rightInitial) return rightInitial - leftInitial;

  // Within the test stage, distribute the least-seen work first. This is what
  // prevents a newly published writer from being buried by a fresh winner that
  // already received plenty of opportunity.
  if (leftImpressions !== rightImpressions) return leftImpressions - rightImpressions;

  const ageSupportDifference =
    newContentAgeSupport(ageHours(right.post, ctx)) -
    newContentAgeSupport(ageHours(left.post, ctx));
  if (ageSupportDifference !== 0) return ageSupportDifference;

  const readerFitLeft = left.breakdown.relevance + left.breakdown.writerAffinity;
  const readerFitRight = right.breakdown.relevance + right.breakdown.writerAffinity;
  if (readerFitRight !== readerFitLeft) return readerFitRight - readerFitLeft;
  if (right.breakdown.satisfaction !== left.breakdown.satisfaction) {
    return right.breakdown.satisfaction - left.breakdown.satisfaction;
  }

  const dateDifference = publishedAtMs(right.post) - publishedAtMs(left.post);
  if (dateDifference !== 0) return dateDifference;
  return compareIds(left.post.id, right.post.id);
}

function isPersonalized<T extends RankablePost>(candidate: ScoredPost<T>) {
  return candidate.breakdown.relevance > 0 || candidate.breakdown.writerAffinity >= 0.15;
}

function isTrending<T extends RankablePost>(candidate: ScoredPost<T>, ctx: RankingContext) {
  return (
    ageHours(candidate.post, ctx) <= TRENDING_LANE_HOURS &&
    candidate.breakdown.satisfaction >= 0.18
  );
}

function isEvergreen<T extends RankablePost>(candidate: ScoredPost<T>, ctx: RankingContext) {
  return (
    ageHours(candidate.post, ctx) >= EVERGREEN_MIN_AGE_HOURS &&
    candidate.breakdown.satisfaction >= 0.18
  );
}

function isDiscovery<T extends RankablePost>(candidate: ScoredPost<T>, ctx: RankingContext) {
  const authorId = candidate.post.author_id?.trim();
  const viewerSignal = ctx.viewerEngagement?.get(candidate.post.id);
  return (
    (!authorId || !ctx.followedIds.has(authorId)) &&
    !viewerSignal?.hasRead &&
    candidate.breakdown.novelty >= 0.55
  );
}

function matchesLane<T extends RankablePost>(
  candidate: ScoredPost<T>,
  source: HybridCandidateSource,
  ctx: RankingContext
): boolean {
  switch (source) {
    case "for_you_fresh":
      return isFresh(candidate, ctx);
    case "for_you_discovery":
      return !isFresh(candidate, ctx) && isDiscovery(candidate, ctx);
    case "for_you_trending":
      return !isFresh(candidate, ctx) && isTrending(candidate, ctx);
    case "for_you_evergreen":
      return isEvergreen(candidate, ctx);
    case "for_you_personalized":
      return !isFresh(candidate, ctx) && isPersonalized(candidate);
  }
}

function inferredSource<T extends RankablePost>(
  candidate: ScoredPost<T>,
  ctx: RankingContext
): HybridCandidateSource {
  if (isFresh(candidate, ctx)) return "for_you_fresh";
  if (isPersonalized(candidate)) return "for_you_personalized";
  if (isTrending(candidate, ctx)) return "for_you_trending";
  if (isEvergreen(candidate, ctx)) return "for_you_evergreen";
  return "for_you_discovery";
}

function authorKey(post: RankablePost): string {
  return post.author_id?.trim() || `post:${post.id}`;
}

function topicKey(post: RankablePost): string {
  const topic = (post.tags ?? []).map(normalizeTopic).find(Boolean);
  // Untagged publications should not suppress one another as though "untagged"
  // were a topic. Give each one a private diversity key instead.
  return topic || `post:${post.id}`;
}

/**
 * Pick one candidate while respecting author diversity and avoiding the same
 * writer twice in a row. The constraints are preferences: if inventory is too
 * thin, the caller eventually falls back to the highest-scoring remaining row.
 */
function findEligibleIndex<T extends RankablePost>(
  remaining: Array<ScoredPost<T>>,
  authorCounts: Map<string, number>,
  topicCounts: Map<string, number>,
  previousAuthor: string | null,
  predicate: (candidate: ScoredPost<T>) => boolean
): number {
  const strict = remaining.findIndex((candidate) => {
    const key = authorKey(candidate.post);
    const topic = topicKey(candidate.post);
    return (
      predicate(candidate) &&
      (authorCounts.get(key) ?? 0) < MAX_POSTS_PER_AUTHOR_PER_WINDOW &&
      (topicCounts.get(topic) ?? 0) < MAX_POSTS_PER_TOPIC_PER_WINDOW &&
      key !== previousAuthor
    );
  });
  if (strict >= 0) return strict;

  return remaining.findIndex((candidate) => {
    const key = authorKey(candidate.post);
    const topic = topicKey(candidate.post);
    return (
      predicate(candidate) &&
      (authorCounts.get(key) ?? 0) < MAX_POSTS_PER_AUTHOR_PER_WINDOW &&
      (topicCounts.get(topic) ?? 0) < MAX_POSTS_PER_TOPIC_PER_WINDOW
    );
  });
}

/**
 * Soft-lane feed composition. In healthy inventory each 12-card screen protects
 * five slots for unseen recent work, then mixes personalized, discovery,
 * trending and evergreen content. Any unavailable lane is backfilled by score.
 */
function composeHybridFeed<T extends RankablePost>(
  sorted: Array<ScoredPost<T>>,
  ctx: RankingContext
): T[] {
  const remaining = [...sorted];
  const result: T[] = [];

  while (remaining.length > 0) {
    const authorCounts = new Map<string, number>();
    const topicCounts = new Map<string, number>();
    let previousAuthor: string | null = null;
    let placedInWindow = 0;

    const place = (index: number, source: HybridCandidateSource) => {
      const [candidate] = remaining.splice(index, 1);
      const key = authorKey(candidate.post);
      authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
      const topic = topicKey(candidate.post);
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
      previousAuthor = key;
      result.push({
        ...candidate.post,
        score: candidate.score,
        candidate_source: source,
      });
      placedInWindow += 1;
    };

    for (const source of FEED_LANE_SCHEDULE) {
      if (!source || remaining.length === 0) continue;

      // Fresh distribution uses its own fair-circulation ordering. The global
      // score still controls every other lane and all backfill slots.
      let laneView = remaining;
      if (source === "for_you_fresh") {
        laneView = [...remaining].sort((left, right) =>
          compareFreshDistribution(left, right, ctx)
        );
      }
      const eligibleIndex = findEligibleIndex(
        laneView,
        authorCounts,
        topicCounts,
        previousAuthor,
        (candidate) => matchesLane(candidate, source, ctx)
      );
      if (eligibleIndex < 0) continue;
      const selectedId = laneView[eligibleIndex].post.id;
      const index = remaining.findIndex((candidate) => candidate.post.id === selectedId);
      if (index >= 0) place(index, source);
    }

    while (placedInWindow < DIVERSITY_WINDOW_SIZE && remaining.length > 0) {
      let index = findEligibleIndex(
        remaining,
        authorCounts,
        topicCounts,
        previousAuthor,
        () => true
      );
      if (index < 0) index = 0;
      const candidate = remaining[index];
      place(index, inferredSource(candidate, ctx));
    }
  }

  return result;
}

export function rankPosts<T extends RankablePost>(
  posts: T[],
  ctx: RankingContext
): T[] {
  const scored = sortScored(
    posts.map((post) => ({
      post,
      score: scorePost(post, ctx),
      breakdown: scorePostBreakdown(post, ctx),
    }))
  );

  return composeHybridFeed(scored, ctx);
}

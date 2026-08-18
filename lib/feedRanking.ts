import type { PostCardData } from "@/components/post/PostCard";
import {
  isFormallyReviewed,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";

export interface RankingContext {
  userId: string | null;
  followedIds: Set<string>;
  userInterests: string[];
  userUniversity: string | null;
  userCountry: string | null;
}

/**
 * Retained for callers that imported the old constants. Content kind is no
 * longer a quality multiplier: it only controls how quickly freshness fades.
 */
export const TYPE_WEIGHT: Record<string, number> = {
  research: 1,
  policy_brief: 1,
  essay: 1,
  blog: 1,
};

/** @deprecated The v2 scorer uses explicit half-lives rather than gravity. */
export const GRAVITY = 1.8;
/** @deprecated Affinity is now a bounded, additive relevance feature. */
export const AFFINITY_CAP = 4.0;

export const FRESHNESS_HALF_LIFE_HOURS: Record<ContentKind, number> = {
  post: 36,
  article: 24 * 7,
  research: 24 * 30,
};

export const DIVERSITY_WINDOW_SIZE = 12;
export const MAX_POSTS_PER_AUTHOR_PER_WINDOW = 2;

export interface RankablePost extends PostCardData {
  author_id?: string;
  impression_count?: number | null;
  read_count?: number | null;
  bookmark_count?: number;
  reference_count?: number;
  response_count?: number;
  /**
   * Kept on the input contract for feed-card compatibility. It is deliberately
   * not scored because the helper already contains engagement and recency;
   * adding it here would count the same signals twice.
   */
  quality_score?: number;
}

const DEFAULT_HALF_LIFE_HOURS = FRESHNESS_HALF_LIFE_HOURS.article;
const PRIOR_EXPOSURES = 20;

function nonNegativeFinite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/**
 * A bounded action rate. The exponential transform gives each additional
 * action less influence than the previous one. Impressions only appear in the
 * denominator, so additional exposure can never improve a post's score by
 * itself. The small prior prevents tiny samples from immediately saturating.
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

function getRelevance(post: RankablePost, ctx: RankingContext): number {
  const authorId = post.author_id ?? "";
  const authorUniversity = post.profiles?.university?.trim() ?? "";
  const interests = new Set(
    ctx.userInterests.map(normalizeTopic).filter(Boolean)
  );
  const interestMatch = (post.tags ?? []).some((tag) =>
    interests.has(normalizeTopic(tag))
  );

  let relevance = 0;
  if (authorId && ctx.followedIds.has(authorId)) relevance += 0.55;
  if (interestMatch) relevance += 0.35;
  if (
    ctx.userUniversity?.trim() &&
    authorUniversity &&
    ctx.userUniversity.trim().toLocaleLowerCase("en") ===
      authorUniversity.toLocaleLowerCase("en")
  ) {
    relevance += 0.1;
  }

  return Math.min(1, relevance);
}

function getSatisfaction(post: RankablePost, impressions: number): number {
  const views = boundedActionRate(post.view_count, impressions, 0.5);
  const reads = boundedActionRate(post.read_count, impressions, 0.25);
  const likes = boundedActionRate(post.like_count, impressions, 0.06);
  const bookmarks = boundedActionRate(post.bookmark_count, impressions, 0.025);
  const responses = boundedActionRate(post.response_count, impressions, 0.015);

  return (
    views * 0.08 +
    reads * 0.35 +
    likes * 0.12 +
    bookmarks * 0.25 +
    responses * 0.2
  );
}

function getEvidence(post: RankablePost): number {
  const references = nonNegativeFinite(post.reference_count);
  // Four references are enough to nearly saturate the source-count feature.
  // This keeps a large bibliography from dominating the feed.
  const sourceBacked = 1 - Math.exp(-references / 2);
  const reviewed = isFormallyReviewed({
    citation_id: post.citation_id,
    published_version_id: post.published_version_id,
  });

  return sourceBacked * 0.55 + (reviewed ? 0.45 : 0);
}

function getFreshness(post: RankablePost): number {
  const publishedAt = post.published_at ?? post.created_at;
  const publishedAtMs = Date.parse(publishedAt);
  if (!Number.isFinite(publishedAtMs)) return 0;

  const ageHours = Math.max(0, (Date.now() - publishedAtMs) / 3_600_000);
  const kind = resolveContentKind(post);
  const halfLife = kind
    ? FRESHNESS_HALF_LIFE_HOURS[kind]
    : DEFAULT_HALF_LIFE_HOURS;

  return Math.pow(0.5, ageHours / halfLife);
}

function getDiscoveryValue(impressions: number): number {
  // Give low-exposure work a small exploration lane. This only falls as a post
  // receives impressions; exposure itself is never interpreted as quality.
  return 1 / Math.sqrt(1 + impressions / 25);
}

/**
 * Produces a bounded 0..100 score from independent feature groups. Raw
 * engagement counts and the derived quality_score are never added together.
 */
export function scorePost(post: RankablePost, ctx: RankingContext): number {
  const impressions = nonNegativeFinite(post.impression_count);
  const relevance = getRelevance(post, ctx);
  const satisfaction = getSatisfaction(post, impressions);
  const evidence = getEvidence(post);
  const freshness = getFreshness(post);
  const discovery = getDiscoveryValue(impressions);

  return (
    100 *
    (relevance * 0.3 +
      satisfaction * 0.25 +
      evidence * 0.2 +
      freshness * 0.15 +
      discovery * 0.1)
  );
}

interface ScoredPost<T extends RankablePost> {
  post: T;
  score: number;
}

function publishedAtMs(post: RankablePost): number {
  const value = Date.parse(post.published_at ?? post.created_at);
  return Number.isFinite(value) ? value : 0;
}

function compareIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function primaryTopic(post: RankablePost): string | null {
  const tag = post.tags?.find((candidate) => candidate.trim().length > 0);
  return tag ? normalizeTopic(tag) : null;
}

function authorKeys(post: RankablePost): string[] {
  const keys = new Set<string>();
  const primaryAuthorId = post.author_id?.trim();
  if (primaryAuthorId) keys.add(primaryAuthorId);

  // feedData only hydrates accepted post_authors into co_authors. Counting all
  // credited authors here prevents a prolific collaborator from bypassing the
  // cap simply because different people are listed as each post's primary.
  for (const coAuthor of post.co_authors ?? []) {
    const coAuthorId = coAuthor.user_id?.trim();
    if (coAuthorId) keys.add(coAuthorId);
  }

  // Do not group malformed/missing authors together. Treating each record as
  // its own key is the least surprising fallback and still preserves content.
  return keys.size > 0 ? Array.from(keys) : [`post:${post.id}`];
}

/**
 * Greedily reranks each 12-item block while retaining every candidate. Author
 * caps and topic separation are preferences: when inventory cannot satisfy a
 * constraint, the next highest-scoring item is used instead of dropping it.
 */
function diversify<T extends RankablePost>(
  sorted: Array<ScoredPost<T>>
): Array<ScoredPost<T>> {
  const remaining = [...sorted];
  const result: Array<ScoredPost<T>> = [];
  let authorCounts = new Map<string, number>();
  let previousTopic: string | null = null;

  while (remaining.length > 0) {
    if (result.length % DIVERSITY_WINDOW_SIZE === 0) {
      authorCounts = new Map();
    }

    const underAuthorCap = (candidate: ScoredPost<T>) =>
      authorKeys(candidate.post).every(
        (key) =>
          (authorCounts.get(key) ?? 0) <
          MAX_POSTS_PER_AUTHOR_PER_WINDOW
      );
    const differentTopic = (candidate: ScoredPost<T>) => {
      const topic = primaryTopic(candidate.post);
      return !previousTopic || !topic || topic !== previousTopic;
    };

    // Prefer satisfying both constraints, then preserve the author cap, then
    // preserve topic variety. The final fallback guarantees no post is lost.
    let nextIndex = remaining.findIndex(
      (candidate) => underAuthorCap(candidate) && differentTopic(candidate)
    );
    if (nextIndex < 0) {
      nextIndex = remaining.findIndex(underAuthorCap);
    }
    if (nextIndex < 0) {
      nextIndex = remaining.findIndex(differentTopic);
    }
    if (nextIndex < 0) nextIndex = 0;

    const [next] = remaining.splice(nextIndex, 1);
    for (const key of authorKeys(next.post)) {
      authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
    }
    previousTopic = primaryTopic(next.post);
    result.push(next);
  }

  return result;
}

export function rankPosts<T extends RankablePost>(
  posts: T[],
  ctx: RankingContext
): T[] {
  const scored = posts
    .map((post) => ({ post, score: scorePost(post, ctx) }))
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score;

      const dateDifference = publishedAtMs(right.post) - publishedAtMs(left.post);
      if (dateDifference !== 0) return dateDifference;

      return compareIds(left.post.id, right.post.id);
    });

  return diversify(scored).map(({ post, score }) => ({
    ...post,
    score,
  }));
}

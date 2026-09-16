import type { PostCardData } from "@/components/post/PostCard";

/**
 * The For You ranking, kept deliberately small.
 *
 * Until the publishing reset (Phase 2F) this was a five-feature model with
 * learned reader affinity, per-viewer fatigue, an exploration lane, a
 * same-university bonus and an evidence feature built on citation ids and
 * formal review. Most of those inputs came from products that no longer exist,
 * and the rest made the feed hard to explain. What is left is three things a
 * reader can reason about:
 *
 *   - relevance: whether they follow the writer, and whether the post carries
 *     a topic they chose;
 *   - engagement: how often the people it was shown to read, liked or saved it;
 *   - freshness: how recently it was published.
 *
 * Blocked writers never reach this function: lib/feedData.ts excludes them in
 * the query. Following is reverse-chronological and does not pass through here
 * at all.
 */

export interface RankingContext {
  userId: string | null;
  followedIds: Set<string>;
  /** The topics the reader chose, as stored. Compared case-insensitively. */
  userInterests: string[];
}

export type RankablePost = PostCardData;

/** How the three features combine into a 0..100 score. */
export const SCORE_WEIGHTS = {
  relevance: 0.35,
  engagement: 0.3,
  freshness: 0.35,
} as const;

/** Following a writer says more than sharing a topic with them. */
export const RELEVANCE_WEIGHTS = {
  followedAuthor: 0.6,
  topic: 0.4,
} as const;

/**
 * A finished read is the strongest signal a post was worth the time, a save
 * the next, a like the lightest. Views are not here: a view says the headline
 * worked, not that the piece did.
 */
export const ENGAGEMENT_WEIGHTS = {
  reads: 0.45,
  likes: 0.3,
  bookmarks: 0.25,
} as const;

/** A post loses half its freshness every day and a half. */
export const FRESHNESS_HALF_LIFE_HOURS = 36;

/**
 * How much exposure a post is assumed to have had before its action rate is
 * taken at face value. Without it, one like on a post nobody has been shown
 * saturates the feature, and two friends can move a post as far as a real
 * audience can.
 */
export const PRIOR_EXPOSURES = 100;

export const DIVERSITY_WINDOW_SIZE = 12;
export const MAX_POSTS_PER_AUTHOR_PER_WINDOW = 2;

function nonNegativeFinite(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : 0;
}

/**
 * A bounded action rate. Impressions only ever appear in the denominator, so
 * being shown more can never raise a post's score by itself, and the
 * exponential gives each further action less weight than the one before.
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
  const interests = new Set(
    ctx.userInterests.map(normalizeTopic).filter(Boolean)
  );
  const topicMatch =
    interests.size > 0 &&
    (post.tags ?? []).some((tag) => interests.has(normalizeTopic(tag)));

  let relevance = topicMatch ? RELEVANCE_WEIGHTS.topic : 0;
  if (authorId && ctx.followedIds.has(authorId)) {
    relevance += RELEVANCE_WEIGHTS.followedAuthor;
  }
  return Math.min(1, relevance);
}

function getEngagement(post: RankablePost): number {
  const impressions = nonNegativeFinite(post.impression_count);
  return (
    boundedActionRate(post.read_count, impressions, 0.25) *
      ENGAGEMENT_WEIGHTS.reads +
    boundedActionRate(post.like_count, impressions, 0.06) *
      ENGAGEMENT_WEIGHTS.likes +
    boundedActionRate(post.bookmark_count, impressions, 0.025) *
      ENGAGEMENT_WEIGHTS.bookmarks
  );
}

function getFreshness(post: RankablePost): number {
  const publishedAtMs = Date.parse(post.published_at ?? post.created_at);
  if (!Number.isFinite(publishedAtMs)) return 0;

  const ageHours = Math.max(0, (Date.now() - publishedAtMs) / 3_600_000);
  return Math.pow(0.5, ageHours / FRESHNESS_HALF_LIFE_HOURS);
}

/** A 0..100 score from three independent, bounded features. */
export function scorePost(post: RankablePost, ctx: RankingContext): number {
  return (
    100 *
    (getRelevance(post, ctx) * SCORE_WEIGHTS.relevance +
      getEngagement(post) * SCORE_WEIGHTS.engagement +
      getFreshness(post) * SCORE_WEIGHTS.freshness)
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

/**
 * Keeps one prolific writer from filling a screen: at most two posts per
 * author in each block of twelve. It is a preference rather than a filter.
 * When inventory cannot satisfy it, the next highest-scoring post is used, so
 * no post is ever dropped.
 */
function diversify<T extends RankablePost>(
  sorted: Array<ScoredPost<T>>
): Array<ScoredPost<T>> {
  const remaining = [...sorted];
  const result: Array<ScoredPost<T>> = [];
  let authorCounts = new Map<string, number>();

  while (remaining.length > 0) {
    if (result.length % DIVERSITY_WINDOW_SIZE === 0) {
      authorCounts = new Map();
    }

    // A post with no author is its own key rather than grouped with every
    // other one, which is the least surprising fallback for malformed rows.
    const authorKey = (candidate: ScoredPost<T>) =>
      candidate.post.author_id?.trim() || `post:${candidate.post.id}`;

    let nextIndex = remaining.findIndex(
      (candidate) =>
        (authorCounts.get(authorKey(candidate)) ?? 0) <
        MAX_POSTS_PER_AUTHOR_PER_WINDOW
    );
    if (nextIndex < 0) nextIndex = 0;

    const [next] = remaining.splice(nextIndex, 1);
    const key = authorKey(next);
    authorCounts.set(key, (authorCounts.get(key) ?? 0) + 1);
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

  return diversify(scored).map(({ post, score }) => ({ ...post, score }));
}

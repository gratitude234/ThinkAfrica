import type { PostCardData } from "@/components/post/PostCard";
import {
  isFormallyReviewed,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";

/**
 * What a reader has actually finished reading, expressed as 0..1 weights
 * relative to their own most-read author and topic. Built in
 * lib/readerSignals.ts from qualified reads, never from clicks: a click says
 * the headline worked, a qualified read says the piece was worth the time.
 */
export interface ReaderAffinity {
  /** author id -> 0..1 */
  authors: Map<string, number>;
  /** normalized topic key -> 0..1 */
  topics: Map<string, number>;
}

/** This viewer's own history with one specific candidate post. */
export interface ViewerPostEngagement {
  /** Impressions served to this viewer, deduped per day. */
  impressions: number;
  hasRead: boolean;
}

export interface RankingContext {
  userId: string | null;
  followedIds: Set<string>;
  userInterests: string[];
  userUniversity: string | null;
  userCountry: string | null;
  /**
   * Learned preferences. Optional throughout: signed-out readers have none,
   * and a deployment where the reader-signal migration has not been applied
   * yet must degrade to the declared-interest behaviour rather than fail.
   */
  affinity?: ReaderAffinity | null;
  /** Per-candidate viewer history, keyed by post id. Same optionality. */
  viewerEngagement?: Map<string, ViewerPostEngagement> | null;
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
  article: 36,
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

/**
 * How much exposure a post is assumed to have had before its observed action
 * rate is taken at face value.
 *
 * This was 20, which is far too thin to stabilize a rate. A brand new post with
 * a single bookmark and no impressions at all scored 1/20 against an expected
 * rate of 0.025, saturating the bookmark feature to 0.87 and collecting 5.4 of
 * the available 100 points -- more than half of what a properly cited
 * bibliography earns. Two friends quietly saving and replying to a post moved
 * it about as far as genuine quality did, and bookmarks are private and free,
 * so nobody would ever be seen doing it.
 *
 * At 100 a post has to reach a real audience before its hit rate is treated as
 * evidence of anything. Early engagement still counts, it just no longer
 * arrives at full strength on a sample of one.
 */
export const PRIOR_EXPOSURES = 100;

/**
 * Relevance is the largest single feature, so its internal split is where
 * "who wrote this" and "have you shown me you care about this" get balanced.
 * The learned halves can only ever add: a reader who has never finished
 * anything scores exactly as they did before these were introduced.
 */
export const RELEVANCE_WEIGHTS = {
  followedAuthor: 0.45,
  authorAffinity: 0.15,
  topic: 0.3,
  sameUniversity: 0.1,
} as const;

/**
 * Per-viewer fatigue. Multiplied into the final score rather than subtracted
 * from a feature, so it can never push a score below zero and never reorders
 * anything for a reader we have no history for.
 */
export const REPEAT_IMPRESSION_DECAY = 0.75;
export const ALREADY_READ_FATIGUE = 0.25;
export const MIN_FATIGUE = 0.15;

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

function unitWeight(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * How strongly this reader's own reading history points at the post's topics.
 * Takes the strongest matching tag rather than summing, so tagging a post with
 * eight topics cannot manufacture relevance the way adding them up would.
 */
function getLearnedTopicWeight(
  post: RankablePost,
  affinity: ReaderAffinity | null | undefined
): number {
  if (!affinity || affinity.topics.size === 0) return 0;

  let strongest = 0;
  for (const tag of post.tags ?? []) {
    const weight = unitWeight(affinity.topics.get(normalizeTopic(tag)));
    if (weight > strongest) strongest = weight;
  }
  return strongest;
}

function getRelevance(post: RankablePost, ctx: RankingContext): number {
  const authorId = post.author_id ?? "";
  const authorUniversity = post.profiles?.university?.trim() ?? "";
  const interests = new Set(
    ctx.userInterests.map(normalizeTopic).filter(Boolean)
  );
  const declaredInterestMatch = (post.tags ?? []).some((tag) =>
    interests.has(normalizeTopic(tag))
  );

  // A topic someone explicitly chose counts in full; a topic they have merely
  // been reading counts in proportion. `max` rather than a sum means the
  // learned signal fills gaps in the declared one without ever contradicting
  // it, which matters because the declared list is the only thing a reader can
  // directly correct.
  const topicWeight = Math.max(
    declaredInterestMatch ? 1 : 0,
    getLearnedTopicWeight(post, ctx.affinity)
  );
  const authorAffinity = authorId
    ? unitWeight(ctx.affinity?.authors.get(authorId))
    : 0;

  let relevance = topicWeight * RELEVANCE_WEIGHTS.topic;
  relevance += authorAffinity * RELEVANCE_WEIGHTS.authorAffinity;
  if (authorId && ctx.followedIds.has(authorId)) {
    relevance += RELEVANCE_WEIGHTS.followedAuthor;
  }
  if (
    ctx.userUniversity?.trim() &&
    authorUniversity &&
    ctx.userUniversity.trim().toLocaleLowerCase("en") ===
      authorUniversity.toLocaleLowerCase("en")
  ) {
    relevance += RELEVANCE_WEIGHTS.sameUniversity;
  }

  return Math.min(1, relevance);
}

/**
 * The correction for having shown someone the same thing already.
 *
 * Without it the ranking is a pure function of the post, so the same cards sit
 * at the top of the feed on Monday that sat there on Sunday, including the ones
 * the reader looked at and decided against. A site that publishes every day
 * still looks asleep.
 *
 * Returns 1 for anyone we have no history for, which is every signed-out
 * reader and every post nobody has been shown yet.
 */
function getFatigue(post: RankablePost, ctx: RankingContext): number {
  const history = ctx.viewerEngagement?.get(post.id);
  if (!history) return 1;

  const repeats = nonNegativeFinite(history.impressions);
  const decay = Math.pow(REPEAT_IMPRESSION_DECAY, repeats);
  const alreadyRead = history.hasRead ? ALREADY_READ_FATIGUE : 1;

  // Floored rather than zeroed: on a feed with thin inventory, demoting is
  // right and disappearing is not. A post the reader has exhausted should end
  // up beneath fresh work, not beneath nothing.
  return Math.max(MIN_FATIGUE, decay * alreadyRead);
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
 *
 * Fatigue applies as a multiplier on the finished sum rather than as a sixth
 * feature. A feature would have to be weighted against the others and could
 * drag a score negative; a multiplier in (0, 1] keeps the range intact and
 * expresses the real relationship, which is that having already seen something
 * discounts whatever it was otherwise worth to you.
 */
export function scorePost(post: RankablePost, ctx: RankingContext): number {
  const impressions = nonNegativeFinite(post.impression_count);
  const relevance = getRelevance(post, ctx);
  const satisfaction = getSatisfaction(post, impressions);
  const evidence = getEvidence(post);
  const freshness = getFreshness(post);
  const discovery = getDiscoveryValue(impressions);

  const merit =
    relevance * 0.3 +
    satisfaction * 0.25 +
    evidence * 0.2 +
    freshness * 0.15 +
    discovery * 0.1;

  return 100 * merit * getFatigue(post, ctx);
}

/**
 * A ranking context for surfaces with no particular reader: the daily digest,
 * admin analytics, anything shared by everyone. Relevance and fatigue both come
 * out at their neutral values, so what is left is the part of the score that is
 * a property of the work rather than of the audience.
 *
 * A factory rather than a shared constant, because the context holds a Set and
 * a module-level one could be mutated by any caller.
 */
export function createAnonymousRankingContext(): RankingContext {
  return {
    userId: null,
    followedIds: new Set(),
    userInterests: [],
    userUniversity: null,
    userCountry: null,
  };
}

/**
 * The same scorer, for callers holding a database row rather than a feed card.
 * Everything a card requires but a row does not carry gets a neutral default,
 * so no call site has to invent a title or an excerpt just to ask how good
 * something is.
 */
export type ScorableCandidate = Partial<RankablePost> &
  Pick<RankablePost, "id">;

export function scoreCandidate(
  candidate: ScorableCandidate,
  ctx: RankingContext
): number {
  return scorePost(
    {
      title: null,
      slug: "",
      excerpt: null,
      type: "blog",
      tags: null,
      created_at: candidate.published_at ?? new Date(0).toISOString(),
      published_at: null,
      ...candidate,
      profiles: candidate.profiles ?? null,
    },
    ctx
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

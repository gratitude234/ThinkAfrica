import type { PostCardData } from "@/components/post/PostCard";

export interface RankingContext {
  userId: string | null;
  followedIds: Set<string>;
  userInterests: string[];
  userUniversity: string | null;
  userCountry: string | null;
}

export const TYPE_WEIGHT: Record<string, number> = {
  research: 3.0,
  policy_brief: 2.5,
  essay: 2.0,
  blog: 1.0,
};

export const GRAVITY = 1.8;
export const AFFINITY_CAP = 4.0;

interface RankablePost extends PostCardData {
  author_id?: string;
  impression_count?: number;
  read_count?: number;
  bookmark_count?: number;
  comment_count?: number;
  reference_count?: number;
  response_count?: number;
  quality_score?: number;
}

export function scorePost(post: RankablePost, ctx: RankingContext): number {
  const impressions = post.impression_count ?? 0;
  const views = post.view_count ?? 0;
  const reads = post.read_count ?? 0;
  const likes = post.like_count ?? 0;
  const comments = post.comment_count ?? 0;
  const bookmarks = post.bookmark_count ?? 0;
  const references = post.reference_count ?? 0;
  const responses = post.response_count ?? 0;
  const helperQuality = post.quality_score ?? 0;
  const quality =
    0.2 * impressions +
    views +
    3 * reads +
    5 * likes +
    10 * comments +
    15 * bookmarks +
    18 * references +
    16 * responses +
    helperQuality;

  const typeWeight = TYPE_WEIGHT[post.type] ?? 1.0;

  let affinity = 1.0;
  const authorId = post.author_id ?? "";
  const authorUniversity = post.profiles?.university ?? null;

  if (authorId && ctx.followedIds.has(authorId)) affinity *= 2.0;
  if (
    ctx.userUniversity &&
    authorUniversity &&
    ctx.userUniversity === authorUniversity
  ) {
    affinity *= 1.5;
  }
  if (post.profiles?.verified) affinity *= 1.2;
  if (post.tags && ctx.userInterests.length > 0) {
    const overlap = post.tags.some((tag) => ctx.userInterests.includes(tag));
    if (overlap) affinity *= 1.3;
  }

  affinity = Math.min(affinity, AFFINITY_CAP);

  const publishedAt = post.published_at ?? post.created_at;
  const ageMs = Date.now() - new Date(publishedAt).getTime();
  const ageHours = Math.max(0, ageMs / (1000 * 60 * 60));
  const denominator = Math.pow(ageHours + 2, GRAVITY);

  return quality === 0 ? 0 : (quality * typeWeight * affinity) / denominator;
}

export function rankPosts<T extends RankablePost>(
  posts: T[],
  ctx: RankingContext
): T[] {
  return [...posts]
    .map((post) => ({ post, score: scorePost(post, ctx) }))
    .sort((left, right) => right.score - left.score)
    .map(({ post, score }) => ({
      ...post,
      score,
    }));
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getQualityScore } from "@/lib/postQuality";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";

export interface DailyBriefProfile {
  username: string | null;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  verified?: boolean;
}

export interface FeaturedPostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  excerpt: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  view_count: number | null;
  impression_count: number | null;
  read_count: number | null;
  featured?: boolean | null;
  published_at: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  document_original_name: string | null;
  document_mime_type: string | null;
  document_size_bytes: number | null;
  profiles: DailyBriefProfile | DailyBriefProfile[] | null;
}

interface HotDebateRow {
  id: string;
  title: string;
  status: string;
  ends_at: string | null;
  motion_for_count: number | null;
  motion_against_count: number | null;
  debate_arguments: { count: number }[] | { count: number } | null;
}

export const FEATURED_POST_SELECT = `
  id, author_id, title, slug, type, content_kind, article_format, excerpt, tags, cover_image_url, view_count, impression_count, read_count, featured, published_at, citation_id, published_version_id, document_original_name, document_mime_type, document_size_bytes,
  profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified)
`;

const FEATURED_FALLBACK_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export function uniqueFeaturedPosts<T extends { id: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

/**
 * Same three queries the homepage banner uses to source a featured post:
 * an editor-manual pick, a pool of recent high-view candidates, and a
 * latest-published fallback. Shared so the homepage and the daily-brief
 * cron read from one definition instead of two.
 */
export async function getFeaturedPostCandidates(supabase: SupabaseClient) {
  const featuredFallbackCutoff = new Date(
    Date.now() - FEATURED_FALLBACK_WINDOW_MS
  ).toISOString();

  const [manualFeaturedResult, recentFeaturedCandidatesResult, latestPublishedResult] =
    await Promise.all([
      supabase
        .from("posts")
        .select(FEATURED_POST_SELECT)
        .eq("status", "published")
        .eq("featured", true)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("posts")
        .select(FEATURED_POST_SELECT)
        .eq("status", "published")
        .gte("published_at", featuredFallbackCutoff)
        .order("view_count", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(12),

      supabase
        .from("posts")
        .select(FEATURED_POST_SELECT)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  return { manualFeaturedResult, recentFeaturedCandidatesResult, latestPublishedResult };
}

export function getActiveDebate(supabase: SupabaseClient) {
  return supabase
    .from("debates")
    .select(
      "id, title, status, ends_at, motion_for_count, motion_against_count, debate_arguments(count)"
    )
    .in("status", ["open", "active"])
    .order("status", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
}

export function toDebateInterludeData(
  hotDebateRaw: HotDebateRow | null | undefined
): DebateInterludeData | null {
  if (!hotDebateRaw) return null;

  const argumentCount = hotDebateRaw.debate_arguments
    ? Array.isArray(hotDebateRaw.debate_arguments)
      ? ((hotDebateRaw.debate_arguments[0] as unknown as { count: number } | undefined)
          ?.count ?? 0)
      : 0
    : 0;

  return {
    id: hotDebateRaw.id,
    title: hotDebateRaw.title,
    status: hotDebateRaw.status,
    endsAt: hotDebateRaw.ends_at,
    argumentCount,
    motionForCount: hotDebateRaw.motion_for_count ?? 0,
    motionAgainstCount: hotDebateRaw.motion_against_count ?? 0,
  };
}

export interface EngagementCounts {
  referenceCounts: Record<string, number>;
  commentCounts: Record<string, number>;
  bookmarkCounts: Record<string, number>;
  responseCounts: Record<string, number>;
}

function countBy(rows: Array<Record<string, string | null>>, key: string) {
  return rows.reduce((acc: Record<string, number>, row) => {
    const id = row[key];
    if (id) acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});
}

export async function getEngagementCounts(
  supabase: SupabaseClient,
  featuredIds: string[]
): Promise<EngagementCounts> {
  if (featuredIds.length === 0) {
    return { referenceCounts: {}, commentCounts: {}, bookmarkCounts: {}, responseCounts: {} };
  }

  const [{ data: references }, { data: comments }, { data: bookmarks }, { data: responses }] =
    await Promise.all([
      supabase.from("post_references").select("post_id").in("post_id", featuredIds),
      supabase.from("comments").select("post_id").in("post_id", featuredIds),
      supabase.from("bookmarks").select("post_id").in("post_id", featuredIds),
      supabase.from("posts").select("in_response_to").in("in_response_to", featuredIds),
    ]);

  return {
    referenceCounts: countBy(
      (references ?? []) as Array<Record<string, string | null>>,
      "post_id"
    ),
    commentCounts: countBy((comments ?? []) as Array<Record<string, string | null>>, "post_id"),
    bookmarkCounts: countBy(
      (bookmarks ?? []) as Array<Record<string, string | null>>,
      "post_id"
    ),
    responseCounts: countBy(
      (responses ?? []) as Array<Record<string, string | null>>,
      "in_response_to"
    ),
  };
}

export function normalizeFeaturedPost(post: FeaturedPostRow) {
  return {
    ...post,
    profiles: Array.isArray(post.profiles) ? (post.profiles[0] ?? null) : post.profiles,
  };
}

export interface DailyBriefContent {
  featuredPost: { id: string; title: string; slug: string } | null;
  activeDebate: DebateInterludeData | null;
}

/**
 * Standalone, de-personalized version of the homepage's featured-post pick.
 * Unlike app/(main)/page.tsx's ranking, this does not weight interestMatch
 * or followedAuthor — there is no requesting user, and the daily brief push
 * sends identical content to every recipient. Callable without a session
 * (pass an admin client) for cron use.
 */
export async function getDailyBriefContent(
  supabase: SupabaseClient
): Promise<DailyBriefContent> {
  const [{ manualFeaturedResult, recentFeaturedCandidatesResult, latestPublishedResult }, hotDebateResult] =
    await Promise.all([getFeaturedPostCandidates(supabase), getActiveDebate(supabase)]);

  const manualFeaturedRaw = (manualFeaturedResult.data as FeaturedPostRow | null) ?? null;
  const latestPublishedRaw = (latestPublishedResult.data as FeaturedPostRow | null) ?? null;
  const recentFeaturedCandidatesRaw = (recentFeaturedCandidatesResult.data ??
    []) as FeaturedPostRow[];

  const featuredPostsRaw = uniqueFeaturedPosts([
    ...(manualFeaturedRaw ? [manualFeaturedRaw] : []),
    ...recentFeaturedCandidatesRaw,
    ...(latestPublishedRaw ? [latestPublishedRaw] : []),
  ]).map(normalizeFeaturedPost);

  const featuredIds = featuredPostsRaw.map((post) => post.id);
  const engagementCounts = await getEngagementCounts(supabase, featuredIds);

  const ranked = featuredPostsRaw
    .map((post) => ({
      ...post,
      quality_score: getQualityScore({
        type: post.type,
        citationId: post.citation_id,
        publishedVersionId: post.published_version_id,
        referenceCount: engagementCounts.referenceCounts[post.id] ?? 0,
        responseCount: engagementCounts.responseCounts[post.id] ?? 0,
        commentCount: engagementCounts.commentCounts[post.id] ?? 0,
        bookmarkCount: engagementCounts.bookmarkCounts[post.id] ?? 0,
        viewCount: post.view_count,
        publishedAt: post.published_at,
        tags: post.tags,
        author: post.profiles,
      }),
    }))
    .sort((left, right) => right.quality_score - left.quality_score);

  const manualFeaturedPost = ranked.find((post) => post.id === manualFeaturedRaw?.id);
  const automaticFeaturedPost =
    ranked.find((post) => post.id !== manualFeaturedPost?.id) ?? null;
  const featuredPost = manualFeaturedPost ?? automaticFeaturedPost;

  const hotDebateRaw = (hotDebateResult.data as HotDebateRow | null) ?? null;

  return {
    featuredPost: featuredPost
      ? {
          id: featuredPost.id,
          title: getPostMetadataTitle(featuredPost, featuredPost.profiles),
          slug: featuredPost.slug,
        }
      : null,
    activeDebate: toDebateInterludeData(hotDebateRaw),
  };
}

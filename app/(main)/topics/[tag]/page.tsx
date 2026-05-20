import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostCardImpression from "@/components/post/PostCardImpression";
import Link from "next/link";
import { getCountsByPostId } from "@/lib/feedData";
import {
  getFeedSurfaceReason,
  getPublicQualitySignals,
} from "@/lib/postQuality";

interface PageProps {
  params: Promise<{ tag: string }>;
}

export default async function TopicPage({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const supabase = await createClient();

  // Fetch posts with this tag
  const { data: postsRaw } = await supabase
    .from("posts")
    .select(`
      id, author_id, title, slug, in_response_to, excerpt, type, tags, created_at, published_at, view_count, cover_image_url, citation_id, published_version_id,
      profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type),
      post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))
    `)
    .eq("status", "published")
    .contains("tags", [decodedTag])
    .order("view_count", { ascending: false });

  if (!postsRaw) notFound();

  const postIds = postsRaw.map((post) => post.id);
  const [commentCounts, bookmarkCounts, referenceCounts, responseRows] =
    postIds.length > 0
      ? await Promise.all([
          getCountsByPostId(supabase, "comments", postIds),
          getCountsByPostId(supabase, "bookmarks", postIds),
          getCountsByPostId(supabase, "post_references", postIds),
          supabase.from("posts").select("in_response_to").in("in_response_to", postIds),
        ])
      : [
          {} as Record<string, number>,
          {} as Record<string, number>,
          {} as Record<string, number>,
          { data: [] as Array<{ in_response_to?: string | null }> },
        ];
  const responseCounts = ((responseRows.data ?? []) as Array<{
    in_response_to?: string | null;
  }>).reduce((acc: Record<string, number>, row) => {
    if (row.in_response_to) acc[row.in_response_to] = (acc[row.in_response_to] ?? 0) + 1;
    return acc;
  }, {});

  const posts = postsRaw.map((p) => {
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    const qualityInput = {
      type: p.type,
      citationId: (p as { citation_id?: string | null }).citation_id ?? null,
      publishedVersionId:
        (p as { published_version_id?: string | null }).published_version_id ?? null,
      referenceCount: referenceCounts[p.id] ?? 0,
      responseCount: responseCounts[p.id] ?? 0,
      commentCount: commentCounts[p.id] ?? 0,
      bookmarkCount: bookmarkCounts[p.id] ?? 0,
      viewCount: p.view_count,
      publishedAt: p.published_at,
      createdAt: p.created_at,
      tags: p.tags,
      author: profile,
      interestMatch: true,
    };
    const qualitySignals = getPublicQualitySignals(qualityInput);

    return {
    ...p,
    profiles: profile,
    comment_count: commentCounts[p.id] ?? 0,
    bookmark_count: bookmarkCounts[p.id] ?? 0,
    reference_count: referenceCounts[p.id] ?? 0,
    response_count: responseCounts[p.id] ?? 0,
    quality_badges: qualitySignals.badges,
    quality_score: qualitySignals.score,
    surface_reason: getFeedSurfaceReason(qualityInput),
    co_authors: Array.isArray((p as { post_authors?: unknown[] }).post_authors)
      ? ((p as { post_authors?: Array<Record<string, unknown>> }).post_authors ?? [])
          .filter((row) => !!row.accepted_at)
          .filter((row) => row.user_id !== (p as { author_id?: string }).author_id)
          .map((row) => ({
            user_id: row.user_id as string,
            profile: Array.isArray(row.profile)
              ? (row.profile[0] as { username: string; full_name: string | null })
              : (row.profile as { username: string; full_name: string | null }),
          }))
      : [],
    };
  });

  // Top contributors for this tag
  const contributorMap = new Map<string, { full_name: string; username: string; count: number }>();
  for (const post of posts) {
    if (post.profiles) {
      const key = post.profiles.username;
      const existing = contributorMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        contributorMap.set(key, {
          full_name: post.profiles.full_name,
          username: post.profiles.username,
          count: 1,
        });
      }
    }
  }
  const topContributors = Array.from(contributorMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);
  const sourceBackedCount = posts.filter((post) => (post.reference_count ?? 0) > 0).length;
  const citableCount = posts.filter(
    (post) =>
      Boolean((post as { citation_id?: string | null }).citation_id) ||
      Boolean((post as { published_version_id?: string | null }).published_version_id)
  ).length;
  const activeConversationPosts = posts
    .filter((post) => (post.response_count ?? 0) > 0 || (post.comment_count ?? 0) > 0)
    .sort(
      (left, right) =>
        (right.response_count ?? 0) +
        (right.comment_count ?? 0) -
        ((left.response_count ?? 0) + (left.comment_count ?? 0))
    )
    .slice(0, 3);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">Topic</p>
            <h1 className="text-3xl font-bold text-gray-900">#{decodedTag}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {posts.length} post{posts.length !== 1 ? "s" : ""} /{" "}
              {sourceBackedCount} source-backed / {citableCount} citable
            </p>
          </div>
          <Link
            href={`/write?type=blog&starter=1&tag=${encodeURIComponent(decodedTag)}`}
            className="w-fit rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600"
          >
            Write about #{decodedTag}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Posts */}
        <div className="lg:col-span-2 space-y-4">
          {posts.length === 0 ? (
            <div className="text-center py-16 text-gray-500 bg-white rounded-xl border border-gray-200">
              <p>No posts with this tag yet.</p>
              <Link href="/write" className="text-emerald-brand text-sm mt-2 inline-block hover:underline">
                Write about {decodedTag}
              </Link>
            </div>
          ) : (
            posts.map((post) => (
              <PostCardImpression
                key={post.id}
                currentUserId={null}
                post={{
                  id: post.id,
                  title: post.title,
                  slug: post.slug,
                  in_response_to:
                    (post as { in_response_to?: string | null }).in_response_to ?? null,
                  excerpt: post.excerpt,
                  type: post.type,
                  tags: post.tags,
                  created_at: post.created_at,
                  published_at: post.published_at,
                  view_count: post.view_count,
                  citation_id:
                    (post as { citation_id?: string | null }).citation_id ?? null,
                  published_version_id:
                    (post as { published_version_id?: string | null })
                      .published_version_id ?? null,
                  cover_image_url:
                    (post as { cover_image_url?: string | null })
                      .cover_image_url ?? null,
                  comment_count:
                    (post as { comment_count?: number }).comment_count ?? 0,
                  bookmark_count:
                    (post as { bookmark_count?: number }).bookmark_count ?? 0,
                  reference_count:
                    (post as { reference_count?: number }).reference_count ?? 0,
                  response_count:
                    (post as { response_count?: number }).response_count ?? 0,
                  quality_score:
                    (post as { quality_score?: number }).quality_score ?? 0,
                  quality_badges:
                    (post as {
                      quality_badges?: Array<{
                        key: string;
                        label: string;
                        tone: "emerald" | "sky" | "purple" | "amber" | "gray";
                      }>;
                    }).quality_badges ?? [],
                  surface_reason:
                    (post as { surface_reason?: string | null }).surface_reason ?? null,
                  co_authors:
                    (post as {
                      co_authors?: Array<{
                        user_id: string;
                        profile: { username: string; full_name: string | null } | null;
                      }>;
                    }).co_authors ?? [],
                  profiles: post.profiles as {
                    username: string;
                    full_name: string | null;
                    university: string | null;
                    avatar_url: string | null;
                    verified?: boolean;
                    verified_type?: string | null;
                  } | null,
                }}
              />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {activeConversationPosts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">
                Active Conversations
              </h3>
              <div className="space-y-3">
                {activeConversationPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.slug}`}
                    className="block rounded-lg bg-canvas p-3 hover:bg-[#F5F3EE]"
                  >
                    <p className="line-clamp-2 text-sm font-semibold text-gray-900">
                      {post.title}
                    </p>
                    <p className="mt-1 text-xs text-gray-500">
                      {post.response_count ?? 0} responses / {post.comment_count ?? 0} comments
                    </p>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {topContributors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">Top Contributors</h3>
              <div className="space-y-3">
                {topContributors.map((c, i) => (
                  <Link
                    key={c.username}
                    href={`/${c.username}`}
                    className="flex items-center gap-3 group"
                  >
                    <span className="text-xs text-gray-500 font-medium w-4">
                      {i + 1}
                    </span>
                    <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                      {c.full_name?.charAt(0)?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 group-hover:text-emerald-brand transition-colors truncate">
                        {c.full_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.count} post{c.count !== 1 ? "s" : ""}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

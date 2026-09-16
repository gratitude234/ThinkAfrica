import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PostCardImpression from "@/components/post/PostCardImpression";
import Link from "next/link";
import { getVisibleCommentCountsByPostId } from "@/lib/postCounts";
import type { PostCardData } from "@/components/post/PostCard";

interface PageProps {
  params: Promise<{ tag: string }>;
}

type TopicPostProfile = NonNullable<PostCardData["profiles"]>;

/**
 * Every publication under one topic.
 *
 * The cards used to carry quality badges, a "why surfaced" reason, a quality
 * score, co-author credits and a source-backed count, all computed here with
 * the feed's retired scorer. The publishing reset, Phase 2F, removed them with
 * the systems they described, and the extra count queries that fed them.
 */
export default async function TopicPage({ params }: PageProps) {
  const { tag } = await params;
  const decodedTag = decodeURIComponent(tag);
  const supabase = await createClient();

  const [
    { data: postsRaw },
    {
      data: { user },
    },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(`
      id, author_id, title, slug, excerpt, content_kind, tags, created_at, published_at, view_count, impression_count, read_count, word_count, cover_image_url,
      profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified, verified_type)
    `)
      .eq("status", "published")
      .contains("tags", [decodedTag])
      .order("view_count", { ascending: false }),
    supabase.auth.getUser(),
  ]);

  if (!postsRaw) notFound();

  const postIds = postsRaw.map((post) => post.id);
  let commentCounts: Record<string, number> = {};
  if (postIds.length > 0) {
    try {
      commentCounts = await getVisibleCommentCountsByPostId(supabase, postIds);
    } catch (error) {
      // Comment totals are card decoration, not the topic page itself. Keep the
      // publications visible during a transient Data API failure and render a
      // conservative zero rather than turning the whole topic into an error.
      console.warn("[topic] comment counts unavailable; rendering zero counts", error);
    }
  }

  const posts: PostCardData[] = postsRaw.map((row) => {
    const profile = (Array.isArray(row.profiles) ? row.profiles[0] : row.profiles) as
      | TopicPostProfile
      | null
      | undefined;
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      excerpt: row.excerpt,
      content_kind: row.content_kind ?? null,
      tags: row.tags,
      created_at: row.created_at,
      published_at: row.published_at,
      view_count: row.view_count,
      impression_count: row.impression_count ?? null,
      read_count: row.read_count ?? null,
      word_count: row.word_count ?? null,
      cover_image_url: row.cover_image_url ?? null,
      comment_count: commentCounts[row.id] ?? 0,
      profiles: profile ?? null,
    };
  });

  // The writers with the most publications under this tag. A list, not a
  // ranking: nothing here is numbered or scored.
  const contributorMap = new Map<string, { full_name: string | null; username: string; count: number }>();
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

  return (
    <div className="max-w-4xl mx-auto">
      {/* Hero */}
      <div className="mb-8 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm text-gray-500 mb-1">Topic</p>
            <h1 className="text-3xl font-bold text-gray-900">#{decodedTag}</h1>
            <p className="text-gray-500 text-sm mt-1">
              {posts.length} post{posts.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/write?starter=1&tag=${encodeURIComponent(decodedTag)}`}
              className="w-fit rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white hover:bg-[#0E4B37]"
            >
              Write about #{decodedTag}
            </Link>
          </div>
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
                currentUserId={user?.id ?? null}
                surface="topic"
                post={post}
              />
            ))
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {topContributors.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm">Writers on this topic</h3>
              <div className="space-y-3">
                {topContributors.map((c) => (
                  <Link
                    key={c.username}
                    href={`/${c.username}`}
                    className="flex items-center gap-3 group"
                  >
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

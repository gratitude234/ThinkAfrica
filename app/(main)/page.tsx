import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import PostFeed from "@/components/post/PostFeed";
import type { PostCardData } from "@/components/post/PostCard";
import { formatDate } from "@/lib/utils";

export const revalidate = 60;

export default async function HomePage() {
  const supabase = await createClient();

  // Main feed
  const { data: posts, error } = await supabase
    .from("posts")
    .select(
      `id, title, slug, excerpt, type, tags, created_at, published_at,
      profiles!posts_author_id_fkey (username, full_name, university, avatar_url)`
    )
    .eq("status", "published")
    .order("published_at", { ascending: false });

  // Like counts
  const postIds = posts?.map((p) => p.id) ?? [];
  let likeCounts: Record<string, number> = {};
  if (postIds.length > 0) {
    const { data: likes } = await supabase
      .from("likes")
      .select("post_id")
      .in("post_id", postIds);
    if (likes) {
      likeCounts = likes.reduce(
        (acc, like) => {
          acc[like.post_id] = (acc[like.post_id] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );
    }
  }

  const feedPosts: PostCardData[] = (posts ?? []).map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] : post.profiles,
    like_count: likeCounts[post.id] ?? 0,
  }));

  // Sidebar: trending posts (last 7 days by view_count)
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: trendingPosts } = await supabase
    .from("posts")
    .select(
      "id, title, slug, view_count, type, profiles!posts_author_id_fkey(username, full_name)"
    )
    .eq("status", "published")
    .gte("published_at", weekAgo)
    .order("view_count", { ascending: false })
    .limit(5);

  // Sidebar: active debates
  const { data: activeDebates } = await supabase
    .from("debates")
    .select("id, title, status, debate_arguments(count)")
    .in("status", ["open", "active"])
    .order("created_at", { ascending: false })
    .limit(3);

  // Sidebar: top contributors this week
  const { data: weeklyPosts } = await supabase
    .from("posts")
    .select(
      "author_id, profiles!posts_author_id_fkey(id, username, full_name, avatar_url, points)"
    )
    .eq("status", "published")
    .gte("published_at", weekAgo);

  // Aggregate weekly contributors
  const contributorMap: Record<
    string,
    {
      id: string;
      username: string;
      full_name: string | null;
      points: number;
      post_count: number;
    }
  > = {};
  for (const p of weeklyPosts ?? []) {
    const profile = Array.isArray(p.profiles) ? p.profiles[0] : p.profiles;
    if (!profile) continue;
    if (!contributorMap[profile.id]) {
      contributorMap[profile.id] = { ...profile, post_count: 0 };
    }
    contributorMap[profile.id].post_count++;
  }
  const topContributors = Object.values(contributorMap)
    .sort((a, b) => b.points - a.points)
    .slice(0, 3);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Main feed */}
      <div className="lg:col-span-2">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Ideas from across Africa
          </h1>
          <p className="text-gray-500">
            Research, essays, and policy briefs from African university students.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-6">
            Failed to load posts. Please try again.
          </div>
        )}

        <PostFeed posts={feedPosts} />
      </div>

      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-6 lg:sticky lg:top-24 self-start">
        {/* Trending This Week */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <span className="text-base">🔥</span> Trending This Week
          </h2>
          {!trendingPosts || trendingPosts.length === 0 ? (
            <p className="text-xs text-gray-400">No posts this week yet.</p>
          ) : (
            <ol className="space-y-3">
              {trendingPosts.map((post, i) => {
                const author = Array.isArray(post.profiles)
                  ? post.profiles[0]
                  : post.profiles;
                return (
                  <li key={post.id} className="flex items-start gap-3">
                    <span className="text-xs font-bold text-gray-300 w-5 flex-shrink-0 mt-0.5">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <Link
                        href={`/post/${post.slug}`}
                        className="text-sm font-medium text-gray-800 hover:text-emerald-brand transition-colors line-clamp-2 leading-snug"
                      >
                        {post.title}
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {post.view_count ?? 0} views
                        {author && ` · ${author.full_name ?? author.username}`}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Active Debates */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-base">⚡</span> Active Debates
            </h2>
            <Link
              href="/debates"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              View all →
            </Link>
          </div>
          {!activeDebates || activeDebates.length === 0 ? (
            <p className="text-xs text-gray-400">No active debates yet.</p>
          ) : (
            <div className="space-y-3">
              {activeDebates.map((debate) => {
                const argCount = Array.isArray(debate.debate_arguments)
                  ? (debate.debate_arguments[0] as unknown as { count: number })
                      ?.count ?? 0
                  : 0;
                return (
                  <Link
                    key={debate.id}
                    href={`/debates/${debate.id}`}
                    className="block group"
                  >
                    <p className="text-sm font-medium text-gray-800 group-hover:text-emerald-brand transition-colors line-clamp-2 leading-snug">
                      {debate.title}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {argCount} {argCount === 1 ? "argument" : "arguments"}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* Top Contributors */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-base">🏆</span> Top Contributors
            </h2>
            <Link
              href="/leaderboard"
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
            >
              Leaderboard →
            </Link>
          </div>
          {topContributors.length === 0 ? (
            <p className="text-xs text-gray-400">
              No contributors this week yet.
            </p>
          ) : (
            <div className="space-y-3">
              {topContributors.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/${c.username}`}
                  className="flex items-center gap-3 group"
                >
                  <span className="text-sm w-4 flex-shrink-0 text-gray-300 font-bold">
                    {i + 1}
                  </span>
                  <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                    {c.full_name?.charAt(0)?.toUpperCase() ??
                      c.username?.charAt(0)?.toUpperCase() ??
                      "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 group-hover:text-emerald-brand transition-colors truncate">
                      {c.full_name ?? c.username}
                    </p>
                    <p className="text-xs text-emerald-brand font-semibold">
                      {c.points} pts
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

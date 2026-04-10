import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ActivationBanner from "@/components/ui/ActivationBanner";
import FeaturedPostBanner from "@/components/post/FeaturedPostBanner";
import DailyBrief from "@/components/ui/DailyBrief";
import SuggestedPeople from "@/components/ui/SuggestedPeople";
import MobileSidebarStrip from "./MobileSidebarStrip";
import PostsFeedSection from "./PostsFeedSection";

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{ guest?: string; tab?: string }>;
}

function FeedSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="h-5 w-16 bg-gray-200 rounded-full" />
            <div className="h-4 w-24 bg-gray-100 rounded" />
          </div>
          <div className="h-5 w-4/5 bg-gray-200 rounded" />
          <div className="h-4 w-full bg-gray-100 rounded" />
          <div className="h-4 w-3/4 bg-gray-100 rounded" />
          <div className="flex items-center gap-3 pt-1">
            <div className="h-7 w-7 rounded-full bg-gray-200" />
            <div className="h-3 w-32 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default async function HomePage({ searchParams }: PageProps) {
  const { guest, tab } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && guest !== "1") {
    redirect("/landing");
  }

  // Fetch user profile (interests, points, university, field_of_study)
  let userInterests: string[] = [];
  let userPoints = 0;
  let userUniversity: string | null = null;
  let userFieldOfStudy: string | null = null;
  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("interests, points, university, field_of_study")
      .eq("id", user.id)
      .single();
    userInterests = (profileData?.interests as string[] | null) ?? [];
    userPoints = profileData?.points ?? 0;
    userUniversity = profileData?.university ?? null;
    userFieldOfStudy = profileData?.field_of_study ?? null;
  }

  // Activation counts + featured post — fast parallel block
  const [
    { count: publishedCount },
    { data: followedUsers },
    { count: debateCount },
    { data: featuredPostRaw },
  ] = await Promise.all([
    user
      ? supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("author_id", user.id)
          .eq("status", "published")
      : Promise.resolve({ count: 0, data: null, error: null }),

    user
      ? supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
      : Promise.resolve({ count: 0, data: [], error: null }),

    user
      ? supabase
          .from("debate_arguments")
          .select("*", { count: "exact", head: true })
          .eq("author_id", user.id)
      : Promise.resolve({ count: 0, data: null, error: null }),

    supabase
      .from("posts")
      .select(
        `id, title, slug, excerpt, type, published_at, created_at,
        profiles!posts_author_id_fkey (username, full_name, university, avatar_url)`
      )
      .eq("status", "published")
      .eq("featured", true)
      .maybeSingle(),
  ]);

  const featuredPost = featuredPostRaw
    ? {
        ...featuredPostRaw,
        profiles: Array.isArray(featuredPostRaw.profiles)
          ? featuredPostRaw.profiles[0]
          : featuredPostRaw.profiles,
      }
    : null;

  const followedIds = (followedUsers ?? []).map(
    (f: { following_id: string }) => f.following_id
  );
  const followCount = followedIds.length;

  // Sidebar queries — run in parallel
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [
    { data: trendingPosts },
    { data: activeDebates },
    { data: weeklyPosts },
  ] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, title, slug, view_count, type, profiles!posts_author_id_fkey(username, full_name)"
      )
      .eq("status", "published")
      .gte("published_at", weekAgo)
      .order("view_count", { ascending: false })
      .limit(5),

    supabase
      .from("debates")
      .select("id, title, status, debate_arguments(count)")
      .in("status", ["open", "active"])
      .order("created_at", { ascending: false })
      .limit(3),

    supabase
      .from("posts")
      .select(
        "author_id, profiles!posts_author_id_fkey(id, username, full_name, avatar_url, points)"
      )
      .eq("status", "published")
      .gte("published_at", weekAgo),
  ]);

  const contributorMap: Record<
    string,
    { id: string; username: string; full_name: string | null; points: number; post_count: number }
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
      {/* Mobile sidebar strip */}
      <div className="lg:col-span-3">
        <MobileSidebarStrip
          trendingPosts={(trendingPosts ?? []).map((p) => ({
            id: p.id,
            title: p.title,
            slug: p.slug,
            view_count: p.view_count ?? null,
          }))}
          activeDebates={activeDebates ?? []}
          topContributors={topContributors}
        />
      </div>

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

        {featuredPost && <FeaturedPostBanner post={featuredPost} />}

        {user && (
          <ActivationBanner
            userId={user.id}
            hasPublished={(publishedCount ?? 0) > 0}
            hasFollowed={followCount > 0}
            hasDebated={(debateCount ?? 0) > 0}
          />
        )}

        {user && <DailyBrief userId={user.id} points={userPoints} />}

        {/* Feed streams in independently — shell above renders immediately */}
        <Suspense fallback={<FeedSkeleton />}>
          <PostsFeedSection
            tab={tab ?? "latest"}
            userId={user?.id ?? null}
            userInterests={userInterests}
            followedIds={followedIds}
            showForYouEligible={userInterests.length > 0}
            showFollowingEligible={followedIds.length > 0}
          />
        </Suspense>
      </div>

      {/* Sidebar */}
      <div className="hidden lg:block lg:col-span-1 space-y-6 lg:sticky lg:top-24 self-start">
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
            <p className="text-xs text-gray-400">No contributors this week yet.</p>
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

        {user && (
          <SuggestedPeople
            currentUserId={user.id}
            university={userUniversity}
            fieldOfStudy={userFieldOfStudy}
          />
        )}
      </div>
    </div>
  );
}

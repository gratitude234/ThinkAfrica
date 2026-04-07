import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import Badge from "@/components/ui/Badge";
import PointsTierBadge from "@/components/ui/PointsTierBadge";
import { formatDate, getPointTier, getNextTier } from "@/lib/utils";

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default async function StatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, points")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/onboarding");

  const { data: publishedPosts } = await supabase
    .from("posts")
    .select("id, title, slug, type, view_count, created_at, published_at")
    .eq("author_id", profile.id)
    .eq("status", "published")
    .order("view_count", { ascending: false });

  const theirPostIds = (publishedPosts ?? []).map((p) => p.id);
  const totalViews = (publishedPosts ?? []).reduce(
    (sum, p) => sum + (p.view_count ?? 0),
    0
  );

  const [{ data: likesData }, { count: followerCount }, { count: newFollowerCount }] =
    await Promise.all([
      theirPostIds.length > 0
        ? supabase.from("likes").select("post_id").in("post_id", theirPostIds)
        : Promise.resolve({ data: [] as { post_id: string }[] }),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profile.id),
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", profile.id)
        .gte("created_at", weekAgo),
    ]);

  const totalLikes = (likesData ?? []).length;
  const tier = getPointTier(profile.points);
  const nextTier = getNextTier(profile.points);
  const progressPercent = nextTier
    ? Math.min(
        100,
        Math.round(
          ((profile.points - tier.min) / (nextTier.min - tier.min)) * 100
        )
      )
    : 100;

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">My Stats</h1>
        <p className="text-gray-500 text-sm mt-1">
          How your content is performing
        </p>
      </div>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard label="Total Views" value={totalViews} />
        <StatCard label="Total Likes" value={totalLikes} />
        <StatCard label="Followers" value={followerCount ?? 0} />
        <StatCard
          label="New Followers"
          value={newFollowerCount ?? 0}
          sub={
            (newFollowerCount ?? 0) > 0
              ? `+${newFollowerCount} this week`
              : "this week"
          }
        />
      </div>

      {/* Top posts table */}
      {(publishedPosts ?? []).length > 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-8">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">
              Top Posts by Views
            </h2>
          </div>
          <div className="divide-y divide-gray-100">
            {(publishedPosts ?? []).slice(0, 10).map((post) => (
              <div key={post.id} className="flex items-center gap-4 px-6 py-3">
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/post/${post.slug}`}
                    className="text-sm font-medium text-gray-900 hover:text-emerald-brand transition-colors truncate block"
                  >
                    {post.title}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(post.published_at ?? post.created_at)}
                  </p>
                </div>
                <Badge type={post.type} />
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {(post.view_count ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-gray-400">views</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center mb-8">
          <p className="text-gray-400 text-sm">
            No published posts yet.{" "}
            <Link href="/write" className="text-emerald-brand font-medium hover:underline">
              Write your first post →
            </Link>
          </p>
        </div>
      )}

      {/* Points breakdown card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">
          Points &amp; Tier
        </h2>
        <div className="flex items-center gap-4 mb-4">
          <PointsTierBadge points={profile.points} showProgress={false} />
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {profile.points.toLocaleString()}
            </p>
            <p className="text-xs text-gray-400">total points</p>
          </div>
        </div>
        {nextTier ? (
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>
                {tier.name} ({tier.min}+ pts)
              </span>
              <span>
                {nextTier.name} ({nextTier.min}+ pts)
              </span>
            </div>
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">
              {nextTier.min - profile.points} more points to reach{" "}
              {nextTier.name}
            </p>
          </div>
        ) : (
          <p className="text-sm text-amber-600 font-medium">
            You&apos;ve reached the highest tier!
          </p>
        )}
      </div>
    </div>
  );
}

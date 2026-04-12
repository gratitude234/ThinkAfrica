import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SponsorBanner from "@/components/ui/SponsorBanner";
import PointsTierBadge from "@/components/ui/PointsTierBadge";
import { POST_POINTS } from "@/lib/utils";

export const revalidate = 120;

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { tab = "alltime" } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: sponsorRaw } = await supabase
    .from("sponsor_placements")
    .select("sponsor_name, content, link_url")
    .eq("placement_type", "leaderboard")
    .eq("active", true)
    .limit(1)
    .single();
  const sponsor = sponsorRaw ?? null;

  let profiles: {
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    avatar_url: string | null;
    points: number;
    weekly_points?: number;
  }[] = [];

  if (tab === "weekly") {
    const weekAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data: weeklyPosts } = await supabase
      .from("posts")
      .select(
        "author_id, type, profiles!posts_author_id_fkey(id, username, full_name, university, avatar_url, points)"
      )
      .eq("status", "published")
      .gte("published_at", weekAgo);

    const userMap: Record<
      string,
      (typeof profiles)[number] & { weekly_points: number }
    > = {};

    for (const post of weeklyPosts ?? []) {
      const profile = Array.isArray(post.profiles)
        ? post.profiles[0]
        : post.profiles;
      if (!profile) continue;
      const pts = POST_POINTS[post.type] ?? 10;
      if (!userMap[profile.id]) {
        userMap[profile.id] = { ...profile, weekly_points: 0 };
      }
      userMap[profile.id].weekly_points += pts;
    }

    profiles = Object.values(userMap)
      .sort((a, b) => b.weekly_points - a.weekly_points)
      .slice(0, 20);
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url, points")
      .order("points", { ascending: false })
      .limit(20);
    profiles = data ?? [];
  }

  // Fetch badge counts for displayed profiles
  const profileIds = profiles.map((p) => p.id);
  let badgeCounts: Record<string, number> = {};
  if (profileIds.length > 0) {
    const { data: userBadges } = await supabase
      .from("user_badges")
      .select("user_id")
      .in("user_id", profileIds);
    badgeCounts = (userBadges ?? []).reduce(
      (acc, ub) => {
        acc[ub.user_id] = (acc[ub.user_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  // TASK 7: "You Are Here" row — only for alltime tab
  const isUserInTop20 = user ? profiles.some((p) => p.id === user.id) : false;
  let currentUserRow: {
    profile: { id: string; username: string; full_name: string | null; university: string | null; avatar_url: string | null; points: number };
    rank: number;
  } | null = null;

  if (user && !isUserInTop20 && tab !== "weekly") {
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url, points")
      .eq("id", user.id)
      .single();

    if (currentUserProfile) {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .gt("points", currentUserProfile.points);

      currentUserRow = {
        profile: currentUserProfile,
        rank: (count ?? 0) + 1,
      };
    }
  }

  const tabs = [
    { label: "All Time", value: "alltime" },
    { label: "This Week", value: "weekly" },
  ];

  const RANK_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

  return (
    <div className="max-w-2xl mx-auto">
      <SponsorBanner placement={sponsor} />
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Top contributors on ThinkAfrica
        </p>
      </div>

      {/* Tabs — TASK 10: weekly active tab uses gold/amber */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
        {tabs.map((t) => {
          const active = tab === t.value;
          return (
            <Link
              key={t.value}
              href={`/leaderboard?tab=${t.value}`}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                active
                  ? t.value === "weekly"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {/* Rankings */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {profiles.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">
            {tab === "weekly"
              ? "No activity this week yet."
              : "No contributors yet."}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {profiles.map((profile, i) => {
              const rank = i + 1;
              const isCurrentUser = user?.id === profile.id;
              const displayPoints =
                tab === "weekly"
                  ? (profile.weekly_points ?? 0)
                  : profile.points;

              return (
                <div
                  key={profile.id}
                  className={`flex items-center gap-4 px-6 py-4 transition-colors ${
                    isCurrentUser ? "bg-emerald-50" : "hover:bg-gray-50"
                  }`}
                >
                  {/* Rank */}
                  <div
                    className={`w-8 text-center font-bold text-lg flex-shrink-0 ${
                      rank <= 3 ? RANK_COLORS[rank - 1] : "text-gray-300"
                    }`}
                  >
                    {rank <= 3 ? (
                      <span>
                        {rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">{rank}</span>
                    )}
                  </div>

                  {/* Avatar */}
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold flex-shrink-0">
                    {profile.full_name?.charAt(0)?.toUpperCase() ??
                      profile.username?.charAt(0)?.toUpperCase() ??
                      "?"}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/${profile.username}`}
                      className="text-sm font-semibold text-gray-900 hover:text-emerald-brand transition-colors"
                    >
                      {profile.full_name ?? profile.username}
                      {isCurrentUser && (
                        <span className="ml-2 text-xs font-normal text-emerald-600">
                          (you)
                        </span>
                      )}
                    </Link>
                    {profile.university && (
                      <p className="text-xs text-gray-400 truncate">
                        {profile.university}
                      </p>
                    )}
                  </div>

                  {/* Badges */}
                  <div className="text-xs text-gray-400 text-center flex-shrink-0">
                    <p className="font-medium text-gray-600">
                      {badgeCounts[profile.id] ?? 0}
                    </p>
                    <p>badges</p>
                  </div>

                  {/* Points */}
                  <div className="text-right flex-shrink-0">
                    <div className="flex items-center gap-1.5 justify-end">
                      <PointsTierBadge points={displayPoints} />
                      <p className="text-base font-bold text-emerald-brand">
                        {displayPoints.toLocaleString()}
                      </p>
                    </div>
                    <p className="text-xs text-gray-400">
                      {tab === "weekly" ? "pts this week" : "pts"}
                    </p>
                  </div>
                </div>
              );
            })}

            {/* TASK 7: "You Are Here" row */}
            {currentUserRow && (
              <>
                <div className="border-t-2 border-dashed border-gray-200 my-1" />
                <div className="flex items-center gap-4 px-6 py-4 bg-emerald-50">
                  <div className="w-8 text-center flex-shrink-0">
                    <span className="text-sm text-gray-400">
                      {currentUserRow.rank}
                    </span>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 font-bold flex-shrink-0">
                    {currentUserRow.profile.full_name?.charAt(0)?.toUpperCase() ??
                      currentUserRow.profile.username?.charAt(0)?.toUpperCase() ??
                      "?"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      You — #{currentUserRow.rank}
                    </p>
                    {currentUserRow.profile.university && (
                      <p className="text-xs text-gray-400 truncate">
                        {currentUserRow.profile.university}
                      </p>
                    )}
                  </div>
                  <div className="text-xs text-gray-400 text-center flex-shrink-0">
                    <p className="font-medium text-gray-600">
                      {badgeCounts[currentUserRow.profile.id] ?? 0}
                    </p>
                    <p>badges</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-base font-bold text-emerald-brand">
                      {currentUserRow.profile.points.toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-400">pts</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

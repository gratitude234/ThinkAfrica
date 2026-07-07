import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import SponsorBanner from "@/components/ui/SponsorBanner";
import PointsTierBadge from "@/components/ui/PointsTierBadge";
import { POST_POINTS, type PostType } from "@/lib/utils";

export const revalidate = 120;

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

interface LeaderboardProfile {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  points: number;
  weekly_points?: number;
}

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const { tab: tabParam } = await searchParams;
  const tab = tabParam === "alumni" ? "alumni" : "weekly";
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

  let profiles: LeaderboardProfile[] = [];

  if (tab === "weekly") {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: weeklyPosts } = await supabase
      .from("posts")
      .select(
        "author_id, type, profiles!posts_author_id_fkey(id, username, full_name, university, avatar_url, points)"
      )
      .eq("status", "published")
      .gte("published_at", weekAgo);

    const userMap: Record<string, LeaderboardProfile & { weekly_points: number }> = {};

    for (const post of weeklyPosts ?? []) {
      const profile = Array.isArray(post.profiles) ? post.profiles[0] : post.profiles;
      if (!profile) continue;

      const points = POST_POINTS[post.type as PostType] ?? 10;
      if (!userMap[profile.id]) {
        userMap[profile.id] = { ...profile, weekly_points: 0 };
      }
      userMap[profile.id].weekly_points += points;
    }

    profiles = Object.values(userMap)
      .sort((a, b) => (b.weekly_points ?? 0) - (a.weekly_points ?? 0))
      .slice(0, 20);
  } else {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url, points")
      .eq("is_alumni", true)
      .order("points", { ascending: false })
      .limit(20);

    profiles = data ?? [];
  }

  const profileIds = profiles.map((profile) => profile.id);
  let badgeCounts: Record<string, number> = {};
  if (profileIds.length > 0) {
    const { data: userBadges } = await supabase
      .from("user_badges")
      .select("user_id")
      .in("user_id", profileIds);

    badgeCounts = (userBadges ?? []).reduce(
      (acc, badge) => {
        acc[badge.user_id] = (acc[badge.user_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }

  const isUserInTop20 = user ? profiles.some((profile) => profile.id === user.id) : false;
  let currentUserRow: {
    profile: LeaderboardProfile;
    rank: number;
  } | null = null;

  if (user && !isUserInTop20 && tab === "alumni") {
    const { data: currentUserProfile } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url, points")
      .eq("id", user.id)
      .eq("is_alumni", true)
      .single();

    if (currentUserProfile) {
      const { count } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("is_alumni", true)
        .gt("points", currentUserProfile.points);

      currentUserRow = {
        profile: currentUserProfile,
        rank: (count ?? 0) + 1,
      };
    }
  }

  const tabs = [
    { label: "This Week", value: "weekly" },
    { label: "Alumni", value: "alumni" },
  ];

  const RANK_COLORS = ["text-yellow-500", "text-gray-400", "text-amber-600"];

  return (
    <div className="max-w-2xl mx-auto">
      <SponsorBanner placement={sponsor} />

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Leaderboard</h1>
        <p className="mt-1 text-sm text-gray-500">Top contributors on Indegenius</p>
      </div>

      <div className="mb-6 flex w-fit gap-1 rounded-lg bg-gray-100 p-1">
        {tabs.map((item) => {
          const active = tab === item.value;

          return (
            <Link
              key={item.value}
              href={`/leaderboard?tab=${item.value}`}
              className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? item.value === "alumni"
                    ? "bg-amber-500 text-white shadow-sm"
                    : "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <p className="mb-4 text-xs text-gray-400">
        {tab === "alumni"
          ? "Points earned across the Indegenius alumni network."
          : "Weekly ranking is the primary view for now."}
      </p>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {profiles.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            {tab === "weekly" ? "No activity this week yet." : "No alumni contributors yet."}
          </div>
        ) : (
          <div className="divide-y divide-gray-100 p-2">
            {profiles.map((profile, index) => {
              const rank = index + 1;
              const isCurrentUser = profile.id === user?.id;
              const displayPoints =
                tab === "weekly" ? profile.weekly_points ?? 0 : profile.points;

              return (
                <div
                  key={profile.id}
                  className={`flex items-center gap-4 rounded-xl px-4 py-3 transition-colors ${
                    isCurrentUser
                      ? "border border-emerald-200 bg-emerald-50"
                      : "hover:bg-canvas"
                  }`}
                >
                  <div
                    className={`w-8 flex-shrink-0 text-center text-lg font-bold ${
                      rank <= 3 ? RANK_COLORS[rank - 1] : "text-gray-300"
                    }`}
                  >
                    {rank <= 3 ? (
                      <span>{rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉"}</span>
                    ) : (
                      <span className="text-sm text-gray-400">{rank}</span>
                    )}
                  </div>

                  {profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.avatar_url}
                      alt={profile.full_name ?? profile.username}
                      className={`h-10 w-10 flex-shrink-0 rounded-full object-cover ${
                        isCurrentUser ? "border-2 border-emerald-300" : ""
                      }`}
                    />
                  ) : (
                    <div
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 font-bold text-emerald-700 ${
                        isCurrentUser ? "border-2 border-emerald-300" : ""
                      }`}
                    >
                      {(profile.full_name ?? profile.username ?? "?")
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/${profile.username}`}
                      className="text-sm font-semibold text-gray-900 transition-colors hover:text-emerald-brand"
                    >
                      {profile.full_name ?? profile.username}
                      {isCurrentUser ? (
                        <span className="ml-2 text-xs font-normal text-emerald-600">
                          (you)
                        </span>
                      ) : null}
                    </Link>
                    {profile.university ? (
                      <p className="truncate text-xs text-gray-400">{profile.university}</p>
                    ) : null}
                  </div>

                  <div className="flex-shrink-0 text-center text-xs text-gray-400">
                    <p className="font-medium text-gray-600">{badgeCounts[profile.id] ?? 0}</p>
                    <p>badges</p>
                  </div>

                  <div className="flex-shrink-0 text-right">
                    <div className="flex items-center justify-end gap-1.5">
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

            {currentUserRow ? (
              <div className="mt-4 border-t-2 border-dashed border-gray-200 pt-4">
                <p className="mb-2 px-4 text-xs text-gray-400">Your ranking</p>
                <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <span className="w-8 text-center text-sm font-bold text-gray-400">
                    #{currentUserRow.rank}
                  </span>
                  {currentUserRow.profile.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={currentUserRow.profile.avatar_url}
                      alt={currentUserRow.profile.full_name ?? currentUserRow.profile.username}
                      className="h-9 w-9 rounded-full border-2 border-emerald-300 object-cover"
                    />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-emerald-300 bg-emerald-100 text-sm font-bold text-emerald-700">
                      {(currentUserRow.profile.full_name ??
                        currentUserRow.profile.username)
                        .charAt(0)
                        .toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">
                      {currentUserRow.profile.full_name ??
                        currentUserRow.profile.username}{" "}
                      <span className="text-xs font-normal text-emerald-600">
                        (you)
                      </span>
                    </p>
                    {currentUserRow.profile.university ? (
                      <p className="truncate text-xs text-gray-400">
                        {currentUserRow.profile.university}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-sm font-bold text-emerald-brand">
                    {currentUserRow.profile.points} pts
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

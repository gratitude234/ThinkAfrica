import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AnalyticsCharts from "./AnalyticsCharts";

interface ProfileRow {
  id: string;
  created_at: string;
  full_name: string | null;
  username: string | null;
  university: string | null;
  field_of_study: string | null;
  interests: string[] | null;
}

interface ActivationEventRow {
  user_id: string | null;
  event_name: string;
  created_at: string;
}

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

function HealthCard({
  label,
  value,
  trend,
  trendLabel,
}: {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "neutral";
  trendLabel?: string;
}) {
  const trendColors = {
    up: "text-emerald-600",
    down: "text-red-500",
    neutral: "text-gray-400",
  };
  const trendIcons = { up: "+", down: "-", neutral: "=" };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs text-gray-500 font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {trendLabel && trend && (
        <p className={`text-xs mt-1 font-medium ${trendColors[trend]}`}>
          {trendIcons[trend]} {trendLabel}
        </p>
      )}
    </div>
  );
}

function isProfileComplete(profile: ProfileRow) {
  return Boolean(
    profile.full_name &&
      profile.username &&
      profile.university &&
      profile.field_of_study &&
      Array.isArray(profile.interests) &&
      profile.interests.length > 0
  );
}

function uniqueUsersForEvent(rows: ActivationEventRow[], eventName: string) {
  return new Set(
    rows
      .filter((row) => row.user_id && row.event_name === eventName)
      .map((row) => row.user_id as string)
  );
}

function pct(numerator: number, denominator: number) {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function buildThirtyDayMap() {
  const dayMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  return dayMap;
}

function computeReturnRate(
  profiles: ProfileRow[],
  eventsByUser: Map<string, ActivationEventRow[]>,
  daysAfterSignup: number
) {
  const now = Date.now();
  const eligible = profiles.filter((profile) => {
    const signupTime = new Date(profile.created_at).getTime();
    return now >= signupTime + daysAfterSignup * 24 * 60 * 60 * 1000;
  });

  const returned = eligible.filter((profile) => {
    const signupTime = new Date(profile.created_at).getTime();
    const threshold = signupTime + daysAfterSignup * 24 * 60 * 60 * 1000;
    return (eventsByUser.get(profile.id) ?? []).some(
      (event) => new Date(event.created_at).getTime() >= threshold
    );
  }).length;

  return {
    returned,
    eligible: eligible.length,
    rate: pct(returned, eligible.length),
  };
}

export default async function AdminAnalyticsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || user.email !== adminEmail) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-gray-500">
        Access denied.
      </div>
    );
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();

  const [
    { data: profilesRaw },
    { data: postsByTypeRaw },
    { count: totalDebates },
    { count: totalWebinars },
    { count: totalApplications },
    { data: viewsData },
    { data: signupsRaw },
    { data: activeThisWeekRaw },
    { data: activePrevWeekRaw },
    { data: postsThisWeekRaw },
    { data: uniContributorsRaw },
    { data: allPublishedAuthorsRaw },
    { data: activationEventsRaw },
    { data: followsRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, created_at, full_name, username, university, field_of_study, interests")
      .limit(10000),
    supabase.from("posts").select("type").eq("status", "published"),
    supabase.from("debates").select("*", { count: "exact", head: true }),
    supabase.from("webinars").select("*", { count: "exact", head: true }),
    supabase.from("fellowship_applications").select("*", { count: "exact", head: true }),
    supabase.from("posts").select("view_count").eq("status", "published"),
    supabase
      .from("profiles")
      .select("created_at")
      .gte("created_at", thirtyDaysAgo)
      .order("created_at", { ascending: true }),
    supabase
      .from("posts")
      .select("author_id")
      .eq("status", "published")
      .gte("published_at", sevenDaysAgo),
    supabase
      .from("posts")
      .select("author_id")
      .eq("status", "published")
      .gte("published_at", fourteenDaysAgo)
      .lt("published_at", sevenDaysAgo),
    supabase
      .from("posts")
      .select("id")
      .eq("status", "published")
      .gte("published_at", sevenDaysAgo),
    supabase
      .from("posts")
      .select("profiles!posts_author_id_fkey(university)")
      .eq("status", "published")
      .gte("published_at", thirtyDaysAgo),
    supabase.from("posts").select("author_id").eq("status", "published"),
    supabase
      .from("activation_events")
      .select("user_id, event_name, created_at")
      .limit(10000),
    supabase.from("follows").select("follower_id").limit(10000),
  ]);

  const profiles = (profilesRaw ?? []) as ProfileRow[];
  const totalUsers = profiles.length;
  const activationEvents = (activationEventsRaw ?? []) as ActivationEventRow[];

  const weeklyActiveUsers = new Set((activeThisWeekRaw ?? []).map((p) => p.author_id)).size;
  const prevWeekActiveUsers = new Set((activePrevWeekRaw ?? []).map((p) => p.author_id)).size;
  const wowChange =
    prevWeekActiveUsers > 0
      ? Math.round(((weeklyActiveUsers - prevWeekActiveUsers) / prevWeekActiveUsers) * 100)
      : 0;

  const authorPostCount: Record<string, number> = {};
  for (const p of allPublishedAuthorsRaw ?? []) {
    authorPostCount[p.author_id] = (authorPostCount[p.author_id] ?? 0) + 1;
  }
  const publishedAtLeastOnce = Object.keys(authorPostCount).length;
  const publishedOncePercent =
    totalUsers > 0 ? Math.round((publishedAtLeastOnce / totalUsers) * 100) : 0;

  const postsThisWeek = (postsThisWeekRaw ?? []).length;
  const avgPostsPerActiveUser =
    weeklyActiveUsers > 0 ? (postsThisWeek / weeklyActiveUsers).toFixed(1) : "0";

  const uniContribMap: Record<string, number> = {};
  for (const row of uniContributorsRaw ?? []) {
    const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
    const uni = (profile as { university?: string | null } | null)?.university;
    if (!uni) continue;
    uniContribMap[uni] = (uniContribMap[uni] ?? 0) + 1;
  }
  const topUniversitiesThisMonth = Object.entries(uniContribMap)
    .map(([university, count]) => ({ university, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3);

  const totalViews = (viewsData ?? []).reduce(
    (sum, p) => sum + (p.view_count ?? 0),
    0
  );

  const typeMap: Record<string, number> = {};
  for (const p of postsByTypeRaw ?? []) {
    typeMap[p.type] = (typeMap[p.type] ?? 0) + 1;
  }
  const postsByType = Object.entries(typeMap).map(([type, count]) => ({ type, count }));
  const totalPosts = (postsByTypeRaw ?? []).length;

  const dayMap = buildThirtyDayMap();
  for (const row of signupsRaw ?? []) {
    const key = row.created_at.slice(0, 10);
    if (key in dayMap) dayMap[key]++;
  }
  const signupsByDay = Object.entries(dayMap).map(([date, count]) => ({ date, count }));

  const { data: uniData } = await supabase
    .from("profiles")
    .select("university")
    .not("university", "is", null);

  const uniMap: Record<string, number> = {};
  for (const p of uniData ?? []) {
    if (!p.university) continue;
    uniMap[p.university] = (uniMap[p.university] ?? 0) + 1;
  }
  const topUniversities = Object.entries(uniMap)
    .map(([university, count]) => ({ university, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const onboardingCompleted = uniqueUsersForEvent(activationEvents, "onboarding_completed");
  const postOpened = uniqueUsersForEvent(activationEvents, "post_opened");
  const draftStarted = uniqueUsersForEvent(activationEvents, "draft_started");
  const postSubmitted = uniqueUsersForEvent(activationEvents, "post_submitted");

  const followCounts = new Map<string, number>();
  for (const follow of followsRaw ?? []) {
    followCounts.set(follow.follower_id, (followCounts.get(follow.follower_id) ?? 0) + 1);
  }
  const followedThreeUsers = new Set(
    Array.from(followCounts.entries())
      .filter(([, count]) => count >= 3)
      .map(([userId]) => userId)
  );

  const postOpenCounts = new Map<string, number>();
  for (const event of activationEvents) {
    if (event.user_id && event.event_name === "post_opened") {
      postOpenCounts.set(event.user_id, (postOpenCounts.get(event.user_id) ?? 0) + 1);
    }
  }

  const activatedCount = profiles.filter((profile) => {
    const hasFollowedThree = followedThreeUsers.has(profile.id);
    const hasReading = (postOpenCounts.get(profile.id) ?? 0) >= 2;
    const hasContribution = draftStarted.has(profile.id) || postSubmitted.has(profile.id);
    return isProfileComplete(profile) && hasFollowedThree && (hasReading || hasContribution);
  }).length;

  const activationFunnel = [
    { stage: "Signed up", count: totalUsers },
    { stage: "Onboarded", count: onboardingCompleted.size },
    { stage: "Followed 3+", count: followedThreeUsers.size },
    { stage: "Opened post", count: postOpened.size },
    { stage: "Started draft", count: draftStarted.size },
    { stage: "Submitted", count: postSubmitted.size },
    { stage: "Activated", count: activatedCount },
  ];

  const activeUsersByDay = new Map<string, Set<string>>();
  for (const event of activationEvents) {
    if (!event.user_id || event.created_at < thirtyDaysAgo) continue;
    const key = event.created_at.slice(0, 10);
    if (!activeUsersByDay.has(key)) activeUsersByDay.set(key, new Set());
    activeUsersByDay.get(key)!.add(event.user_id);
  }

  const retentionDayMap = buildThirtyDayMap();
  const retentionByDay = Object.keys(retentionDayMap).map((date) => ({
    date,
    activeUsers: activeUsersByDay.get(date)?.size ?? 0,
  }));

  const eventsByUser = new Map<string, ActivationEventRow[]>();
  for (const event of activationEvents) {
    if (!event.user_id) continue;
    eventsByUser.set(event.user_id, [...(eventsByUser.get(event.user_id) ?? []), event]);
  }
  const d1Return = computeReturnRate(profiles, eventsByUser, 1);
  const d7Return = computeReturnRate(profiles, eventsByUser, 7);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 text-sm mt-1">
          Activation, retention, and platform health.
        </p>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Retention Health
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="D1 Return"
            value={d1Return.rate}
            trend="neutral"
            trendLabel={`${d1Return.returned} of ${d1Return.eligible} eligible users`}
          />
          <HealthCard
            label="D7 Return"
            value={d7Return.rate}
            trend="neutral"
            trendLabel={`${d7Return.returned} of ${d7Return.eligible} eligible users`}
          />
          <HealthCard
            label="Activated Users"
            value={activatedCount}
            trend="neutral"
            trendLabel={`${pct(activatedCount, totalUsers)} of registered users`}
          />
          <HealthCard
            label="Post Openers"
            value={postOpened.size}
            trend="neutral"
            trendLabel={`${pct(postOpened.size, totalUsers)} of registered users`}
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Platform Health</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
          <HealthCard
            label="7-Day Active Authors"
            value={weeklyActiveUsers}
            trend={wowChange > 0 ? "up" : wowChange < 0 ? "down" : "neutral"}
            trendLabel={`${wowChange > 0 ? "+" : ""}${wowChange}% vs last week`}
          />
          <HealthCard
            label="Published >=1 Post"
            value={`${publishedOncePercent}%`}
            trend="neutral"
            trendLabel={`${publishedAtLeastOnce} of ${totalUsers} users`}
          />
          <HealthCard
            label="Avg Posts / Active Author"
            value={avgPostsPerActiveUser}
            trend="neutral"
            trendLabel="this week"
          />
          <HealthCard
            label="Top University"
            value={topUniversitiesThisMonth[0]?.university ?? "-"}
            trend="neutral"
            trendLabel={
              topUniversitiesThisMonth[0]
                ? `${topUniversitiesThisMonth[0].count} post${
                    topUniversitiesThisMonth[0].count !== 1 ? "s" : ""
                  } this month`
                : undefined
            }
          />
        </div>

        {topUniversitiesThisMonth.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              Top Universities This Month
            </h3>
            <div className="space-y-2">
              {topUniversitiesThisMonth.map((u, i) => (
                <div key={u.university} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-300 w-4">{i + 1}</span>
                    <span className="text-sm text-gray-800">{u.university}</span>
                  </div>
                  <span className="text-sm font-semibold text-emerald-brand">
                    {u.count} post{u.count !== 1 ? "s" : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Registered Users" value={totalUsers} />
        <StatCard
          label="Published Posts"
          value={totalPosts}
          sub={postsByType
            .map((p) => `${p.count} ${p.type === "policy_brief" ? "briefs" : `${p.type}s`}`)
            .join(" / ")}
        />
        <StatCard label="Debates Created" value={totalDebates ?? 0} />
        <StatCard label="Webinars Hosted" value={totalWebinars ?? 0} />
        <StatCard label="Fellowship Applications" value={totalApplications ?? 0} />
        <StatCard label="Total Page Views" value={totalViews} />
      </div>

      <AnalyticsCharts
        signupsByDay={signupsByDay}
        postsByType={postsByType}
        topUniversities={topUniversities}
        activationFunnel={activationFunnel}
        retentionByDay={retentionByDay}
      />
    </div>
  );
}

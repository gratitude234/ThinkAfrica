import { redirect } from "next/navigation";
import { createAdminActionClient } from "@/lib/adminAccess";
import { AdminAccessError, createAdminClient } from "@/lib/supabase/admin";
import AnalyticsCharts from "./AnalyticsCharts";

interface ProfileRow {
  id: string;
  created_at: string;
}

interface ActivationEventRow {
  user_id: string | null;
  event_name: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

interface Phase0MeasurementBaseline {
  definition_version: number;
  as_of: string;
  timezone: string;
  account_created_count: number;
  onboarding_completed_count: number;
  onboarding_timestamp_missing_count: number;
  first_publish_count: number;
  second_publish_30d_count: number;
  d30_eligible_count: number;
  d30_retained_count: number;
  full_funnel_d30_eligible_count: number;
  full_funnel_d30_retained_count: number;
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

function uniqueUsersForEvent(rows: ActivationEventRow[], eventName: string) {
  return new Set(
    rows
      .filter((row) => row.user_id && row.event_name === eventName)
      .map((row) => row.user_id as string)
  );
}

function eventMetadataValue(row: ActivationEventRow, key: string) {
  const metadata = row.metadata;
  if (!metadata || typeof metadata !== "object") return null;
  const value = metadata[key];
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  return null;
}

function pct(numerator: number, denominator: number) {
  if (denominator <= 0) return "0%";
  return `${Math.round((numerator / denominator) * 100)}%`;
}

function parsePhase0MeasurementBaseline(
  value: unknown
): Phase0MeasurementBaseline | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const row = value as Record<string, unknown>;
  const countKeys = [
    "account_created_count",
    "onboarding_completed_count",
    "onboarding_timestamp_missing_count",
    "first_publish_count",
    "second_publish_30d_count",
    "d30_eligible_count",
    "d30_retained_count",
    "full_funnel_d30_eligible_count",
    "full_funnel_d30_retained_count",
  ] as const;

  if (
    row.definition_version !== 1 ||
    typeof row.as_of !== "string" ||
    row.timezone !== "UTC" ||
    countKeys.some((key) => typeof row[key] !== "number")
  ) {
    return null;
  }

  return row as unknown as Phase0MeasurementBaseline;
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
  let supabase: ReturnType<typeof createAdminClient> | null = null;
  try {
    const result = await createAdminActionClient("analytics.view");
    supabase = result.admin;
  } catch (error) {
    if (error instanceof AdminAccessError && error.status === 401) redirect("/login");
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
    { data: postsByKindRaw },
    { data: viewsData },
    { data: signupsRaw },
    { data: activeThisWeekRaw },
    { data: activePrevWeekRaw },
    { data: postsThisWeekRaw },
    { data: uniContributorsRaw },
    { data: allPublishedAuthorsRaw },
    { data: activationEventsRaw },
    { data: phase0BaselineRaw, error: phase0BaselineError },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, created_at")
      .limit(10000),
    supabase.from("posts").select("content_kind").eq("status", "published"),
    supabase
      .from("posts")
      .select("impression_count, view_count, read_count")
      .eq("status", "published"),
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
    supabase
      .from("posts")
      .select("author_id")
      .eq("status", "published"),
    supabase
      .from("activation_events")
      .select("user_id, event_name, created_at, metadata")
      .limit(10000),
    supabase.rpc("get_phase0_measurement_baseline", {
      p_cohort_start: null,
      p_cohort_end: null,
    }),
  ]);

  const profiles = (profilesRaw ?? []) as ProfileRow[];
  const totalUsers = profiles.length;
  const activationEvents = (activationEventsRaw ?? []) as ActivationEventRow[];
  const phase0Baseline = parsePhase0MeasurementBaseline(phase0BaselineRaw);

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
  const totalImpressions = (viewsData ?? []).reduce(
    (sum, p) => sum + ((p as { impression_count?: number | null }).impression_count ?? 0),
    0
  );
  const totalReads = (viewsData ?? []).reduce(
    (sum, p) => sum + ((p as { read_count?: number | null }).read_count ?? 0),
    0
  );

  // Two kinds, and nothing else. This used to count the legacy `type`, which
  // is how the chart had a Policy slice and a Research slice.
  const kindMap: Record<string, number> = {};
  for (const p of postsByKindRaw ?? []) {
    const kind = (p as { content_kind?: string | null }).content_kind ?? "post";
    kindMap[kind] = (kindMap[kind] ?? 0) + 1;
  }
  const postsByKind = Object.entries(kindMap).map(([kind, count]) => ({ kind, count }));
  const totalPosts = (postsByKindRaw ?? []).length;

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
  const firstContributionStarted = new Set(draftStarted);

  const activationFunnel = [
    { stage: "Signed up", count: totalUsers },
    { stage: "Onboarded", count: onboardingCompleted.size },
    { stage: "Opened post", count: postOpened.size },
    { stage: "First contribution", count: firstContributionStarted.size },
    { stage: "Submitted", count: postSubmitted.size },
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
  const searchUsers = uniqueUsersForEvent(activationEvents, "search_performed");
  const exploreUsers = uniqueUsersForEvent(activationEvents, "discover_viewed");
  const discoveryClickRows = activationEvents.filter(
    (event) => event.event_name === "discover_item_clicked"
  );
  const discoveryClickUsers = new Set(
    discoveryClickRows.map((event) => event.user_id).filter(Boolean) as string[]
  );
  const topicOpenRows = discoveryClickRows.filter((event) => {
    const item = eventMetadataValue(event, "item");
    return item === "topic" || item === "topic_strip" || item === "search_topic";
  });

  const writerFollowUsers = uniqueUsersForEvent(activationEvents, "writer_followed");
  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500 text-sm mt-1">
            Publishing, discovery, and platform health.
          </p>
        </div>
      </div>

      <div className="mb-10">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-gray-900">
            Phase 0 Ordered Baseline
          </h2>
          <p className="mt-1 text-xs text-gray-500">
            Durable, all-time account-created cohort. Publications are ordered after
            onboarding. No capped event export is used. The D30 return figures are no
            longer shown: they depended on a daily activity record the app stopped
            writing when retention measurement was retired.
          </p>
        </div>
        {phase0Baseline ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <HealthCard
              label="Accounts Created"
              value={phase0Baseline.account_created_count}
              trend="neutral"
              trendLabel="cohort denominator"
            />
            <HealthCard
              label="Onboarding Completed"
              value={phase0Baseline.onboarding_completed_count}
              trend="neutral"
              trendLabel={`${pct(
                phase0Baseline.onboarding_completed_count,
                phase0Baseline.account_created_count
              )} of accounts`}
            />
            <HealthCard
              label="First Publication"
              value={phase0Baseline.first_publish_count}
              trend="neutral"
              trendLabel={`${pct(
                phase0Baseline.first_publish_count,
                phase0Baseline.onboarding_completed_count
              )} of onboarded`}
            />
            <HealthCard
              label="Second in 30 Days"
              value={phase0Baseline.second_publish_30d_count}
              trend="neutral"
              trendLabel={`${pct(
                phase0Baseline.second_publish_30d_count,
                phase0Baseline.first_publish_count
              )} of first publishers`}
            />
            <HealthCard
              label="Missing Onboarding Time"
              value={phase0Baseline.onboarding_timestamp_missing_count}
              trend="neutral"
              trendLabel="legacy completions excluded from ordered stages"
            />
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {phase0BaselineError
              ? "The Phase 0 baseline is unavailable until its database migration is applied."
              : "The Phase 0 baseline returned an unsupported payload."}
          </div>
        )}
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Legacy Event Return Signals
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
            label="Post Openers"
            value={postOpened.size}
            trend="neutral"
            trendLabel={`${pct(postOpened.size, totalUsers)} of registered users`}
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Discovery Loop
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Explore Viewers"
            value={exploreUsers.size}
            trend="neutral"
            trendLabel={`${pct(exploreUsers.size, totalUsers)} of registered users`}
          />
          <HealthCard
            label="Search Users"
            value={searchUsers.size}
            trend="neutral"
            trendLabel="searched across discovery"
          />
          <HealthCard
            label="Discovery Clickers"
            value={discoveryClickUsers.size}
            trend="neutral"
            trendLabel={`${discoveryClickRows.length.toLocaleString()} tracked clicks`}
          />
          <HealthCard
            label="Topic Opens"
            value={topicOpenRows.length}
            trend="neutral"
            trendLabel="topic discovery clicks"
          />
          <HealthCard
            label="Writer Follows"
            value={writerFollowUsers.size}
            trend="neutral"
            trendLabel="follow conversion signal"
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
          sub={postsByKind
            .map((p) => `${p.count} ${p.kind === "article" ? "Articles" : "Posts"}`)
            .join(" / ")}
        />
        <StatCard label="Post Impressions" value={totalImpressions} />
        <StatCard label="Post Views" value={totalViews} />
        <StatCard label="Post Reads" value={totalReads} />
      </div>

      <AnalyticsCharts
        signupsByDay={signupsByDay}
        postsByKind={postsByKind}
        topUniversities={topUniversities}
        activationFunnel={activationFunnel}
        retentionByDay={retentionByDay}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import AnalyticsCharts from "./AnalyticsCharts";
import { getActionInboxSummary } from "@/lib/actionInbox";
import { getFeedSurfaceReason, getQualityScore } from "@/lib/postQuality";
import { getOpportunityShortLabel } from "@/lib/opportunities";

interface ProfileRow {
  id: string;
  created_at: string;
  full_name: string | null;
  username: string | null;
  country: string | null;
  university: string | null;
  field_of_study: string | null;
  bio: string | null;
  avatar_url: string | null;
  verified: boolean | null;
  interests: string[] | null;
}

interface ActivationEventRow {
  user_id: string | null;
  event_name: string;
  created_at: string;
  metadata?: Record<string, unknown> | null;
}

interface TalentProfileAnalyticsRow {
  open_to_opportunities: boolean | null;
  visibility: string | null;
  skills: string[] | null;
  opportunity_types: string[] | null;
  cv_url: string | null;
  linkedin_url: string | null;
}

interface TalentInquiryAnalyticsRow {
  status: string | null;
  opportunity_type: string | null;
  created_at: string | null;
  timeline: string | null;
  commitment: string | null;
  fit_reason: string | null;
}

interface NotificationAnalyticsRow {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  message: string | null;
  link: string | null;
  post_id: string | null;
}

interface PromisingPostRow {
  id: string;
  title: string;
  slug: string;
  type: string;
  tags: string[] | null;
  view_count: number | null;
  published_at: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  profiles:
    | {
        username: string | null;
        full_name: string | null;
        verified?: boolean | null;
      }
    | Array<{
        username: string | null;
        full_name: string | null;
        verified?: boolean | null;
      }>
    | null;
}

interface EditorialAnalyticsPostRow {
  id: string;
  type: string;
  status: string;
  created_at: string;
  published_at: string | null;
  citation_id: string | null;
  published_version_id: string | null;
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

function buildThirtyDayMap() {
  const dayMap: Record<string, number> = {};
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    dayMap[d.toISOString().slice(0, 10)] = 0;
  }
  return dayMap;
}

function countByPostId(rows: Array<{ post_id?: string | null }>) {
  return rows.reduce((acc: Record<string, number>, row) => {
    if (row.post_id) acc[row.post_id] = (acc[row.post_id] ?? 0) + 1;
    return acc;
  }, {});
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
    { data: opportunityApplicationsRaw },
    { count: savedOpportunityCount },
    { data: viewsData },
    { data: signupsRaw },
    { data: activeThisWeekRaw },
    { data: activePrevWeekRaw },
    { data: postsThisWeekRaw },
    { data: uniContributorsRaw },
    { data: allPublishedAuthorsRaw },
    { data: activationEventsRaw },
    { data: followsRaw },
    { data: talentProfilesRaw },
    { data: talentInquiriesRaw, count: totalTalentInquiries },
    { data: notificationsRaw },
    { count: acceptedCoauthorCount },
    { count: totalMessages },
    { data: debateArgumentsRaw },
    { count: featuredProfileCount },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, created_at, full_name, username, country, university, field_of_study, bio, avatar_url, verified, interests")
      .limit(10000),
    supabase.from("posts").select("type").eq("status", "published"),
    supabase.from("debates").select("*", { count: "exact", head: true }),
    supabase.from("webinars").select("*", { count: "exact", head: true }),
    supabase.from("fellowship_applications").select("*", { count: "exact", head: true }),
    supabase
      .from("fellowship_applications")
      .select(
        "fellowship_id, status, proof_post_id, applied_at, reviewed_at, fellowships(title, opportunity_type)"
      )
      .limit(10000),
    supabase.from("saved_opportunities").select("*", { count: "exact", head: true }),
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
    supabase
      .from("posts")
      .select("author_id, type, citation_id")
      .eq("status", "published"),
    supabase
      .from("activation_events")
      .select("user_id, event_name, created_at, metadata")
      .limit(10000),
    supabase.from("follows").select("follower_id").limit(10000),
    supabase
      .from("talent_profiles")
      .select("open_to_opportunities, visibility, skills, opportunity_types, cv_url, linkedin_url")
      .limit(10000),
    supabase
      .from("talent_inquiries")
      .select(
        "status, opportunity_type, created_at, timeline, commitment, fit_reason",
        { count: "exact" }
      )
      .limit(10000),
    supabase
      .from("notifications")
      .select("id, type, read, created_at, message, link, post_id")
      .limit(10000),
    supabase
      .from("post_authors")
      .select("*", { count: "exact", head: true })
      .not("accepted_at", "is", null)
      .gt("display_order", 0),
    supabase.from("messages").select("*", { count: "exact", head: true }),
    supabase.from("debate_arguments").select("author_id").limit(10000),
    supabase
      .from("profile_featured_posts")
      .select("user_id", { count: "exact", head: true }),
  ]);

  const profiles = (profilesRaw ?? []) as ProfileRow[];
  const totalUsers = profiles.length;
  const activationEvents = (activationEventsRaw ?? []) as ActivationEventRow[];
  const talentProfiles = (talentProfilesRaw ?? []) as TalentProfileAnalyticsRow[];
  const talentInquiries = (talentInquiriesRaw ?? []) as TalentInquiryAnalyticsRow[];
  const notifications = (notificationsRaw ?? []) as NotificationAnalyticsRow[];
  const opportunityApplications = (opportunityApplicationsRaw ?? []).map((application) => ({
    ...application,
    fellowship: Array.isArray(application.fellowships)
      ? application.fellowships[0]
      : application.fellowships,
  }));
  const opportunityProofPostIds = opportunityApplications
    .map((application) => application.proof_post_id)
    .filter(Boolean) as string[];
  const { data: opportunityProofPostsRaw } =
    opportunityProofPostIds.length > 0
      ? await supabase
          .from("posts")
          .select("id, type, citation_id")
          .in("id", opportunityProofPostIds)
      : { data: [] };
  const opportunityProofPosts = new Map(
    (opportunityProofPostsRaw ?? []).map((post) => [post.id, post])
  );
  const { data: editorialPostsRaw } = await supabase
    .from("posts")
    .select("id, type, status, created_at, published_at, citation_id, published_version_id")
    .in("type", ["research", "policy_brief"])
    .limit(10000);
  const editorialPosts = (editorialPostsRaw ?? []) as EditorialAnalyticsPostRow[];
  const editorialPostIds = editorialPosts.map((post) => post.id);
  const [{ data: editorialReviewsRaw }, { data: editorialDecisionsRaw }] =
    editorialPostIds.length > 0
      ? await Promise.all([
          supabase
            .from("post_reviews")
            .select("post_id, submitted_at")
            .in("post_id", editorialPostIds),
          supabase
            .from("post_editor_decisions")
            .select("post_id, decision, created_at")
            .in("post_id", editorialPostIds),
        ])
      : [{ data: [] }, { data: [] }];
  const editorialStatusCounts = editorialPosts.reduce((acc: Record<string, number>, post) => {
    acc[post.status] = (acc[post.status] ?? 0) + 1;
    return acc;
  }, {});
  const editorialCompletedReviews = (editorialReviewsRaw ?? []).filter(
    (review) => review.submitted_at
  ).length;
  const editorialRevisionRequests = (editorialDecisionsRaw ?? []).filter(
    (decision) => decision.decision === "request_revision"
  ).length;
  const editorialPublishedPosts = editorialPosts.filter(
    (post) => post.status === "published"
  );
  const editorialCitablePosts = editorialPosts.filter((post) => post.citation_id);
  const decisionDurations = editorialPublishedPosts
    .map((post) => {
      if (!post.published_at) return null;
      const submitted = new Date(post.created_at).getTime();
      const published = new Date(post.published_at).getTime();
      if (Number.isNaN(submitted) || Number.isNaN(published) || published < submitted) {
        return null;
      }
      return Math.round((published - submitted) / (24 * 60 * 60 * 1000));
    })
    .filter((value): value is number => value !== null);
  const avgEditorialDecisionDays =
    decisionDurations.length > 0
      ? Math.round(
          decisionDurations.reduce((sum, value) => sum + value, 0) /
            decisionDurations.length
        )
      : 0;

  const weeklyActiveUsers = new Set((activeThisWeekRaw ?? []).map((p) => p.author_id)).size;
  const prevWeekActiveUsers = new Set((activePrevWeekRaw ?? []).map((p) => p.author_id)).size;
  const wowChange =
    prevWeekActiveUsers > 0
      ? Math.round(((weeklyActiveUsers - prevWeekActiveUsers) / prevWeekActiveUsers) * 100)
      : 0;

  const authorPostCount: Record<string, number> = {};
  const citableProfileUsers = new Set<string>();
  const reviewedProfileUsers = new Set<string>();
  for (const p of allPublishedAuthorsRaw ?? []) {
    authorPostCount[p.author_id] = (authorPostCount[p.author_id] ?? 0) + 1;
    if (p.citation_id) citableProfileUsers.add(p.author_id);
    if (p.type === "research" || p.type === "policy_brief" || p.citation_id) {
      reviewedProfileUsers.add(p.author_id);
    }
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

  const verifiedProfiles = profiles.filter((profile) => profile.verified).length;
  const completeProfileCount = profiles.filter((profile) =>
    Boolean(
      profile.full_name &&
        profile.username &&
        profile.bio &&
        profile.country &&
        profile.university &&
        profile.field_of_study &&
        profile.avatar_url &&
        Array.isArray(profile.interests) &&
        profile.interests.length > 0
    )
  ).length;
  const partialProfileCount = profiles.filter((profile) =>
    Boolean(
      profile.full_name &&
        profile.username &&
        (profile.university || profile.field_of_study || profile.bio)
    )
  ).length;

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
  const responseStarted = uniqueUsersForEvent(activationEvents, "response_started");
  const postSubmitted = uniqueUsersForEvent(activationEvents, "post_submitted");
  const debateArgumentUsers = new Set(
    (debateArgumentsRaw ?? [])
      .map((argument) => argument.author_id)
      .filter(Boolean) as string[]
  );
  const firstContributionStarted = new Set([
    ...Array.from(draftStarted),
    ...Array.from(responseStarted),
    ...Array.from(debateArgumentUsers),
  ]);

  const followCounts = new Map<string, number>();
  for (const follow of followsRaw ?? []) {
    followCounts.set(follow.follower_id, (followCounts.get(follow.follower_id) ?? 0) + 1);
  }
  const followedThreeUsers = new Set(
    Array.from(followCounts.entries())
      .filter(([, count]) => count >= 3)
      .map(([userId]) => userId)
  );

  const activatedCount = profiles.filter((profile) => {
    const hasFollowedThree = followedThreeUsers.has(profile.id);
    const hasContribution =
      firstContributionStarted.has(profile.id) || postSubmitted.has(profile.id);
    return isProfileComplete(profile) && hasFollowedThree && hasContribution;
  }).length;

  const activationFunnel = [
    { stage: "Signed up", count: totalUsers },
    { stage: "Onboarded", count: onboardingCompleted.size },
    { stage: "Followed 3+", count: followedThreeUsers.size },
    { stage: "Opened post", count: postOpened.size },
    { stage: "First contribution", count: firstContributionStarted.size },
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
  const responseStarts = activationEvents.filter(
    (event) => event.event_name === "response_started"
  ).length;
  const coauthorInvitesSent = activationEvents.filter(
    (event) => event.event_name === "coauthor_invite_sent"
  ).length;
  const coauthorInvitesAccepted = activationEvents.filter(
    (event) => event.event_name === "coauthor_invite_accepted"
  ).length;
  const messageSentEvents = activationEvents.filter(
    (event) => event.event_name === "message_sent"
  ).length;
  const collaborationUsers = new Set(
    activationEvents
      .filter((event) =>
        [
          "response_started",
          "coauthor_invite_sent",
          "coauthor_invite_accepted",
          "message_sent",
        ].includes(event.event_name)
      )
      .map((event) => event.user_id)
      .filter(Boolean) as string[]
  );
  const returnActionUsers = uniqueUsersForEvent(activationEvents, "next_action_clicked");
  const notificationOpenedUsers = uniqueUsersForEvent(
    activationEvents,
    "notification_opened"
  );
  const responseStartedUsers = uniqueUsersForEvent(activationEvents, "response_started");
  const notificationOpenRows = activationEvents.filter(
    (event) => event.event_name === "notification_opened"
  );
  const actionInboxClickRows = activationEvents.filter((event) => {
    if (event.event_name !== "next_action_clicked") return false;
    const source = eventMetadataValue(event, "source") ?? "";
    return (
      source.includes("notifications") ||
      source.includes("notification_bell") ||
      source.includes("dashboard_action_inbox")
    );
  });
  const responseStartsFromNotifications = activationEvents.filter(
    (event) =>
      event.event_name === "response_started" &&
      (eventMetadataValue(event, "source") ?? "").includes("notifications")
  );
  const inquiryTriageRows = activationEvents.filter(
    (event) => event.event_name === "opportunity_inquiry_status_updated"
  );
  const actionInboxSummary = getActionInboxSummary(notifications);
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
  const debateOpenRows = discoveryClickRows.filter((event) => {
    const item = eventMetadataValue(event, "item");
    return item === "active_debate" || item === "search_debate";
  });
  const opportunityClickRows = discoveryClickRows.filter((event) => {
    const item = eventMetadataValue(event, "item");
    return (
      item === "opportunities" ||
      item === "opportunities_empty" ||
      item === "search_opportunity" ||
      item === "fellowship" ||
      item === "fellowships_all"
    );
  });
  const writerFollowUsers = uniqueUsersForEvent(activationEvents, "writer_followed");
  const opportunityListingOpens = activationEvents.filter(
    (event) => event.event_name === "opportunity_listing_opened"
  );
  const opportunityApplyStartedRows = activationEvents.filter(
    (event) => event.event_name === "opportunity_apply_started"
  );
  const opportunityApplySubmittedRows = activationEvents.filter(
    (event) => event.event_name === "opportunity_apply_submitted"
  );
  const opportunitySavedRows = activationEvents.filter(
    (event) => event.event_name === "opportunity_saved"
  );
  const proofAttachedApplications = opportunityApplications.filter(
    (application) => application.proof_post_id
  ).length;
  const applicationStatusCounts = opportunityApplications.reduce(
    (acc: Record<string, number>, application) => {
      acc[application.status] = (acc[application.status] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const reviewedProofApplications = opportunityApplications.filter((application) => {
    if (!application.proof_post_id) return false;
    const proof = opportunityProofPosts.get(application.proof_post_id);
    return Boolean(
      proof?.citation_id ||
        proof?.type === "research" ||
        proof?.type === "policy_brief"
    );
  }).length;
  const reviewedApplicationDurations = opportunityApplications
    .map((application) => {
      if (!application.reviewed_at) return null;
      const applied = new Date(application.applied_at).getTime();
      const reviewed = new Date(application.reviewed_at).getTime();
      if (Number.isNaN(applied) || Number.isNaN(reviewed) || reviewed < applied) {
        return null;
      }
      return Math.round((reviewed - applied) / (24 * 60 * 60 * 1000));
    })
    .filter((value): value is number => value !== null);
  const avgApplicationReviewDays =
    reviewedApplicationDurations.length > 0
      ? Math.round(
          reviewedApplicationDurations.reduce((sum, value) => sum + value, 0) /
            reviewedApplicationDurations.length
        )
      : 0;
  const opportunityConversionMap = opportunityApplications.reduce(
    (acc: Record<string, { title: string; type: string | null; count: number; proofCount: number }>, application) => {
      const key = application.fellowship_id;
      const fellowship = application.fellowship as
        | { title?: string | null; opportunity_type?: string | null }
        | null;
      if (!acc[key]) {
        acc[key] = {
          title: fellowship?.title ?? "Untitled opportunity",
          type: fellowship?.opportunity_type ?? null,
          count: 0,
          proofCount: 0,
        };
      }
      acc[key].count += 1;
      if (application.proof_post_id) acc[key].proofCount += 1;
      return acc;
    },
    {}
  );
  const topOpportunityConversions = Object.values(opportunityConversionMap)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
  const coachingViewedRows = activationEvents.filter(
    (event) =>
      event.event_name === "quality_check_viewed" &&
      eventMetadataValue(event, "source") === "write_coaching"
  );
  const coachingCompletedRows = activationEvents.filter(
    (event) =>
      event.event_name === "quality_check_completed" &&
      eventMetadataValue(event, "source") === "write_coaching"
  );
  const coachingViewers = new Set(
    coachingViewedRows.map((event) => event.user_id).filter(Boolean) as string[]
  );
  const coachingCompleters = new Set(
    coachingCompletedRows.map((event) => event.user_id).filter(Boolean) as string[]
  );
  const publishDrawerUsers = uniqueUsersForEvent(
    activationEvents,
    "publish_drawer_opened"
  );
  const submittedUsers = uniqueUsersForEvent(activationEvents, "post_submitted");
  const publishAfterCoachingUsers = new Set(
    Array.from(publishDrawerUsers).filter((userId) => coachingViewers.has(userId))
  );
  const submitAfterCoachingUsers = new Set(
    Array.from(submittedUsers).filter((userId) => coachingViewers.has(userId))
  );
  const firstContributionAt = new Map<string, number>();
  for (const event of activationEvents) {
    if (
      !event.user_id ||
      !["draft_started", "response_started", "post_submitted"].includes(
        event.event_name
      )
    ) {
      continue;
    }
    const eventTime = new Date(event.created_at).getTime();
    const current = firstContributionAt.get(event.user_id);
    if (!current || eventTime < current) {
      firstContributionAt.set(event.user_id, eventTime);
    }
  }
  const now = Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
  const firstContributionEligible = Array.from(firstContributionAt.entries()).filter(
    ([, timestamp]) => now >= timestamp + sevenDaysMs
  );
  const returnedAfterFirstContribution = firstContributionEligible.filter(
    ([userId, timestamp]) =>
      (eventsByUser.get(userId) ?? []).some((event) => {
        const eventTime = new Date(event.created_at).getTime();
        return eventTime > timestamp && eventTime <= timestamp + sevenDaysMs;
      })
  ).length;
  const publicOpportunityProfiles = talentProfiles.filter(
    (profile) =>
      profile.open_to_opportunities === true && profile.visibility === "public"
  ).length;
  const readinessCompleteProfiles = talentProfiles.filter((profile) => {
    const skills = profile.skills ?? [];
    const types = profile.opportunity_types ?? [];
    return Boolean(
      profile.open_to_opportunities === true &&
        profile.visibility === "public" &&
        skills.length >= 2 &&
        types.length > 0 &&
        (profile.cv_url || profile.linkedin_url)
    );
  }).length;
  const openTalentProfiles = talentProfiles.filter(
    (profile) =>
      profile.open_to_opportunities === true &&
      (profile.visibility === "public" || profile.visibility === "partners_only")
  ).length;
  const talentDiscoveryViews = opportunityListingOpens.filter(
    (event) => eventMetadataValue(event, "source") === "talent"
  );
  const inquiryStartedRows = activationEvents.filter(
    (event) => event.event_name === "opportunity_inquiry_started"
  );
  const inquirySubmittedRows = activationEvents.filter(
    (event) => event.event_name === "opportunity_inquiry_submitted"
  );
  const inquiryStatusCounts = talentInquiries.reduce(
    (acc: Record<string, number>, inquiry) => {
      const key = inquiry.status ?? "unknown";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const structuredInquiryCount = talentInquiries.filter(
    (inquiry) => inquiry.timeline && inquiry.commitment && inquiry.fit_reason
  ).length;
  const inquiryTypeCounts = talentInquiries.reduce(
    (acc: Record<string, number>, inquiry) => {
      const key = inquiry.opportunity_type ?? "unspecified";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    },
    {}
  );
  const topInquiryTypes = Object.entries(inquiryTypeCounts)
    .sort(([, left], [, right]) => right - left)
    .slice(0, 4);
  const { data: promisingPostsRaw } = await supabase
    .from("posts")
    .select(
      `id, title, slug, type, tags, view_count, published_at, citation_id, published_version_id,
      profiles!posts_author_id_fkey(username, full_name, verified)`
    )
    .eq("status", "published")
    .order("published_at", { ascending: false })
    .limit(60);
  const promisingPostIds = ((promisingPostsRaw ?? []) as PromisingPostRow[]).map(
    (post) => post.id
  );
  const [
    { data: promisingReferences },
    { data: promisingComments },
    { data: promisingBookmarks },
    { data: promisingResponses },
  ] =
    promisingPostIds.length > 0
      ? await Promise.all([
          supabase
            .from("post_references")
            .select("post_id")
            .in("post_id", promisingPostIds),
          supabase
            .from("comments")
            .select("post_id")
            .in("post_id", promisingPostIds),
          supabase
            .from("bookmarks")
            .select("post_id")
            .in("post_id", promisingPostIds),
          supabase
            .from("posts")
            .select("in_response_to")
            .in("in_response_to", promisingPostIds),
        ])
      : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const promisingReferenceCounts = countByPostId(
    (promisingReferences ?? []) as Array<{ post_id?: string | null }>
  );
  const promisingCommentCounts = countByPostId(
    (promisingComments ?? []) as Array<{ post_id?: string | null }>
  );
  const promisingBookmarkCounts = countByPostId(
    (promisingBookmarks ?? []) as Array<{ post_id?: string | null }>
  );
  const promisingResponseCounts = (
    (promisingResponses ?? []) as Array<{ in_response_to?: string | null }>
  ).reduce((acc: Record<string, number>, row) => {
    if (row.in_response_to) {
      acc[row.in_response_to] = (acc[row.in_response_to] ?? 0) + 1;
    }
    return acc;
  }, {});
  const promisingPosts = ((promisingPostsRaw ?? []) as PromisingPostRow[])
    .map((post) => {
      const author = Array.isArray(post.profiles)
        ? post.profiles[0] ?? null
        : post.profiles;
      const qualityInput = {
        type: post.type,
        citationId: post.citation_id,
        publishedVersionId: post.published_version_id,
        referenceCount: promisingReferenceCounts[post.id] ?? 0,
        responseCount: promisingResponseCounts[post.id] ?? 0,
        commentCount: promisingCommentCounts[post.id] ?? 0,
        bookmarkCount: promisingBookmarkCounts[post.id] ?? 0,
        viewCount: post.view_count,
        publishedAt: post.published_at,
        tags: post.tags,
        author,
      };

      return {
        ...post,
        author,
        qualityScore: getQualityScore(qualityInput),
        reason: getFeedSurfaceReason(qualityInput) ?? "Promising engagement",
        referenceCount: promisingReferenceCounts[post.id] ?? 0,
        responseCount: promisingResponseCounts[post.id] ?? 0,
        commentCount: promisingCommentCounts[post.id] ?? 0,
        bookmarkCount: promisingBookmarkCounts[post.id] ?? 0,
      };
    })
    .sort((left, right) => right.qualityScore - left.qualityScore)
    .slice(0, 6);

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
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Return Loop
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Return Action Clickers"
            value={returnActionUsers.size}
            trend="neutral"
            trendLabel={`${pct(returnActionUsers.size, totalUsers)} of registered users`}
          />
          <HealthCard
            label="Notification Openers"
            value={notificationOpenedUsers.size}
            trend="neutral"
            trendLabel="opened activity from bell or page"
          />
          <HealthCard
            label="Response Starters"
            value={responseStartedUsers.size}
            trend="neutral"
            trendLabel="reader-to-writer loop"
          />
          <HealthCard
            label="7D After First Contribution"
            value={pct(
              returnedAfterFirstContribution,
              firstContributionEligible.length
            )}
            trend="neutral"
            trendLabel={`${returnedAfterFirstContribution} of ${firstContributionEligible.length} eligible users`}
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Action Inbox
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Unread Action Items"
            value={actionInboxSummary.unreadActionCount}
            trend="neutral"
            trendLabel="from current notifications"
          />
          <HealthCard
            label="Stale Unread"
            value={actionInboxSummary.staleUnreadCount}
            trend="neutral"
            trendLabel="older than 7 days"
          />
          <HealthCard
            label="Notification Opens"
            value={notificationOpenRows.length}
            trend="neutral"
            trendLabel={`${notificationOpenedUsers.size.toLocaleString()} unique users`}
          />
          <HealthCard
            label="Inbox Action Clicks"
            value={actionInboxClickRows.length}
            trend="neutral"
            trendLabel="notifications, bell, and dashboard"
          />
          <HealthCard
            label="Response Starts"
            value={responseStartsFromNotifications.length}
            trend="neutral"
            trendLabel="from notification response CTAs"
          />
          <HealthCard
            label="Inquiry Triage"
            value={inquiryTriageRows.length}
            trend="neutral"
            trendLabel="read/archive actions"
          />
          <HealthCard
            label="Response Items"
            value={
              actionInboxSummary.groups.find((group) => group.key === "responses")
                ?.items.length ?? 0
            }
            trend="neutral"
            trendLabel="notification backlog"
          />
          <HealthCard
            label="Opportunity Items"
            value={
              actionInboxSummary.groups.find((group) => group.key === "opportunities")
                ?.items.length ?? 0
            }
            trend="neutral"
            trendLabel="partner outreach backlog"
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Draft Coaching
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Coaching Viewers"
            value={coachingViewers.size}
            trend="neutral"
            trendLabel={`${coachingViewedRows.length.toLocaleString()} coaching views`}
          />
          <HealthCard
            label="Checks Completed"
            value={coachingCompletedRows.length}
            trend="neutral"
            trendLabel={`${coachingCompleters.size.toLocaleString()} users completed checks`}
          />
          <HealthCard
            label="Publish Review After Coaching"
            value={publishAfterCoachingUsers.size}
            trend="neutral"
            trendLabel={`${pct(publishAfterCoachingUsers.size, coachingViewers.size)} of coaching viewers`}
          />
          <HealthCard
            label="Submitted After Coaching"
            value={submitAfterCoachingUsers.size}
            trend="neutral"
            trendLabel={`${pct(submitAfterCoachingUsers.size, coachingViewers.size)} of coaching viewers`}
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Editorial Trust
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="In Review"
            value={editorialStatusCounts.pending ?? 0}
            trend="neutral"
            trendLabel="research and policy submissions"
          />
          <HealthCard
            label="Pending Revisions"
            value={editorialStatusCounts.pending_revision ?? 0}
            trend="neutral"
            trendLabel={`${editorialRevisionRequests.toLocaleString()} revision requests`}
          />
          <HealthCard
            label="Completed Reviews"
            value={editorialCompletedReviews}
            trend="neutral"
            trendLabel="submitted reviewer recommendations"
          />
          <HealthCard
            label="Reviewed Published"
            value={editorialPublishedPosts.length}
            trend="neutral"
            trendLabel={`${editorialStatusCounts.rejected ?? 0} declined`}
          />
          <HealthCard
            label="Citable Posts"
            value={editorialCitablePosts.length}
            trend="neutral"
            trendLabel={`${pct(editorialCitablePosts.length, editorialPublishedPosts.length)} of reviewed published`}
          />
          <HealthCard
            label="Avg Review Time"
            value={decisionDurations.length > 0 ? `${avgEditorialDecisionDays}d` : "-"}
            trend="neutral"
            trendLabel={`${decisionDurations.length.toLocaleString()} completed publication paths`}
          />
          <HealthCard
            label="Research Submissions"
            value={editorialPosts.filter((post) => post.type === "research").length}
            trend="neutral"
            trendLabel="all statuses"
          />
          <HealthCard
            label="Policy Brief Submissions"
            value={editorialPosts.filter((post) => post.type === "policy_brief").length}
            trend="neutral"
            trendLabel="all statuses"
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
          <HealthCard
            label="Debate Opens"
            value={debateOpenRows.length}
            trend="neutral"
            trendLabel="from discovery surfaces"
          />
          <HealthCard
            label="Opportunity Clicks"
            value={opportunityClickRows.length}
            trend="neutral"
            trendLabel="fellowship and opportunity interest"
          />
          <HealthCard
            label="Response Starts"
            value={responseStartedUsers.size}
            trend="neutral"
            trendLabel="reader-to-writer discovery outcome"
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Opportunity Outcomes
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Opportunity Views"
            value={opportunityListingOpens.length}
            trend="neutral"
            trendLabel="detail and listing opens"
          />
          <HealthCard
            label="Saved Opportunities"
            value={savedOpportunityCount ?? opportunitySavedRows.length}
            trend="neutral"
            trendLabel={`${opportunitySavedRows.length.toLocaleString()} tracked saves`}
          />
          <HealthCard
            label="Application Starts"
            value={opportunityApplyStartedRows.length}
            trend="neutral"
            trendLabel={`${pct(opportunityApplyStartedRows.length, opportunityListingOpens.length)} of views`}
          />
          <HealthCard
            label="Proof Attached"
            value={proofAttachedApplications}
            trend="neutral"
            trendLabel={`${pct(proofAttachedApplications, totalApplications ?? 0)} of applications`}
          />
          <HealthCard
            label="Public Opportunity Profiles"
            value={publicOpportunityProfiles}
            trend="neutral"
            trendLabel={`${pct(publicOpportunityProfiles, totalUsers)} of registered users`}
          />
          <HealthCard
            label="Readiness Complete"
            value={readinessCompleteProfiles}
            trend="neutral"
            trendLabel={`${pct(readinessCompleteProfiles, talentProfiles.length)} of opportunity profiles`}
          />
          <HealthCard
            label="Inquiries Submitted"
            value={totalTalentInquiries ?? 0}
            trend="neutral"
            trendLabel="persisted contact interest"
          />
          <HealthCard
            label="Opportunity Applications"
            value={totalApplications ?? 0}
            trend="neutral"
            trendLabel={`${opportunityApplySubmittedRows.length.toLocaleString()} tracked submits`}
          />
        </div>
        {topOpportunityConversions.length > 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Top opportunity conversions
            </h3>
            <div className="space-y-2">
              {topOpportunityConversions.map((item) => (
                <div
                  key={item.title}
                  className="flex items-center justify-between gap-3 rounded-lg bg-canvas px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900">{item.title}</p>
                    <p className="text-xs text-gray-500">
                      {item.proofCount} with ThinkAfrica proof
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    {item.count} applications
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Partner Discovery
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Talent Discovery Views"
            value={talentDiscoveryViews.length}
            trend="neutral"
            trendLabel="tracked talent directory opens"
          />
          <HealthCard
            label="Open Talent Profiles"
            value={openTalentProfiles}
            trend="neutral"
            trendLabel="public or partner-visible"
          />
          <HealthCard
            label="Opportunity-Ready Talent"
            value={readinessCompleteProfiles}
            trend="neutral"
            trendLabel={`${pct(readinessCompleteProfiles, openTalentProfiles)} of open profiles`}
          />
          <HealthCard
            label="Inquiry Starts"
            value={inquiryStartedRows.length}
            trend="neutral"
            trendLabel="partner outreach modal opened"
          />
          <HealthCard
            label="Inquiry Submissions"
            value={inquirySubmittedRows.length || totalTalentInquiries || 0}
            trend="neutral"
            trendLabel={`${pct(inquirySubmittedRows.length || totalTalentInquiries || 0, inquiryStartedRows.length)} conversion from starts`}
          />
          <HealthCard
            label="Structured Outreach"
            value={structuredInquiryCount}
            trend="neutral"
            trendLabel={`${pct(structuredInquiryCount, totalTalentInquiries ?? 0)} include fit context`}
          />
          <HealthCard
            label="New Inquiries"
            value={inquiryStatusCounts.new ?? 0}
            trend="neutral"
            trendLabel="unread opportunity interest"
          />
          <HealthCard
            label="Read / Archived"
            value={`${(inquiryStatusCounts.read ?? 0).toLocaleString()} / ${(inquiryStatusCounts.archived ?? 0).toLocaleString()}`}
            trend="neutral"
            trendLabel="recipient triage status"
          />
        </div>
        {topInquiryTypes.length > 0 ? (
          <div className="mt-4 rounded-xl border border-gray-200 bg-white p-5">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Common outreach types
            </h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {topInquiryTypes.map(([type, count]) => (
                <div
                  key={type}
                  className="rounded-lg bg-canvas px-3 py-2 text-sm"
                >
                  <p className="font-semibold text-gray-900">
                    {type === "unspecified" ? "Unspecified" : getOpportunityShortLabel(type)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {count.toLocaleString()} {count === 1 ? "inquiry" : "inquiries"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Application Review
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Pending Review"
            value={applicationStatusCounts.pending ?? 0}
            trend="neutral"
            trendLabel="waiting for admin decision"
          />
          <HealthCard
            label="Shortlisted"
            value={applicationStatusCounts.shortlisted ?? 0}
            trend="neutral"
            trendLabel={`${pct(applicationStatusCounts.shortlisted ?? 0, totalApplications ?? 0)} shortlist rate`}
          />
          <HealthCard
            label="Accepted"
            value={applicationStatusCounts.accepted ?? 0}
            trend="neutral"
            trendLabel={`${pct(applicationStatusCounts.accepted ?? 0, totalApplications ?? 0)} acceptance rate`}
          />
          <HealthCard
            label="Rejected"
            value={applicationStatusCounts.rejected ?? 0}
            trend="neutral"
            trendLabel="closed application decisions"
          />
          <HealthCard
            label="Proof Attached Rate"
            value={pct(proofAttachedApplications, totalApplications ?? 0)}
            trend="neutral"
            trendLabel={`${proofAttachedApplications.toLocaleString()} applications with proof`}
          />
          <HealthCard
            label="Reviewed Proof Rate"
            value={pct(reviewedProofApplications, proofAttachedApplications)}
            trend="neutral"
            trendLabel="citable or reviewed-format proof"
          />
          <HealthCard
            label="Avg Review Time"
            value={reviewedApplicationDurations.length > 0 ? `${avgApplicationReviewDays}d` : "-"}
            trend="neutral"
            trendLabel={`${reviewedApplicationDurations.length.toLocaleString()} reviewed applications`}
          />
          <HealthCard
            label="Decisioned"
            value={
              (applicationStatusCounts.shortlisted ?? 0) +
              (applicationStatusCounts.accepted ?? 0) +
              (applicationStatusCounts.rejected ?? 0)
            }
            trend="neutral"
            trendLabel="non-pending applications"
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Profile Credibility
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Complete Profiles"
            value={completeProfileCount}
            trend="neutral"
            trendLabel={`${pct(completeProfileCount, totalUsers)} of registered users`}
          />
          <HealthCard
            label="Partial Academic Profiles"
            value={partialProfileCount}
            trend="neutral"
            trendLabel="has identity plus at least one academic signal"
          />
          <HealthCard
            label="Verified Profiles"
            value={verifiedProfiles}
            trend="neutral"
            trendLabel={`${pct(verifiedProfiles, totalUsers)} of registered users`}
          />
          <HealthCard
            label="Featured Work Profiles"
            value={featuredProfileCount ?? 0}
            trend="neutral"
            trendLabel="manual portfolio curation"
          />
          <HealthCard
            label="Citable Author Profiles"
            value={citableProfileUsers.size}
            trend="neutral"
            trendLabel="at least one citable post"
          />
          <HealthCard
            label="Reviewed Author Profiles"
            value={reviewedProfileUsers.size}
            trend="neutral"
            trendLabel="reviewed format or citation"
          />
          <HealthCard
            label="Opportunity-ready Profiles"
            value={readinessCompleteProfiles}
            trend="neutral"
            trendLabel="ready for selector review"
          />
          <HealthCard
            label="Published Profiles"
            value={publishedAtLeastOnce}
            trend="neutral"
            trendLabel={`${publishedOncePercent}% of registered users`}
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Collaboration Loop
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <HealthCard
            label="Response Starts"
            value={responseStarts}
            trend="neutral"
            trendLabel="public collaboration intent"
          />
          <HealthCard
            label="Coauthor Invites"
            value={coauthorInvitesSent}
            trend="neutral"
            trendLabel={`${coauthorInvitesAccepted} accepted`}
          />
          <HealthCard
            label="Accepted Coauthors"
            value={acceptedCoauthorCount ?? 0}
            trend="neutral"
            trendLabel="published or draft authorship"
          />
          <HealthCard
            label="Messages Sent"
            value={Math.max(totalMessages ?? 0, messageSentEvents)}
            trend="neutral"
            trendLabel={`${pct(collaborationUsers.size, totalUsers)} collaboration conversion`}
          />
        </div>
      </div>

      <div className="mb-10">
        <h2 className="text-base font-semibold text-gray-900 mb-4">
          Promising Posts
        </h2>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          {promisingPosts.length > 0 ? (
            <div className="space-y-3">
              {promisingPosts.map((post) => (
                <div
                  key={post.id}
                  className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-canvas px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                        Score {post.qualityScore}
                      </span>
                      <span className="text-xs font-medium text-gray-500">
                        {post.reason}
                      </span>
                    </div>
                    <Link
                      href={`/post/${post.slug}`}
                      className="line-clamp-1 text-sm font-semibold text-gray-900 hover:text-emerald-700"
                    >
                      {post.title}
                    </Link>
                    <p className="mt-1 text-xs text-gray-500">
                      {post.author?.full_name ?? post.author?.username ?? "Unknown author"} /{" "}
                      {post.referenceCount} refs / {post.responseCount} responses /{" "}
                      {post.commentCount} comments / {post.bookmarkCount} saves
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Link
                      href={`/post/${post.slug}`}
                      className="rounded-lg bg-emerald-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600"
                    >
                      Open post
                    </Link>
                    {post.author?.username ? (
                      <Link
                        href={`/${post.author.username}`}
                        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:border-emerald-200 hover:text-emerald-700"
                      >
                        Author
                      </Link>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500">
              Promising posts will appear after published work gains quality signals.
            </p>
          )}
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
        <StatCard label="Opportunity Applications" value={totalApplications ?? 0} />
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

import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import FeedSkeleton from "@/components/post/FeedSkeleton";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import PushPromptBanner from "@/components/push/PushPromptBanner";
import HomeSidebar from "@/components/ui/HomeSidebar";
import WelcomeBanner from "@/components/ui/WelcomeBanner";
import type { LegacyPushPromptSeed } from "@/lib/pushPromptPolicy";
import { getActivationState, type ActivationState } from "@/lib/activation";
import { getProfileTypeLabel, isProfileType } from "@/lib/profileTypes";
import { getFeedSurfaceReason, getQualityScore } from "@/lib/postQuality";
import { getSuggestedPeople, type SuggestedPeopleResult } from "@/lib/suggestedPeople";
import {
  getActiveDebate,
  getEngagementCounts,
  getFeaturedPostCandidates,
  toDebateInterludeData,
  uniqueFeaturedPosts,
  type FeaturedPostRow as FeaturedPostRaw,
} from "@/lib/dailyBrief";
import PostsFeedSection from "./PostsFeedSection";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";
import {
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
} from "@/lib/featureFlags";
import type { SubscriptionFeedSource } from "@/lib/publicationDelivery";
import { normalizeMyPrivateProfile } from "@/lib/profilePrivate";
import { BRAND_PROMISE, BRAND_SEO_DESCRIPTION } from "@/lib/brand";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Build Your Intellectual Identity",
  description: BRAND_SEO_DESCRIPTION,
  alternates: { canonical: canonicalPath("/landing") },
  openGraph: {
    title: `Indegenius | ${BRAND_PROMISE}`,
    description: BRAND_SEO_DESCRIPTION,
    url: absoluteUrl("/landing"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: `Indegenius | ${BRAND_PROMISE}`,
    description: BRAND_SEO_DESCRIPTION,
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

interface PageProps {
  searchParams: Promise<{
    guest?: string;
    tab?: string;
    type?: string;
    timeframe?: string;
    source?: string;
    welcome?: string;
  }>;
}

const DEFAULT_SIDEBAR_TOPICS = [
  "Climate Policy",
  "Labour Law",
  "Gender Studies",
  "Public Health",
  "Economic Development",
  "Legal Theory",
  "African Philosophy",
  "Tech & Society",
  "Education Reform",
  "Urban Planning",
];

function logHomeQueryError(
  label: string,
  error?: { message?: string } | null
) {
  if (!error) return;
  console.error(`[home] ${label} query failed`, error);
}

function deriveSidebarTopics({
  userInterests,
  featuredPosts,
}: {
  userInterests: string[];
  featuredPosts: Array<{ tags: string[] | null }>;
}) {
  const scores = new Map<string, number>();

  for (const tag of userInterests) {
    scores.set(tag, (scores.get(tag) ?? 0) + 4);
  }

  for (const post of featuredPosts) {
    for (const tag of post.tags ?? []) {
      scores.set(tag, (scores.get(tag) ?? 0) + 2);
    }
  }

  const ranked = Array.from(scores.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([tag]) => tag)
    .filter(Boolean);

  return Array.from(new Set([...ranked, ...DEFAULT_SIDEBAR_TOPICS])).slice(0, 10);
}

export default async function HomePage({ searchParams }: PageProps) {
  const { guest, tab, type, timeframe, source, welcome } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && guest !== "1") {
    redirect("/landing");
  }

  // Content-kind filtering moved off the home feed and onto Explore, which
  // already had the same four filters plus a genre refinement underneath.
  // Hand old `/?type=research` links over rather than dropping the filter
  // silently: without the chips there is no longer any control on this page
  // that could show such a filter is active or clear it, so honouring the
  // param here would strand the reader in a narrowed feed with no way out.
  // The raw value is passed through untouched because Explore reads the same
  // `?type=` names and additionally maps the pre-content-model ones
  // (`blog`, `essay`, `policy_brief`) that may still be sitting in bookmarks.
  if (type && type !== "all") {
    redirect(`/explore?type=${encodeURIComponent(type)}`);
  }

  const showWelcomeBanner = Boolean(user) && welcome === "1";

  const draftCutoff = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  // The viewer's profile is only read after this batch resolves (interests
  // feed the featured-post ranking below), so it belongs in the batch rather
  // than in front of it -- fetching it first made the home page wait on a
  // round trip before it even started loading the feed.
  const [
    { data: profileData },
    { data: followedUsers },
    hotDebateResult,
    { data: recentDraft },
    featuredCandidates,
    { data: topicSubscriptions },
    { data: authorSubscriptions },
    { data: privateProfileRaw },
  ] = await Promise.all([
    user
      ? supabase
          .from("profiles")
          .select(
            "interests, university, field_of_study, full_name, profile_type"
          )
          .eq("id", user.id)
          .single()
      : Promise.resolve({ data: null }),

    user
      ? supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
      : Promise.resolve({ data: [], error: null }),

    getActiveDebate(supabase),

    user
      ? supabase
          .from("posts")
          .select("id, title, updated_at, type, content_kind")
          .eq("author_id", user.id)
          .eq("status", "draft")
          .gte("updated_at", draftCutoff)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    getFeaturedPostCandidates(supabase),

    user && isTopicSubscriptionsEnabled()
      ? supabase
          .from("topic_subscriptions")
          .select("topic_key")
          .eq("subscriber_id", user.id)
          .limit(1000)
      : Promise.resolve({ data: [] as Array<{ topic_key: string }> }),
    user && isAuthorSubscriptionsUxV2Enabled()
      ? supabase
          .from("author_subscriptions")
          .select("author_id")
          .eq("subscriber_id", user.id)
          .limit(1000)
      : Promise.resolve({ data: [] as Array<{ author_id: string }> }),
    user
      ? supabase.rpc("get_my_profile_private")
      : Promise.resolve({ data: null, error: null }),
  ]);

  const userInterests = (profileData?.interests as string[] | null) ?? [];
  const userUniversity = profileData?.university ?? null;
  const userFieldOfStudy = profileData?.field_of_study ?? null;
  const welcomeFirstName =
    profileData?.full_name?.trim().split(/\s+/)[0] ?? null;
  const welcomePrimaryLabel = isProfileType(profileData?.profile_type)
    ? getProfileTypeLabel(profileData.profile_type)
    : null;
  const privateProfile = normalizeMyPrivateProfile(privateProfileRaw);
  const legacyPushSeed: LegacyPushPromptSeed = {
    attemptCount: privateProfile?.push_prompt_attempt_count ?? 0,
    lastShownAt: privateProfile?.push_prompt_last_shown_at ?? null,
    shownAt: privateProfile?.push_prompt_shown_at ?? null,
  };

  const { manualFeaturedResult, recentFeaturedCandidatesResult, latestPublishedResult } =
    featuredCandidates;
  const hotDebateRaw = hotDebateResult.data;

  logHomeQueryError("manual featured post", manualFeaturedResult.error);
  logHomeQueryError(
    "recent featured candidates",
    recentFeaturedCandidatesResult.error
  );
  logHomeQueryError("latest published fallback", latestPublishedResult.error);

  const followedIds = (followedUsers ?? []).map(
    (row: { following_id: string }) => row.following_id
  );
  const topicSubscriptionKeys = (topicSubscriptions ?? []).map(
    (row: { topic_key: string }) => row.topic_key
  );
  const authorSubscriptionIds = (authorSubscriptions ?? []).map(
    (row: { author_id: string }) => row.author_id
  );
  const followCount = followedIds.length;

  const homeDebate: DebateInterludeData | null = toDebateInterludeData(hotDebateRaw);

  const manualFeaturedRaw =
    (manualFeaturedResult.data as FeaturedPostRaw | null) ?? null;
  const latestPublishedRaw =
    (latestPublishedResult.data as FeaturedPostRaw | null) ?? null;
  const recentFeaturedCandidatesRaw =
    (recentFeaturedCandidatesResult.data ?? []) as FeaturedPostRaw[];
  const featuredPostsRaw = uniqueFeaturedPosts([
    ...(manualFeaturedRaw ? [manualFeaturedRaw] : []),
    ...recentFeaturedCandidatesRaw,
    ...(latestPublishedRaw ? [latestPublishedRaw] : []),
  ]);
  const featuredPostsNorm = featuredPostsRaw.map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
  }));

  const featuredIds = featuredPostsNorm.map((post) => post.id);
  const { referenceCounts, bookmarkCounts, responseCounts } =
    await getEngagementCounts(supabase, featuredIds);
  const qualityRankedFeaturedPosts = featuredPostsNorm
    .map((post) => {
      const interestMatch = Boolean(
        post.tags?.some((tag) => userInterests.includes(tag))
      );
      const qualityInput = {
        type: post.type,
        citationId: post.citation_id,
        publishedVersionId: post.published_version_id,
        referenceCount: referenceCounts[post.id] ?? 0,
        responseCount: responseCounts[post.id] ?? 0,
        bookmarkCount: bookmarkCounts[post.id] ?? 0,
        viewCount: post.view_count,
        publishedAt: post.published_at,
        tags: post.tags,
        author: post.profiles,
        followedAuthor: followedIds.includes(post.author_id),
        interestMatch,
      };

      return {
        ...post,
        quality_reason: getFeedSurfaceReason(qualityInput),
        quality_score: getQualityScore(qualityInput),
      };
    })
    .sort((left, right) => right.quality_score - left.quality_score);

  const manualFeaturedPost = qualityRankedFeaturedPosts.find(
    (post) => post.id === manualFeaturedRaw?.id
  );
  const automaticFeaturedPost =
    qualityRankedFeaturedPosts.find(
      (post) => post.id !== manualFeaturedPost?.id
    ) ?? null;
  const featuredPost = manualFeaturedPost ?? automaticFeaturedPost;

  // A second, distinct candidate for the sidebar's "Featured today" card --
  // never the same record as the main Editor's Pick lead. Reuses the
  // already-fetched/ranked candidate pool (no extra query). If every
  // candidate was already used as the lead, there's nothing distinct left
  // to show, so the card is omitted rather than duplicating it.
  const featuredTodayPost =
    qualityRankedFeaturedPosts.find((post) => post.id !== featuredPost?.id) ?? null;

  const sidebarTopics = deriveSidebarTopics({
    userInterests,
    featuredPosts: qualityRankedFeaturedPosts,
  });

  let peopleResult: SuggestedPeopleResult = { suggestions: [], reason: "" };
  let activationState: ActivationState | null = null;

  if (user) {
    [peopleResult, activationState] = await Promise.all([
      getSuggestedPeople(supabase, {
        currentUserId: user.id,
        university: userUniversity,
        fieldOfStudy: userFieldOfStudy,
        limit: 3,
      }),
      getActivationState(supabase, user.id),
    ]);
  }

  const showFollowingEligible = !!user;
  const showSubscriptionsEligible =
    Boolean(user) && isAuthorSubscriptionsUxV2Enabled();
  const showTopicsEligible =
    Boolean(user) &&
    isTopicSubscriptionsEnabled() &&
    !showSubscriptionsEligible;
  const subscriptionSource: SubscriptionFeedSource =
    source === "authors" || source === "topics" ? source : "all";
  const activeTab =
    tab === "following" && showFollowingEligible
      ? "following"
      : (tab === "subscriptions" || tab === "topics") &&
          showSubscriptionsEligible
        ? "subscriptions"
      : tab === "topics" && showTopicsEligible
        ? "topics"
      : tab === "latest"
        ? "latest"
        : "home";

  return (
    <div>
      {showWelcomeBanner ? (
        <WelcomeBanner
          firstName={welcomeFirstName ?? "there"}
          primaryLabel={welcomePrimaryLabel}
        />
      ) : null}

      {user ? <PushPromptBanner userId={user.id} legacySeed={legacyPushSeed} /> : null}

      {user ? (
        <RetentionEventTracker
          event="home_viewed"
          metadata={{ tab: activeTab, activated: Boolean(activationState?.activated) }}
        />
      ) : null}

      {/* Below xl there is no rail, so the feed keeps its capped, centered
          layout. At xl the rail already consumes the left edge, so the feed
          goes fluid and fills the column instead of centering inside it --
          the old justify-center was throwing away ~130px on wide screens. */}
      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,744px)_minmax(288px,304px)] lg:justify-center lg:gap-6 xl:grid-cols-[minmax(0,800px)_304px] xl:justify-center xl:gap-7">
        <div className="min-w-0">
          <Suspense fallback={<FeedSkeleton />}>
            <PostsFeedSection
              tab={activeTab}
              type={type ?? null}
              timeframe={timeframe ?? null}
              userId={user?.id ?? null}
              userInterests={userInterests}
              userUniversity={userUniversity}
              followedIds={followedIds}
              authorSubscriptionIds={authorSubscriptionIds}
              topicSubscriptionKeys={topicSubscriptionKeys}
              subscriptionSource={
                tab === "topics" && showSubscriptionsEligible
                  ? "topics"
                  : subscriptionSource
              }
              showFollowingEligible={showFollowingEligible}
              showTopicsEligible={showTopicsEligible}
              showSubscriptionsEligible={showSubscriptionsEligible}
              activeDebate={homeDebate}
              peopleSuggestions={peopleResult.suggestions}
              peopleSuggestionReason={peopleResult.reason}
              prioritizePeopleSuggestions={followCount < 3}
              featuredPost={featuredPost}
            />
          </Suspense>
        </div>

        {/* The rail can stack five cards (draft or activation, featured today,
            debate, people, topics), which runs past 800px -- taller than the
            ~700px of usable height on a 1366x768 laptop. A plain sticky top
            pins the first card and puts everything below the fold permanently
            out of reach, rendered but unscrollable. Capping the height to what
            is actually on screen and letting the column scroll inside itself
            keeps the lower cards reachable; when the content is shorter than
            the cap, which is the common case, nothing changes at all. */}
        <aside className="hidden self-start lg:sticky lg:top-[var(--app-sticky-offset)] lg:block lg:max-h-[calc(100svh-var(--app-sticky-offset)-1rem)] lg:overflow-y-auto lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
          <HomeSidebar
            activeDebate={homeDebate}
            recentDraft={recentDraft ?? null}
            activationState={activationState}
            featuredToday={featuredTodayPost}
            peopleSuggestions={peopleResult.suggestions}
            currentUserId={user?.id ?? null}
            topics={sidebarTopics}
          />
        </aside>
      </div>
    </div>
  );
}

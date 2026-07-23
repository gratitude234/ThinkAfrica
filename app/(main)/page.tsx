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
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl, canonicalPath } from "@/lib/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "African Student Posts, Articles and Research",
  description:
    "Discover posts, articles, research, debates, and policy ideas from African students and scholars.",
  alternates: { canonical: canonicalPath("/") },
  openGraph: {
    title: "Indegenius - Africa's Intellectual Social Network",
    description:
      "Discover posts, articles, research, debates, and policy ideas from African students and scholars.",
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Indegenius - Africa's Intellectual Social Network",
    description:
      "Discover posts, articles, research, debates, and policy ideas from African students and scholars.",
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

interface PageProps {
  searchParams: Promise<{
    guest?: string;
    tab?: string;
    type?: string;
    timeframe?: string;
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
  const { guest, tab, type, timeframe, welcome } = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && guest !== "1") {
    redirect("/landing");
  }

  let userInterests: string[] = [];
  let userUniversity: string | null = null;
  let userFieldOfStudy: string | null = null;
  let welcomeFirstName: string | null = null;
  let welcomePrimaryLabel: string | null = null;
  let legacyPushSeed: LegacyPushPromptSeed = {
    attemptCount: 0,
    lastShownAt: null,
    shownAt: null,
  };

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select(
        "interests, university, field_of_study, full_name, profile_type, push_prompt_attempt_count, push_prompt_last_shown_at, push_prompt_shown_at"
      )
      .eq("id", user.id)
      .single();

    userInterests = (profileData?.interests as string[] | null) ?? [];
    userUniversity = profileData?.university ?? null;
    userFieldOfStudy = profileData?.field_of_study ?? null;
    welcomeFirstName = profileData?.full_name?.trim().split(/\s+/)[0] ?? null;
    welcomePrimaryLabel = isProfileType(profileData?.profile_type)
      ? getProfileTypeLabel(profileData.profile_type)
      : null;

    legacyPushSeed = {
      attemptCount: profileData?.push_prompt_attempt_count ?? 0,
      lastShownAt: profileData?.push_prompt_last_shown_at ?? null,
      shownAt: profileData?.push_prompt_shown_at ?? null,
    };
  }

  const showWelcomeBanner = Boolean(user) && welcome === "1";

  const draftCutoff = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: followedUsers },
    hotDebateResult,
    { data: recentDraft },
    featuredCandidates,
  ] = await Promise.all([
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
  ]);

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
  const activeTab =
    tab === "following" && showFollowingEligible
      ? "following"
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

      <div className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,700px)_minmax(280px,304px)] lg:justify-center lg:gap-8 xl:gap-10">
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
              showFollowingEligible={showFollowingEligible}
              activeDebate={homeDebate}
              peopleSuggestions={peopleResult.suggestions}
              peopleSuggestionReason={peopleResult.reason}
              prioritizePeopleSuggestions={followCount < 3}
              featuredPost={featuredPost}
            />
          </Suspense>
        </div>

        <aside className="hidden self-start lg:sticky lg:top-[76px] lg:block">
          <HomeSidebar
            activeDebate={homeDebate}
            recentDraft={recentDraft ?? null}
            activationState={activationState}
            peopleSuggestions={peopleResult.suggestions}
            currentUserId={user?.id ?? null}
            topics={sidebarTopics}
          />
        </aside>
      </div>
    </div>
  );
}

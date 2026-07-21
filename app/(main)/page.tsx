import { Suspense } from "react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import PushPromptBanner from "@/components/push/PushPromptBanner";
import HomeSidebar from "@/components/ui/HomeSidebar";
import WelcomeBanner from "@/components/ui/WelcomeBanner";
import type { LegacyPushPromptSeed } from "@/lib/pushPromptPolicy";
import { getActivationState, type ActivationState } from "@/lib/activation";
import { getProfileTypeLabel, isProfileType } from "@/lib/profileTypes";
import { getFeedSurfaceReason, getQualityScore } from "@/lib/postQuality";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import { getSuggestedPeople, type SuggestedPeopleResult } from "@/lib/suggestedPeople";
import {
  getActiveDebate,
  getEngagementCounts,
  getFeaturedPostCandidates,
  toDebateInterludeData,
  uniqueFeaturedPosts,
  type FeaturedPostRow as FeaturedPostRaw,
} from "@/lib/dailyBrief";
import DailyBriefStrip from "./DailyBriefStrip";
import EditorPicksRow from "./EditorPicksRow";
import FeaturedPostLead from "./FeaturedPostLead";
import LatestResearchShelf, { type LatestResearchItem } from "./LatestResearchShelf";
import PostsFeedSection from "./PostsFeedSection";
import { DEFAULT_OG_IMAGE, SITE_NAME, SITE_URL, absoluteUrl, canonicalPath } from "@/lib/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "African Student Essays, Research and Policy Ideas",
  description:
    "Indegenius is an intellectual social network for African student essays, research, debates, and policy ideas.",
  alternates: { canonical: canonicalPath("/") },
  openGraph: {
    title: "Indegenius - Africa's Intellectual Social Network",
    description:
      "Indegenius is an intellectual social network for African student essays, research, debates, and policy ideas.",
    url: SITE_URL,
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Indegenius - Africa's Intellectual Social Network",
    description:
      "Indegenius is an intellectual social network for African student essays, research, debates, and policy ideas.",
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

type FeaturedSource = "manual" | "automatic";

interface VoicePostRaw {
  author_id: string;
  published_at: string | null;
  profiles: VoiceProfile | VoiceProfile[] | null;
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

interface VoiceProfile {
  username: string | null;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

function FeedSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="rounded-2xl border border-gray-100 bg-white p-5"
        >
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-full bg-gray-200" />
              <div className="h-3 w-32 rounded bg-gray-200" />
              <div className="ml-auto h-3 w-12 rounded bg-gray-100" />
            </div>
            <div className="h-5 w-20 rounded-full bg-gray-200" />
            <div className="h-5 w-4/5 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-100" />
            <div className="h-4 w-3/4 rounded bg-gray-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

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
  latestResearch,
}: {
  userInterests: string[];
  featuredPosts: Array<{ tags: string[] | null }>;
  latestResearch: Array<{ tags: string[] | null }>;
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

  for (const paper of latestResearch) {
    for (const tag of paper.tags ?? []) {
      scores.set(tag, (scores.get(tag) ?? 0) + 1);
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
  let userPoints: number | null = null;
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
        "interests, university, field_of_study, points, full_name, profile_type, push_prompt_attempt_count, push_prompt_last_shown_at, push_prompt_shown_at"
      )
      .eq("id", user.id)
      .single();

    userInterests = (profileData?.interests as string[] | null) ?? [];
    userUniversity = profileData?.university ?? null;
    userFieldOfStudy = profileData?.field_of_study ?? null;
    userPoints = profileData?.points ?? null;
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
    newVoiceResult,
    latestResearchResult,
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
          .select("id, title, updated_at")
          .eq("author_id", user.id)
          .eq("status", "draft")
          .gte("updated_at", draftCutoff)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),

    getFeaturedPostCandidates(supabase),

    supabase
      .from("posts")
      .select(
        `
        author_id,
        published_at,
        profiles!posts_author_id_fkey (username, full_name, university, avatar_url)
      `
      )
      .eq("status", "published")
      .gte(
        "published_at",
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      )
      .limit(50),

    supabase
      .from("posts")
      .select(
        `
        id, title, slug, excerpt, tags, citation_id, document_size_bytes, published_at,
        profiles!posts_author_id_fkey (username, full_name, university)
      `
      )
      .eq("status", "published")
      .eq("type", "research")
      .order("published_at", { ascending: false })
      .limit(12),
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
  logHomeQueryError("new voice", newVoiceResult.error);
  logHomeQueryError("latest research", latestResearchResult.error);

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
  const newVoiceRaw = (newVoiceResult.data ?? []) as VoicePostRaw[];
  const latestResearchRaw = (latestResearchResult.data ?? []) as Array<
    Omit<LatestResearchItem, "profiles"> & {
      profiles: LatestResearchItem["profiles"] | LatestResearchItem["profiles"][];
    }
  >;

  const featuredPostsNorm = featuredPostsRaw.map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
  }));

  const featuredIds = featuredPostsNorm.map((post) => post.id);
  const { referenceCounts, commentCounts, bookmarkCounts, responseCounts } =
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
        commentCount: commentCounts[post.id] ?? 0,
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
  const featuredSource: FeaturedSource =
    manualFeaturedPost && featuredPost?.id === manualFeaturedPost.id
      ? "manual"
      : "automatic";
  const editorPicks = qualityRankedFeaturedPosts
    .filter((post) => post.id !== featuredPost?.id)
    .slice(0, 2);
  const newVoiceAuthorIds = Array.from(
    new Set(
      newVoiceRaw
        .map((row) => row.author_id)
        .filter((authorId) => authorId && authorId !== featuredPost?.author_id)
    )
  );
  const { data: newVoiceTotalRows } =
    newVoiceAuthorIds.length > 0
      ? await supabase
          .from("posts")
          .select("author_id")
          .eq("status", "published")
          .in("author_id", newVoiceAuthorIds)
      : { data: [] };
  const totalPostsByAuthor = (newVoiceTotalRows ?? []).reduce(
    (acc: Record<string, number>, row: { author_id?: string }) => {
      if (!row.author_id) return acc;
      acc[row.author_id] = (acc[row.author_id] ?? 0) + 1;
      return acc;
    },
    {}
  );

  const voiceCounts = new Map<
    string,
    {
      count: number;
      totalPosts: number;
      firstPublishedAt: string | null;
      profile: VoiceProfile | null;
    }
  >();

  for (const row of newVoiceRaw) {
    if (!row.author_id || row.author_id === featuredPost?.author_id) continue;
    const profile = Array.isArray(row.profiles)
      ? row.profiles[0] ?? null
      : row.profiles;
    const existing = voiceCounts.get(row.author_id);
    voiceCounts.set(row.author_id, {
      count: (existing?.count ?? 0) + 1,
      totalPosts: totalPostsByAuthor[row.author_id] ?? existing?.totalPosts ?? 1,
      firstPublishedAt:
        !existing?.firstPublishedAt ||
        (row.published_at &&
          new Date(row.published_at).getTime() <
            new Date(existing.firstPublishedAt).getTime())
          ? row.published_at
          : existing.firstPublishedAt,
      profile,
    });
  }

  const newVoice =
    Array.from(voiceCounts.values()).sort((left, right) => {
      if (left.totalPosts !== right.totalPosts) {
        return left.totalPosts - right.totalPosts;
      }
      if (left.count !== right.count) return right.count - left.count;
      return (
        new Date(right.firstPublishedAt ?? 0).getTime() -
        new Date(left.firstPublishedAt ?? 0).getTime()
      );
    })[0] ?? null;

  const latestResearch = latestResearchRaw
    .map((paper) => ({
      ...paper,
      profiles: Array.isArray(paper.profiles)
        ? paper.profiles[0] ?? null
        : paper.profiles,
    }))
    .sort((left, right) => {
      const score = (paper: LatestResearchItem) => {
        const interestMatch = Boolean(
          paper.tags?.some((tag) => userInterests.includes(tag))
        );
        const universityMatch = Boolean(
          userUniversity &&
            paper.profiles?.university &&
            paper.profiles.university === userUniversity
        );
        return (
          (paper.citation_id ? 100 : 0) +
          (interestMatch ? 25 : 0) +
          (universityMatch ? 20 : 0) +
          new Date(paper.published_at ?? 0).getTime() / 100000000000
        );
      };

      return score(right) - score(left);
    })
    .slice(0, 3);

  const sidebarTopics = deriveSidebarTopics({
    userInterests,
    featuredPosts: qualityRankedFeaturedPosts,
    latestResearch,
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
      : tab === "latest" || (!user && !tab)
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

      {user ? (
        <DailyBriefStrip
          featuredPost={
            featuredPost
              ? {
                  title: getPostMetadataTitle(featuredPost, featuredPost.profiles),
                  slug: featuredPost.slug,
                }
              : null
          }
          activeDebate={homeDebate}
          points={userPoints}
        />
      ) : null}

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_296px]">
        <div className="min-w-0">
          <FeaturedPostLead
            post={featuredPost}
            label={
              featuredSource === "manual" ? "Editor's pick" : "Featured today"
            }
          />

          {user ? <EditorPicksRow picks={editorPicks} /> : null}

          <LatestResearchShelf papers={latestResearch} />

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
            />
          </Suspense>
        </div>

        <aside className="hidden self-start lg:sticky lg:top-[76px] lg:block">
          <HomeSidebar
            activeDebate={homeDebate}
            newVoice={newVoice}
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

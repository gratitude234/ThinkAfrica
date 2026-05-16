import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import HomeSidebar from "@/components/ui/HomeSidebar";
import { getActivationState, type ActivationState } from "@/lib/activation";
import { getFeedSurfaceReason, getQualityScore } from "@/lib/postQuality";
import { getSuggestedPeople, type SuggestedPeopleResult } from "@/lib/suggestedPeople";
import ActivationFocusPanel from "./ActivationFocusPanel";
import DailyBriefStrip from "./DailyBriefStrip";
import EditorPicksRow from "./EditorPicksRow";
import FeaturedPostLead from "./FeaturedPostLead";
import PostsFeedSection from "./PostsFeedSection";

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{
    guest?: string;
    tab?: string;
    type?: string;
    timeframe?: string;
  }>;
}

interface FeaturedProfile {
  username: string | null;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  verified?: boolean;
}

interface FeaturedPostRaw {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  type: string;
  excerpt: string | null;
  tags: string[] | null;
  cover_image_url: string | null;
  view_count: number | null;
  featured?: boolean | null;
  published_at: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  profiles: FeaturedProfile | FeaturedProfile[] | null;
}

type FeaturedSource = "manual" | "automatic";

interface VoicePostRaw {
  author_id: string;
  published_at: string | null;
  profiles: VoiceProfile | VoiceProfile[] | null;
}

interface UpcomingWebinar {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  attendee_count: number | null;
  tags: string[] | null;
  profiles:
    | {
        username: string | null;
        full_name: string | null;
        university: string | null;
        avatar_url: string | null;
      }
    | Array<{
        username: string | null;
        full_name: string | null;
        university: string | null;
        avatar_url: string | null;
      }>
    | null;
}

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

const FEATURED_POST_SELECT = `
  id, author_id, title, slug, type, excerpt, tags, cover_image_url, view_count, featured, published_at, citation_id, published_version_id,
  profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified)
`;

function logHomeQueryError(
  label: string,
  error?: { message?: string } | null
) {
  if (!error) return;
  console.error(`[home] ${label} query failed`, error);
}

function uniqueFeaturedPosts(posts: FeaturedPostRaw[]) {
  const seen = new Set<string>();
  return posts.filter((post) => {
    if (seen.has(post.id)) return false;
    seen.add(post.id);
    return true;
  });
}

export default async function HomePage({ searchParams }: PageProps) {
  const { guest, tab, type, timeframe } = await searchParams;
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

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("interests, university, field_of_study, points")
      .eq("id", user.id)
      .single();

    userInterests = (profileData?.interests as string[] | null) ?? [];
    userUniversity = profileData?.university ?? null;
    userFieldOfStudy = profileData?.field_of_study ?? null;
    userPoints = profileData?.points ?? null;
  }

  const draftCutoff = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString();
  const featuredFallbackCutoff = new Date(
    Date.now() - 30 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { data: followedUsers },
    { data: hotDebateRaw },
    { data: recentDraft },
    manualFeaturedResult,
    recentFeaturedCandidatesResult,
    latestPublishedResult,
    upcomingWebinarResult,
    newVoiceResult,
  ] = await Promise.all([
    user
      ? supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
      : Promise.resolve({ data: [], error: null }),

    supabase
      .from("debates")
      .select(
        "id, title, status, ends_at, motion_for_count, motion_against_count, debate_arguments(count)"
      )
      .in("status", ["open", "active"])
      .order("status", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

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

    supabase
      .from("posts")
      .select(FEATURED_POST_SELECT)
      .eq("status", "published")
      .eq("featured", true)
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("posts")
      .select(FEATURED_POST_SELECT)
      .eq("status", "published")
      .gte("published_at", featuredFallbackCutoff)
      .order("view_count", { ascending: false })
      .order("published_at", { ascending: false })
      .limit(12),

    supabase
      .from("posts")
      .select(FEATURED_POST_SELECT)
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("webinars")
      .select(
        "id, title, status, scheduled_at, attendee_count, tags, profiles!webinars_host_id_fkey (username, full_name, university, avatar_url)"
      )
      .in("status", ["scheduled", "live"])
      .gte("scheduled_at", new Date().toISOString())
      .order("status", { ascending: true })
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),

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
  ]);

  logHomeQueryError("manual featured post", manualFeaturedResult.error);
  logHomeQueryError(
    "recent featured candidates",
    recentFeaturedCandidatesResult.error
  );
  logHomeQueryError("latest published fallback", latestPublishedResult.error);
  logHomeQueryError("upcoming webinar", upcomingWebinarResult.error);
  logHomeQueryError("new voice", newVoiceResult.error);

  const followedIds = (followedUsers ?? []).map(
    (row: { following_id: string }) => row.following_id
  );
  const followCount = followedIds.length;

  const hotDebateArgumentCount = hotDebateRaw?.debate_arguments
    ? Array.isArray(hotDebateRaw.debate_arguments)
      ? ((hotDebateRaw.debate_arguments[0] as unknown as { count: number })
          ?.count ?? 0)
      : 0
    : 0;

  const homeDebate: DebateInterludeData | null = hotDebateRaw
    ? {
        id: hotDebateRaw.id,
        title: hotDebateRaw.title,
        status: hotDebateRaw.status,
        endsAt: hotDebateRaw.ends_at,
        argumentCount: hotDebateArgumentCount,
        motionForCount: hotDebateRaw.motion_for_count ?? 0,
        motionAgainstCount: hotDebateRaw.motion_against_count ?? 0,
      }
    : null;

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
  const upcomingWebinarRaw =
    (upcomingWebinarResult.data as UpcomingWebinar | null) ?? null;
  const upcomingWebinar = upcomingWebinarRaw
    ? {
        ...upcomingWebinarRaw,
        profiles: Array.isArray(upcomingWebinarRaw.profiles)
          ? upcomingWebinarRaw.profiles[0] ?? null
          : upcomingWebinarRaw.profiles,
      }
    : null;
  const newVoiceRaw = (newVoiceResult.data ?? []) as VoicePostRaw[];

  const featuredPostsNorm = featuredPostsRaw.map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
  }));

  const featuredIds = featuredPostsNorm.map((post) => post.id);
  const [
    { data: featuredReferences },
    { data: featuredComments },
    { data: featuredBookmarks },
    { data: featuredResponses },
  ] =
    featuredIds.length > 0
      ? await Promise.all([
          supabase.from("post_references").select("post_id").in("post_id", featuredIds),
          supabase.from("comments").select("post_id").in("post_id", featuredIds),
          supabase.from("bookmarks").select("post_id").in("post_id", featuredIds),
          supabase.from("posts").select("in_response_to").in("in_response_to", featuredIds),
        ])
      : [
          { data: [] },
          { data: [] },
          { data: [] },
          { data: [] },
        ];
  const countBy = (rows: Array<Record<string, string | null>>, key: string) =>
    rows.reduce((acc: Record<string, number>, row) => {
      const id = row[key];
      if (id) acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {});
  const referenceCounts = countBy((featuredReferences ?? []) as Array<Record<string, string | null>>, "post_id");
  const commentCounts = countBy((featuredComments ?? []) as Array<Record<string, string | null>>, "post_id");
  const bookmarkCounts = countBy((featuredBookmarks ?? []) as Array<Record<string, string | null>>, "post_id");
  const responseCounts = countBy((featuredResponses ?? []) as Array<Record<string, string | null>>, "in_response_to");
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
      {user ? (
        <RetentionEventTracker
          event="home_viewed"
          metadata={{ tab: activeTab, activated: Boolean(activationState?.activated) }}
        />
      ) : null}

      {user ? (
        <DailyBriefStrip
          featuredPost={featuredPost}
          activeDebate={homeDebate}
          points={userPoints}
        />
      ) : null}

      {user && activationState && !activationState.activated ? (
        <ActivationFocusPanel state={activationState} />
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
            upcomingWebinar={upcomingWebinar}
            recentDraft={recentDraft ?? null}
            activationState={activationState}
            peopleSuggestions={peopleResult.suggestions}
            currentUserId={user?.id ?? null}
          />
        </aside>
      </div>
    </div>
  );
}

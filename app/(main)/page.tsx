import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import RetentionThisWeek from "@/components/retention/RetentionThisWeek";
import ActivationChecklist from "@/components/ui/ActivationChecklist";
import HomeSidebar from "@/components/ui/HomeSidebar";
import WelcomeBanner from "@/components/ui/WelcomeBanner";
import { getActivationState, type ActivationState } from "@/lib/activation";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { getRetentionSummary, type RetentionSummary } from "@/lib/retention";
import { getSuggestedPeople, type SuggestedPeopleResult } from "@/lib/suggestedPeople";
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
    welcome?: string;
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
  cover_image_url: string | null;
  view_count: number | null;
  published_at: string | null;
  profiles: FeaturedProfile | FeaturedProfile[] | null;
}

interface VoicePostRaw {
  author_id: string;
  profiles: VoiceProfile | VoiceProfile[] | null;
}

interface UpcomingWebinar {
  id: string;
  title: string;
  scheduled_at: string;
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
  let userFullName: string | null = null;

  if (user) {
    const { data: profileData } = await supabase
      .from("profiles")
      .select("interests, university, field_of_study, full_name")
      .eq("id", user.id)
      .single();

    userInterests = (profileData?.interests as string[] | null) ?? [];
    userUniversity = profileData?.university ?? null;
    userFieldOfStudy = profileData?.field_of_study ?? null;
    userFullName = profileData?.full_name ?? null;
  }

  const firstName = userFullName?.trim().split(/\s+/)[0] ?? "there";

  const draftCutoff = new Date(
    Date.now() - 14 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [
    { count: publishedCount },
    { data: followedUsers },
    { count: debateCount },
    { data: hotDebateRaw },
    { data: recentDraft },
    featuredPostsResult,
    upcomingWebinarResult,
    newVoiceResult,
  ] = await Promise.all([
    user
      ? supabase
          .from("posts")
          .select("*", { count: "exact", head: true })
          .eq("author_id", user.id)
          .eq("status", "published")
      : Promise.resolve({ count: 0, data: null, error: null }),

    user
      ? supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id)
      : Promise.resolve({ data: [], error: null }),

    user
      ? supabase
          .from("debate_arguments")
          .select("*", { count: "exact", head: true })
          .eq("author_id", user.id)
      : Promise.resolve({ count: 0, data: null, error: null }),

    supabase
      .from("debates")
      .select("id, title, debate_arguments(count)")
      .in("status", ["open", "active"])
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
      .select(
        `
        id, author_id, title, slug, type, excerpt, cover_image_url, view_count, published_at,
        profiles!posts_author_id_fkey (username, full_name, university, avatar_url, verified)
      `
      )
      .eq("status", "published")
      .gte(
        "published_at",
        new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
      )
      .order("view_count", { ascending: false })
      .limit(3),

    supabase
      .from("webinars")
      .select("id, title, scheduled_at")
      .eq("status", "scheduled")
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("posts")
      .select(
        `
        author_id,
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

  const activeDebate: DebateInterludeData | null = FEATURE_FLAGS.debates && hotDebateRaw
    ? {
        id: hotDebateRaw.id,
        title: hotDebateRaw.title,
        argumentCount: hotDebateArgumentCount,
      }
    : null;

  const featuredPostsRaw = (featuredPostsResult.data ?? []) as FeaturedPostRaw[];
  const upcomingWebinar =
    (upcomingWebinarResult.data as UpcomingWebinar | null) ?? null;
  const newVoiceRaw = (newVoiceResult.data ?? []) as VoicePostRaw[];

  const featuredPostsNorm = featuredPostsRaw.map((post) => ({
    ...post,
    profiles: Array.isArray(post.profiles) ? post.profiles[0] ?? null : post.profiles,
  }));

  const [featuredPost = null, ...editorPicksRaw] = featuredPostsNorm;
  const editorPicks = editorPicksRaw.slice(0, 2);

  const voiceCounts = new Map<
    string,
    {
      count: number;
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
      profile,
    });
  }

  const newVoice =
    Array.from(voiceCounts.values()).sort((left, right) => right.count - left.count)[0] ??
    null;

  let peopleResult: SuggestedPeopleResult = { suggestions: [], reason: "" };
  let activationState: ActivationState | null = null;
  let retentionSummary: RetentionSummary | null = null;

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

    retentionSummary = await getRetentionSummary(supabase, user.id, activationState);
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
      {user ? (
        <RetentionEventTracker
          event="home_viewed"
          metadata={{ tab: activeTab, activated: Boolean(activationState?.activated) }}
        />
      ) : null}

      {welcome === "1" && user ? <WelcomeBanner firstName={firstName} /> : null}

      {activationState && !activationState.activated ? (
        <ActivationChecklist state={activationState} compact />
      ) : null}

      {activationState?.activated && retentionSummary ? (
        <RetentionThisWeek summary={retentionSummary} source="home" />
      ) : null}

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-0 lg:col-span-2">
          <FeaturedPostLead post={featuredPost} />

          <EditorPicksRow picks={editorPicks} />

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
              activeDebate={activeDebate}
              peopleSuggestions={peopleResult.suggestions}
              peopleSuggestionReason={peopleResult.reason}
              prioritizePeopleSuggestions={followCount < 3}
              sectionLabel="Latest"
            />
          </Suspense>
        </div>

        <aside className="hidden self-start space-y-6 lg:sticky lg:top-24 lg:col-span-1 lg:block">
          <HomeSidebar
            activeDebate={activeDebate}
            newVoice={newVoice}
            upcomingWebinar={FEATURE_FLAGS.webinars ? upcomingWebinar : null}
            recentDraft={recentDraft ?? null}
          />
        </aside>
      </div>
    </div>
  );
}

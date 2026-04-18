import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import ActivationBanner from "@/components/ui/ActivationBanner";
import SuggestedPeople from "@/components/ui/SuggestedPeople";
import YourDraftCard from "@/components/ui/YourDraftCard";
import WelcomeBanner from "@/components/ui/WelcomeBanner";
import { getSuggestedPeople } from "@/lib/suggestedPeople";
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

  const activeDebate: DebateInterludeData | null = hotDebateRaw
    ? {
        id: hotDebateRaw.id,
        title: hotDebateRaw.title,
        argumentCount: hotDebateArgumentCount,
      }
    : null;

  const peopleResult = user
    ? await getSuggestedPeople(supabase, {
        currentUserId: user.id,
        university: userUniversity,
        fieldOfStudy: userFieldOfStudy,
        limit: 3,
      })
    : { suggestions: [], reason: "" };

  const showActivation =
    !!user &&
    ((publishedCount ?? 0) === 0 ||
      followCount === 0 ||
      (debateCount ?? 0) === 0);

  const activeTab =
    tab === "following" && followCount > 0
      ? "following"
      : tab === "latest"
        ? "latest"
        : "home";

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
      <div className="lg:col-span-2">
        {welcome === "1" && user ? <WelcomeBanner firstName={firstName} /> : null}

        {showActivation ? (
          <ActivationBanner
            userId={user?.id ?? ""}
            hasPublished={(publishedCount ?? 0) > 0}
            hasFollowed={followCount > 0}
            hasDebated={(debateCount ?? 0) > 0}
          />
        ) : null}

        <Suspense fallback={<FeedSkeleton />}>
          <PostsFeedSection
            tab={activeTab}
            type={type ?? null}
            timeframe={timeframe ?? null}
            userId={user?.id ?? null}
            userInterests={userInterests}
            userUniversity={userUniversity}
            followedIds={followedIds}
            showFollowingEligible={followCount > 0}
            activeDebate={activeDebate}
            peopleSuggestions={peopleResult.suggestions}
          />
        </Suspense>
      </div>

      <aside className="hidden self-start space-y-6 lg:sticky lg:top-24 lg:col-span-1 lg:block">
        {user ? (
          <SuggestedPeople
            currentUserId={user.id}
            university={userUniversity}
            fieldOfStudy={userFieldOfStudy}
          />
        ) : null}

        {recentDraft ? <YourDraftCard draft={recentDraft} /> : null}
      </aside>
    </div>
  );
}

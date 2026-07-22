import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFeedPage,
  normalizeFeedContentFilter,
  type FeedTabKey,
  type FeedTimeframe,
} from "@/lib/feedData";
import { getBlockedUserIds } from "@/lib/blocking";

function getTab(param: string | null): FeedTabKey {
  if (param === "following" || param === "latest") return param;
  return "home";
}

function getTimeframe(param: string | null): FeedTimeframe {
  if (param === "week" || param === "month") return param;
  return "all";
}

function getType(param: string | null) {
  const normalized = normalizeFeedContentFilter(param);
  return normalized === "all" ? null : normalized;
}

function getPositiveInteger(param: string | null, fallback: number) {
  const value = Number(param ?? fallback);
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.floor(value));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  const page = getPositiveInteger(params.get("page"), 1);
  const pageSize = getPositiveInteger(params.get("pageSize"), 12);
  const tab = getTab(params.get("tab"));
  const timeframe = getTimeframe(params.get("timeframe"));
  const type = getType(params.get("type"));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userInterests: string[] = [];
  let userUniversity: string | null = null;
  let followedIds: string[] = [];
  let excludedAuthorIds: string[] = [];

  if (user) {
    const [{ data: profile }, { data: followedUsers }, blockedIds] =
      await Promise.all([
        supabase
          .from("profiles")
          .select("interests, university")
          .eq("id", user.id)
          .single(),
        supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", user.id),
        getBlockedUserIds(user.id),
      ]);

    userInterests = (profile?.interests as string[] | null) ?? [];
    userUniversity = profile?.university ?? null;
    followedIds = (followedUsers ?? []).map(
      (row: { following_id: string }) => row.following_id
    );
    excludedAuthorIds = blockedIds;
  }

  const result = await fetchFeedPage({
    supabase,
    tab,
    page,
    pageSize,
    type,
    timeframe,
    userId: user?.id ?? null,
    userInterests,
    userUniversity,
    followedIds,
    excludedAuthorIds,
  });

  return NextResponse.json(result);
}

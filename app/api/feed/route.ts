import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFeedPage,
  type FeedTabKey,
  type FeedTimeframe,
} from "@/lib/feedData";

function getTab(param: string | null): FeedTabKey {
  if (param === "following" || param === "latest") return param;
  return "home";
}

function getTimeframe(param: string | null): FeedTimeframe {
  if (param === "week" || param === "month") return param;
  return "all";
}

function getType(param: string | null) {
  if (!param || param === "all") return null;
  if (
    param === "research" ||
    param === "essay" ||
    param === "policy_brief" ||
    param === "blog"
  ) {
    return param;
  }
  return null;
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const params = request.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "20");
  const tab = getTab(params.get("tab"));
  const timeframe = getTimeframe(params.get("timeframe"));
  const type = getType(params.get("type"));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userInterests: string[] = [];
  let userUniversity: string | null = null;
  let followedIds: string[] = [];

  if (user) {
    const [{ data: profile }, { data: followedUsers }] = await Promise.all([
      supabase
        .from("profiles")
        .select("interests, university")
        .eq("id", user.id)
        .single(),
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", user.id),
    ]);

    userInterests = (profile?.interests as string[] | null) ?? [];
    userUniversity = profile?.university ?? null;
    followedIds = (followedUsers ?? []).map(
      (row: { following_id: string }) => row.following_id
    );
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
  });

  return NextResponse.json(result);
}

import "server-only";

import type { ActivationState } from "@/lib/activation";

export interface RetentionProgress {
  postsOpened: number;
  draftsStarted: number;
  postsSubmitted: number;
  interactions: number;
}

export interface RetentionNextAction {
  key:
    | "revision"
    | "draft"
    | "read"
    | "respond"
    | "performance"
    | "follow"
    | "latest";
  label: string;
  description: string;
  href: string;
  cta: string;
}

export interface RetentionSummary {
  progress: RetentionProgress;
  nextAction: RetentionNextAction;
  weekStartedAt: string;
}

type QueryResult<T> = Promise<{ data?: T[] | null; error?: { message?: string } | null }>;
type MaybeQueryResult<T> = Promise<{ data?: T | null; error?: { message?: string } | null }>;

async function readRowsSafe<T>(query: QueryResult<T>): Promise<T[]> {
  try {
    const result = await query;
    if (result.error) return [];
    return result.data ?? [];
  } catch {
    return [];
  }
}

async function readMaybeSafe<T>(query: MaybeQueryResult<T>): Promise<T | null> {
  try {
    const result = await query;
    if (result.error) return null;
    return result.data ?? null;
  } catch {
    return null;
  }
}

function eventCount(rows: { event_name: string }[], eventName: string) {
  return rows.filter((row) => row.event_name === eventName).length;
}

function titleOrFallback(title: string | null | undefined, fallback: string) {
  const trimmed = title?.trim();
  return trimmed ? trimmed : fallback;
}

export async function getRetentionSummary(
  supabase: any,
  userId: string,
  activationState: ActivationState
): Promise<RetentionSummary> {
  const weekStartedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const profile = await readMaybeSafe<{
    interests: string[] | null;
  }>(
    supabase
      .from("profiles")
      .select("interests")
      .eq("id", userId)
      .single() as unknown as MaybeQueryResult<{ interests: string[] | null }>
  );

  const interests = Array.isArray(profile?.interests) ? profile.interests : [];
  const relevantPostQuery = supabase
    .from("posts")
    .select("id, title, slug, tags")
    .eq("status", "published")
    .neq("author_id", userId)
    .order("published_at", { ascending: false })
    .limit(1);

  const [
    events,
    notifications,
    revisionPost,
    recentDraft,
    latestPublishedPost,
    matchedPosts,
  ] = await Promise.all([
    readRowsSafe<{ event_name: string }>(
      supabase
        .from("activation_events")
        .select("event_name")
        .eq("user_id", userId)
        .gte("created_at", weekStartedAt)
        .in("event_name", ["post_opened", "draft_started", "post_submitted"]) as unknown as QueryResult<{
        event_name: string;
      }>
    ),
    readRowsSafe<{ type: string; read: boolean }>(
      supabase
        .from("notifications")
        .select("type, read")
        .eq("user_id", userId)
        .gte("created_at", weekStartedAt)
        .in("type", [
          "follow",
          "like",
          "comment",
          "response_post",
          "post_published",
          "revision_requested",
        ]) as unknown as QueryResult<{ type: string; read: boolean }>
    ),
    readMaybeSafe<{
      title: string | null;
      slug: string;
      revision_due_at: string | null;
    }>(
      supabase
        .from("posts")
        .select("title, slug, revision_due_at")
        .eq("author_id", userId)
        .eq("status", "pending_revision")
        .order("revision_due_at", { ascending: true, nullsFirst: false })
        .limit(1)
        .maybeSingle() as unknown as MaybeQueryResult<{
        title: string | null;
        slug: string;
        revision_due_at: string | null;
      }>
    ),
    readMaybeSafe<{ id: string; title: string | null; updated_at: string | null }>(
      supabase
        .from("posts")
        .select("id, title, updated_at")
        .eq("author_id", userId)
        .eq("status", "draft")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as MaybeQueryResult<{
        id: string;
        title: string | null;
        updated_at: string | null;
      }>
    ),
    readMaybeSafe<{ title: string | null; slug: string; view_count: number | null }>(
      supabase
        .from("posts")
        .select("title, slug, view_count")
        .eq("author_id", userId)
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as MaybeQueryResult<{
        title: string | null;
        slug: string;
        view_count: number | null;
      }>
    ),
    readRowsSafe<{ title: string | null; slug: string }>(
      (interests.length > 0
        ? relevantPostQuery.overlaps("tags", interests)
        : relevantPostQuery) as unknown as QueryResult<{ title: string | null; slug: string }>
    ),
  ]);

  let suggestedPost: { title: string | null; slug: string } | null =
    matchedPosts[0] ?? null;
  if (!suggestedPost && interests.length > 0) {
    suggestedPost = await readMaybeSafe<{ title: string | null; slug: string }>(
      supabase
        .from("posts")
        .select("title, slug")
        .eq("status", "published")
        .neq("author_id", userId)
        .order("published_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as MaybeQueryResult<{ title: string | null; slug: string }>
    );
  }

  const progress: RetentionProgress = {
    postsOpened: eventCount(events, "post_opened"),
    draftsStarted: eventCount(events, "draft_started"),
    postsSubmitted: eventCount(events, "post_submitted"),
    interactions: notifications.length,
  };

  let nextAction: RetentionNextAction;
  if (revisionPost) {
    nextAction = {
      key: "revision",
      label: "Revise reviewer feedback",
      description: `${titleOrFallback(revisionPost.title, "Your pending post")} needs your next revision.`,
      href: `/edit/${revisionPost.slug}`,
      cta: "Revise now",
    };
  } else if (recentDraft) {
    nextAction = {
      key: "draft",
      label: "Continue your latest draft",
      description: `${titleOrFallback(recentDraft.title, "Untitled draft")} is waiting for one clear next edit.`,
      href: `/write?draft=${recentDraft.id}`,
      cta: "Continue draft",
    };
  } else if (suggestedPost) {
    nextAction = {
      key: "respond",
      label: "Respond to a relevant post",
      description: `Read "${titleOrFallback(suggestedPost.title, "a new post")}" and add a short response if you have a useful angle.`,
      href: `/post/${suggestedPost.slug}`,
      cta: "Read and respond",
    };
  } else if (latestPublishedPost) {
    nextAction = {
      key: "performance",
      label: "Check your writing progress",
      description: `${titleOrFallback(latestPublishedPost.title, "Your latest post")} has ${latestPublishedPost.view_count ?? 0} views.`,
      href: "/dashboard",
      cta: "View dashboard",
    };
  } else if (activationState.followCount < 5) {
    nextAction = {
      key: "follow",
      label: "Follow more credible writers",
      description: "A stronger network gives you better reading prompts when you return.",
      href: "/onboarding?step=follow",
      cta: "Find writers",
    };
  } else {
    nextAction = {
      key: "latest",
      label: "Read the latest thinking",
      description: "Catch up on new essays, quick takes, research, and policy writing.",
      href: "/?tab=latest",
      cta: "Open latest",
    };
  }

  return {
    progress,
    nextAction,
    weekStartedAt,
  };
}

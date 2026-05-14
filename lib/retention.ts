import "server-only";

import type { ActivationState } from "@/lib/activation";

export interface RetentionProgress {
  postsOpened: number;
  draftsStarted: number;
  postsSubmitted: number;
  interactions: number;
  responseStarts: number;
  notificationsOpened: number;
  returnActionsClicked: number;
}

export interface RetentionNextAction {
  key:
    | "response_received"
    | "revision"
    | "draft"
    | "notification"
    | "read"
    | "respond"
    | "write_back"
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
  primaryAction: RetentionNextAction;
  actionItems: RetentionNextAction[];
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

function pushUniqueAction(
  actions: RetentionNextAction[],
  action: RetentionNextAction | null
) {
  if (!action) return;
  if (actions.some((item) => item.key === action.key && item.href === action.href)) return;
  actions.push(action);
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
    unreadResponseNotification,
    unreadEngagementNotification,
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
        .in("event_name", [
          "post_opened",
          "draft_started",
          "post_submitted",
          "response_started",
          "notification_opened",
          "next_action_clicked",
        ]) as unknown as QueryResult<{
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
      type: string;
      read: boolean;
      post_id: string | null;
      link: string | null;
      post:
        | { title: string | null; slug: string | null }
        | { title: string | null; slug: string | null }[]
        | null;
    }>(
      supabase
        .from("notifications")
        .select(
          "type, read, post_id, link, post:posts!notifications_post_id_fkey(title, slug)"
        )
        .eq("user_id", userId)
        .eq("type", "response_post")
        .eq("read", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as MaybeQueryResult<{
        type: string;
        read: boolean;
        post_id: string | null;
        link: string | null;
        post:
          | { title: string | null; slug: string | null }
          | { title: string | null; slug: string | null }[]
          | null;
      }>
    ),
    readMaybeSafe<{
      type: string;
      read: boolean;
      post_id: string | null;
      link: string | null;
      post:
        | { title: string | null; slug: string | null }
        | { title: string | null; slug: string | null }[]
        | null;
    }>(
      supabase
        .from("notifications")
        .select(
          "type, read, post_id, link, post:posts!notifications_post_id_fkey(title, slug)"
        )
        .eq("user_id", userId)
        .eq("read", false)
        .in("type", ["comment", "like", "follow"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle() as unknown as MaybeQueryResult<{
        type: string;
        read: boolean;
        post_id: string | null;
        link: string | null;
        post:
          | { title: string | null; slug: string | null }
          | { title: string | null; slug: string | null }[]
          | null;
      }>
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
    responseStarts: eventCount(events, "response_started"),
    notificationsOpened: eventCount(events, "notification_opened"),
    returnActionsClicked: eventCount(events, "next_action_clicked"),
  };

  const responsePost = unreadResponseNotification
    ? Array.isArray(unreadResponseNotification.post)
      ? unreadResponseNotification.post[0] ?? null
      : unreadResponseNotification.post
    : null;
  const engagementPost = unreadEngagementNotification
    ? Array.isArray(unreadEngagementNotification.post)
      ? unreadEngagementNotification.post[0] ?? null
      : unreadEngagementNotification.post
    : null;
  const actions: RetentionNextAction[] = [];

  if (unreadResponseNotification) {
    pushUniqueAction(actions, {
      key: "response_received",
      label: "Read a response to your work",
      description: `${titleOrFallback(responsePost?.title, "A new response")} is waiting for your next read.`,
      href:
        unreadResponseNotification.link ??
        (responsePost?.slug ? `/post/${responsePost.slug}` : "/notifications"),
      cta: "Read response",
    });
  }

  if (revisionPost) {
    pushUniqueAction(actions, {
      key: "revision",
      label: "Revise reviewer feedback",
      description: `${titleOrFallback(revisionPost.title, "Your pending post")} needs your next revision.`,
      href: `/edit/${revisionPost.slug}`,
      cta: "Revise now",
    });
  }

  if (recentDraft) {
    pushUniqueAction(actions, {
      key: "draft",
      label: "Continue your latest draft",
      description: `${titleOrFallback(recentDraft.title, "Untitled draft")} is waiting for one clear next edit.`,
      href: `/write?draft=${recentDraft.id}`,
      cta: "Continue draft",
    });
  }

  if (unreadEngagementNotification) {
    const typeLabel =
      unreadEngagementNotification.type === "comment"
        ? "comment"
        : unreadEngagementNotification.type === "like"
          ? "like"
          : "new follower";
    pushUniqueAction(actions, {
      key: "notification",
      label: `Review a ${typeLabel}`,
      description: `${titleOrFallback(engagementPost?.title, "Recent activity")} has new activity since your last visit.`,
      href:
        unreadEngagementNotification.link ??
        (engagementPost?.slug ? `/post/${engagementPost.slug}` : "/notifications"),
      cta: "Open activity",
    });
  }

  if (suggestedPost) {
    pushUniqueAction(actions, {
      key: "respond",
      label: "Respond to a relevant post",
      description: `Read "${titleOrFallback(suggestedPost.title, "a new post")}" and add a short response if you have a useful angle.`,
      href: `/post/${suggestedPost.slug}`,
      cta: "Read and respond",
    });
  }

  if (latestPublishedPost) {
    pushUniqueAction(actions, {
      key: "performance",
      label: "Check your writing progress",
      description: `${titleOrFallback(latestPublishedPost.title, "Your latest post")} has ${latestPublishedPost.view_count ?? 0} views.`,
      href: "/dashboard",
      cta: "View dashboard",
    });
  }

  if (activationState.followCount < 5) {
    pushUniqueAction(actions, {
      key: "follow",
      label: "Follow more credible writers",
      description: "A stronger network gives you better reading prompts when you return.",
      href: "/onboarding?step=follow",
      cta: "Find writers",
    });
  }

  pushUniqueAction(actions, {
    key: "latest",
    label: "Read the latest thinking",
    description: "Catch up on new essays, quick takes, research, and policy writing.",
    href: "/?tab=latest",
    cta: "Open latest",
  });

  const fallbackAction: RetentionNextAction = {
    key: "latest",
    label: "Read the latest thinking",
    description: "Catch up on new essays, quick takes, research, and policy writing.",
    href: "/?tab=latest",
    cta: "Open latest",
  };
  const primaryAction = actions[0] ?? fallbackAction;
  const secondaryActions = actions.slice(1);

  return {
    progress,
    primaryAction,
    actionItems: secondaryActions.slice(0, 3),
    nextAction: primaryAction,
    weekStartedAt,
  };
}

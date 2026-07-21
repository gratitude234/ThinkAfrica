export type ActivationTaskKey =
  | "profile"
  | "follow"
  | "read"
  | "start"
  | "submit";

import { isAcademicProfileType, isProfileType } from "@/lib/profileTypes";

export interface ActivationTask {
  key: ActivationTaskKey;
  label: string;
  description: string;
  href: string;
  done: boolean;
}

export interface ActivationState {
  profileComplete: boolean;
  followCount: number;
  meaningfulEngagementCount: number;
  firstContributionStarted: boolean;
  firstContributionLabel: string | null;
  responseStartedCount: number;
  submittedPostCount: number;
  draftCount: number;
  debateArgumentCount: number;
  activated: boolean;
  tasks: ActivationTask[];
  nextTask: ActivationTask | null;
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function isProfileComplete(profile: Record<string, unknown> | null) {
  const interests = profile?.interests;
  const rawProfileType =
    typeof profile?.profile_type === "string" ? profile.profile_type : null;
  const profileType = isProfileType(rawProfileType) ? rawProfileType : null;

  // Mirrors exactly what app/(onboarding)/onboarding/page.tsx collects: persona,
  // country (plus university/field of study for academic personas), and
  // interests. Fields onboarding doesn't ask for (organization, title,
  // website) are intentionally excluded so this can't stay permanently
  // "incomplete" for a user who finished onboarding.
  if (
    !hasText(profile?.full_name) ||
    !hasText(profile?.username) ||
    !profileType ||
    !hasText(profile?.country) ||
    !Array.isArray(interests) ||
    interests.length === 0
  ) {
    return false;
  }

  if (isAcademicProfileType(profileType)) {
    return hasText(profile?.university) && hasText(profile?.field_of_study);
  }

  return true;
}

async function countRowsSafe(
  query: Promise<{ data?: unknown[] | null; error?: unknown }>
): Promise<number> {
  try {
    const result = await query;
    if (result.error) return 0;
    return result.data?.length ?? 0;
  } catch {
    return 0;
  }
}

export async function getActivationState(
  supabase: any,
  userId: string
): Promise<ActivationState> {
  const [
    { data: profile },
    followCount,
    postOpenCount,
    bookmarkCount,
    commentCount,
    responseStartedCount,
    submittedPostCount,
    draftCount,
    debateArgumentCount,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, username, country, university, field_of_study, interests, profile_type, professional_title"
      )
      .eq("id", userId)
      .single(),
    countRowsSafe(
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId)
        .limit(3) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("activation_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_name", "post_opened")
        .limit(2) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("bookmarks")
        .select("post_id")
        .eq("user_id", userId)
        .limit(2) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("comments")
        .select("id")
        .eq("author_id", userId)
        .limit(2) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("activation_events")
        .select("id")
        .eq("user_id", userId)
        .eq("event_name", "response_started")
        .limit(1) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("posts")
        .select("id")
        .eq("author_id", userId)
        .in("status", ["published", "pending", "pending_revision"])
        .limit(1) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("posts")
        .select("id")
        .eq("author_id", userId)
        .eq("status", "draft")
        .limit(1) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
    countRowsSafe(
      supabase
        .from("debate_arguments")
        .select("id")
        .eq("author_id", userId)
        .limit(1) as unknown as Promise<{ data?: unknown[] | null; error?: unknown }>
    ),
  ]);

  const profileComplete = isProfileComplete(profile);
  const firstContributionStarted =
    draftCount > 0 || debateArgumentCount > 0 || responseStartedCount > 0;
  const firstContributionLabel =
    draftCount > 0
      ? "Draft started"
      : debateArgumentCount > 0
        ? "Debate argument started"
        : responseStartedCount > 0
          ? "Response started"
          : null;
  const meaningfulEngagementCount = postOpenCount + bookmarkCount + commentCount;
  const hasMeaningfulEngagement = meaningfulEngagementCount >= 2;
  const hasSubmittedContribution =
    submittedPostCount > 0 || debateArgumentCount > 0;

  const tasks: ActivationTask[] = [
    {
      key: "profile",
      label: "Complete profile",
      description: "Add the essentials that help readers understand who you are and what you follow.",
      href: "/settings",
      done: profileComplete,
    },
    {
      key: "follow",
      label: "Follow 3 relevant writers",
      description: `${Math.min(followCount, 3)} of 3 followed. This makes your feed useful from day one.`,
      href: "/onboarding?step=follow",
      done: followCount >= 3,
    },
    {
      key: "read",
      label: "Read or respond to something relevant",
      description: "Open, save, or discuss a few posts so Indegenius can learn what matters to you.",
      href: "/?tab=latest",
      done: hasMeaningfulEngagement,
    },
    {
      key: "start",
      label: "Share a quick post",
      description: firstContributionLabel
        ? `${firstContributionLabel}. Keep shaping it into a public idea.`
        : "Turn one clear point from class, campus, or the news into a short post.",
      href: "/create/post",
      done: firstContributionStarted,
    },
  ];

  const orderedTasks: ActivationTask[] = [
    tasks[0],
    tasks[1],
    tasks[3],
    tasks[2],
  ];

  const nextTask = orderedTasks.find((task) => !task.done) ?? null;

  return {
    profileComplete,
    followCount,
    meaningfulEngagementCount,
    firstContributionStarted,
    firstContributionLabel,
    responseStartedCount,
    submittedPostCount,
    draftCount,
    debateArgumentCount,
    activated:
      profileComplete &&
      followCount >= 3 &&
      (firstContributionStarted || hasSubmittedContribution),
    tasks: orderedTasks,
    nextTask,
  };
}

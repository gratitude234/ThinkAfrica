export type ActivationTaskKey =
  | "profile"
  | "polish"
  | "follow"
  | "read"
  | "start"
  | "submit";

import { isAcademicProfileType, isProfileType } from "@/lib/profileTypes";
import {
  normalizeOnboardingPreference,
  type OnboardingPreference,
} from "@/lib/onboarding";

export interface ActivationTask {
  key: ActivationTaskKey;
  label: string;
  description: string;
  href: string;
  done: boolean;
  optional?: boolean;
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

export type ProfileCompletionSnapshot = {
  full_name?: unknown;
  username?: unknown;
  profile_type?: unknown;
  country?: unknown;
  university?: unknown;
  field_of_study?: unknown;
  interests?: unknown;
  professional_title?: unknown;
};

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

export function isProfileComplete(
  profile: ProfileCompletionSnapshot | null,
  onboardingPreference?: OnboardingPreference | null
) {
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
    interests.length < (onboardingPreference?.currentPath ? 3 : 1)
  ) {
    return false;
  }

  if (
    onboardingPreference?.currentPath === "student" ||
    (!onboardingPreference?.currentPath && isAcademicProfileType(profileType))
  ) {
    return hasText(profile?.university) && hasText(profile?.field_of_study);
  }

  if (onboardingPreference?.currentPath === "non_student") {
    return Boolean(
      onboardingPreference.workCategory && hasText(profile?.professional_title)
    );
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
    responsePostCount,
    responseStartedCount,
    submittedPostCount,
    draftCount,
    debateArgumentCount,
    { data: onboardingPreferenceRaw },
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, username, country, university, field_of_study, interests, profile_type, professional_title, avatar_url, bio"
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
        .from("posts")
        .select("id")
        .eq("author_id", userId)
        .not("in_response_to", "is", null)
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
    supabase.rpc("get_my_onboarding_state"),
  ]);

  const onboardingPreference = normalizeOnboardingPreference(onboardingPreferenceRaw);
  const profileComplete = isProfileComplete(profile, onboardingPreference);
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
  const meaningfulEngagementCount = postOpenCount + bookmarkCount + responsePostCount;
  const hasMeaningfulEngagement = meaningfulEngagementCount >= 2;
  const hasSubmittedContribution =
    submittedPostCount > 0 || debateArgumentCount > 0;
  // Onboarding deliberately stops asking for a photo and a bio, so this is where
  // they get picked back up. Optional, because neither one blocks publishing.
  const profilePolished = hasText(profile?.avatar_url) && hasText(profile?.bio);

  const tasks: ActivationTask[] = [
    {
      key: "profile",
      label: "Complete your intellectual profile",
      description: "Add context that helps readers understand the person behind the work.",
      href: "/settings",
      done: profileComplete,
    },
    {
      key: "polish",
      label: "Add a photo and a short bio",
      description: profilePolished
        ? "Readers can see who is behind your work."
        : "Two quick details that make your record easier to trust.",
      href: "/settings",
      done: profilePolished,
      optional: true,
    },
    {
      key: "follow",
      label: "Follow 3 people you want to read",
      description: `${Math.min(followCount, 3)} of 3 followed. Optional, but useful for shaping your reading feed.`,
      href: "/explore?tab=people",
      done: followCount >= 3,
      optional: true,
    },
    {
      key: "read",
      label: "Read or respond to a relevant idea",
      description: "Open, save, or respond so Indegenius can learn what matters to you.",
      href: "/?tab=latest",
      done: hasMeaningfulEngagement,
    },
    {
      key: "start",
      label: "Start your first contribution",
      description: firstContributionLabel
        ? `${firstContributionLabel}. Keep shaping it into a public idea.`
        : "Turn one clear idea from your studies, work, community, or the news into a publication.",
      href: "/write",
      done: firstContributionStarted,
    },
  ];

  // Ordered by key rather than by index so adding a task cannot silently
  // reshuffle the checklist. Required work first, optional polish last.
  const taskOrder: ActivationTaskKey[] = [
    "profile",
    "start",
    "read",
    "follow",
    "polish",
  ];
  const orderedTasks: ActivationTask[] = taskOrder
    .map((key) => tasks.find((task) => task.key === key))
    .filter((task): task is ActivationTask => Boolean(task));

  const nextTask =
    orderedTasks.find((task) => !task.done && !task.optional) ?? null;

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
      profileComplete && (firstContributionStarted || hasSubmittedContribution),
    tasks: orderedTasks,
    nextTask,
  };
}

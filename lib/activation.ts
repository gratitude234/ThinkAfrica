export type ActivationTaskKey =
  | "profile"
  | "follow"
  | "read"
  | "start"
  | "submit";

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
  submittedPostCount: number;
  draftCount: number;
  debateArgumentCount: number;
  activated: boolean;
  tasks: ActivationTask[];
  nextTask: ActivationTask | null;
}

function isProfileComplete(profile: Record<string, unknown> | null) {
  const interests = profile?.interests;

  return Boolean(
    profile?.full_name &&
      profile?.username &&
      profile?.university &&
      profile?.field_of_study &&
      Array.isArray(interests) &&
      interests.length > 0
  );
}

async function countRows(
  query: Promise<{ count?: number | null }>
): Promise<number> {
  const result = await query;
  return result.count ?? 0;
}

async function countRowsSafe(
  query: Promise<{ count?: number | null; error?: unknown }>
): Promise<number> {
  try {
    const result = await query;
    if (result.error) return 0;
    return result.count ?? 0;
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
    submittedPostCount,
    draftCount,
    debateArgumentCount,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, username, university, field_of_study, interests")
      .eq("id", userId)
      .single(),
    countRows(
      supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", userId) as unknown as Promise<{ count?: number | null }>
    ),
    countRowsSafe(
      supabase
        .from("activation_events")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("event_name", "post_opened") as unknown as Promise<{
        count?: number | null;
        error?: unknown;
      }>
    ),
    countRowsSafe(
      supabase
        .from("bookmarks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId) as unknown as Promise<{
        count?: number | null;
        error?: unknown;
      }>
    ),
    countRowsSafe(
      supabase
        .from("comments")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId) as unknown as Promise<{
        count?: number | null;
        error?: unknown;
      }>
    ),
    countRows(
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId)
        .in("status", ["published", "pending", "pending_revision"]) as unknown as Promise<{
        count?: number | null;
      }>
    ),
    countRows(
      supabase
        .from("posts")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId)
        .eq("status", "draft") as unknown as Promise<{ count?: number | null }>
    ),
    countRows(
      supabase
        .from("debate_arguments")
        .select("*", { count: "exact", head: true })
        .eq("author_id", userId) as unknown as Promise<{ count?: number | null }>
    ),
  ]);

  const profileComplete = isProfileComplete(profile);
  const hasStartedContribution = draftCount > 0 || debateArgumentCount > 0;
  const meaningfulEngagementCount = postOpenCount + bookmarkCount + commentCount;
  const hasMeaningfulEngagement = meaningfulEngagementCount >= 2;
  const hasSubmittedContribution =
    submittedPostCount > 0 || debateArgumentCount > 0;

  const tasks: ActivationTask[] = [
    {
      key: "profile",
      label: "Complete academic profile",
      description: "Add your university, field, and topics so the network can place your work.",
      href: "/onboarding",
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
      label: "Read something relevant",
      description: "Open, save, or discuss a few posts so ThinkAfrika can learn what matters to you.",
      href: "/?tab=latest",
      done: hasMeaningfulEngagement,
    },
    {
      key: "start",
      label: "Start a quick take",
      description: "Turn one clear point into a short draft. You can publish now or keep polishing.",
      href: "/write?type=blog&starter=1",
      done: hasStartedContribution,
    },
  ];

  const nextTask = tasks.find((task) => !task.done) ?? null;

  return {
    profileComplete,
    followCount,
    meaningfulEngagementCount,
    submittedPostCount,
    draftCount,
    debateArgumentCount,
    activated:
      profileComplete &&
      followCount >= 3 &&
      (hasMeaningfulEngagement || hasStartedContribution || hasSubmittedContribution),
    tasks,
    nextTask,
  };
}

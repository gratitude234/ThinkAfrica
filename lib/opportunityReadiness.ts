export interface OpportunityProfileInput {
  full_name?: string | null;
  username?: string | null;
  university?: string | null;
  field_of_study?: string | null;
  bio?: string | null;
}

export interface TalentProfileInput {
  id?: string | null;
  open_to_opportunities?: boolean | null;
  opportunity_types?: string[] | null;
  cv_url?: string | null;
  linkedin_url?: string | null;
  skills?: string[] | null;
  visibility?: string | null;
}

export interface OpportunityPostInput {
  type?: string | null;
  status?: string | null;
  citation_id?: string | null;
  referenceCount?: number | null;
}

export interface OpportunityReadinessItem {
  key: string;
  label: string;
  done: boolean;
  weight: number;
  actionLabel: string;
  actionHref: string;
}

export interface OpportunityReadinessSummary {
  score: number;
  completedCount: number;
  totalCount: number;
  nextAction: OpportunityReadinessItem | null;
  items: OpportunityReadinessItem[];
  statusLabel: string;
}

function hasReviewedOrReferencedWork(posts: OpportunityPostInput[]) {
  return posts.some(
    (post) =>
      Boolean(post.citation_id) ||
      (post.referenceCount ?? 0) > 0 ||
      post.type === "research" ||
      post.type === "policy_brief"
  );
}

export function getOpportunityReadinessSummary({
  profile,
  talentProfile,
  posts,
  setupHref = "/opportunities#opportunity-profile",
  writeHref = "/write",
}: {
  profile: OpportunityProfileInput | null;
  talentProfile: TalentProfileInput | null;
  posts: OpportunityPostInput[];
  setupHref?: string;
  writeHref?: string;
}): OpportunityReadinessSummary {
  const publishedPosts = posts.filter((post) => post.status === "published");
  const profileBasicsDone = Boolean(
    profile?.full_name &&
      profile?.username &&
      profile?.university &&
      profile?.field_of_study &&
      profile?.bio
  );
  const openToOpportunities = Boolean(talentProfile?.open_to_opportunities);
  const skillsDone = (talentProfile?.skills ?? []).length >= 2;
  const typesDone = (talentProfile?.opportunity_types ?? []).length > 0;
  const linksDone = Boolean(talentProfile?.cv_url || talentProfile?.linkedin_url);
  const workDone = publishedPosts.length > 0;
  const evidenceDone = hasReviewedOrReferencedWork(publishedPosts);
  const visibilityDone =
    openToOpportunities &&
    (talentProfile?.visibility === "public" ||
      talentProfile?.visibility === "partners_only");

  const items: OpportunityReadinessItem[] = [
    {
      key: "profile",
      label: "Profile basics",
      done: profileBasicsDone,
      weight: 20,
      actionLabel: "Complete profile",
      actionHref: "/settings",
    },
    {
      key: "skills",
      label: "Skills listed",
      done: skillsDone,
      weight: 15,
      actionLabel: "Add skills",
      actionHref: setupHref,
    },
    {
      key: "types",
      label: "Opportunity types",
      done: typesDone,
      weight: 15,
      actionLabel: "Choose types",
      actionHref: setupHref,
    },
    {
      key: "links",
      label: "CV or LinkedIn",
      done: linksDone,
      weight: 10,
      actionLabel: "Add link",
      actionHref: setupHref,
    },
    {
      key: "work",
      label: "Published work",
      done: workDone,
      weight: 20,
      actionLabel: "Publish work",
      actionHref: writeHref,
    },
    {
      key: "evidence",
      label: "Evidence-rich work",
      done: evidenceDone,
      weight: 10,
      actionLabel: workDone ? "Improve work" : "Start writing",
      actionHref: workDone ? "/dashboard" : writeHref,
    },
    {
      key: "visibility",
      label: "Discoverable profile",
      done: visibilityDone,
      weight: 10,
      actionLabel: "Make discoverable",
      actionHref: setupHref,
    },
  ];

  const score = items.reduce(
    (sum, item) => sum + (item.done ? item.weight : 0),
    0
  );
  const completedCount = items.filter((item) => item.done).length;
  const nextAction = items.find((item) => !item.done) ?? null;

  return {
    score,
    completedCount,
    totalCount: items.length,
    nextAction,
    items,
    statusLabel:
      score >= 85
        ? "Ready for discovery"
        : score >= 55
          ? "Almost ready"
          : "Needs setup",
  };
}

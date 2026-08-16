import { isAcademicProfileType, isProfileType } from "@/lib/profileTypes";

export type CredibilityTone = "emerald" | "sky" | "purple" | "amber" | "gray";

export interface ProfileCredibilityBadge {
  key: string;
  label: string;
  tone: CredibilityTone;
}

export interface MissingProfileItem {
  key: string;
  label: string;
  href: string;
}

export interface ProfileCredibilityInput {
  profile: {
    full_name?: string | null;
    username?: string | null;
    bio?: string | null;
    country?: string | null;
    university?: string | null;
    field_of_study?: string | null;
    avatar_url?: string | null;
    verified?: boolean | null;
    verified_type?: string | null;
    interests?: string[] | null;
    profile_type?: string | null;
  } | null;
  stats?: {
    publishedCount?: number | null;
    citableCount?: number | null;
    reviewedCount?: number | null;
    coAuthoredCount?: number | null;
    debateContributionCount?: number | null;
    followerCount?: number | null;
    badgeCount?: number | null;
    topicCount?: number | null;
    featuredWorkCount?: number | null;
    opportunityReadinessScore?: number | null;
    isOpenToOpportunities?: boolean | null;
    sourceBackedCount?: number | null;
    responseCount?: number | null;
  };
}

export interface ProfileCredibilitySummary {
  profileCompletionScore: number;
  missingProfileItems: MissingProfileItem[];
  credibilityBadges: ProfileCredibilityBadge[];
  strongestSignal: string | null;
}

function present(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

function positive(value: number | null | undefined) {
  return (value ?? 0) > 0;
}

export function getProfileCredibilitySummary(
  input: ProfileCredibilityInput
): ProfileCredibilitySummary {
  const profile = input.profile;
  const stats = input.stats ?? {};
  const interests = profile?.interests ?? [];
  const profileType = isProfileType(profile?.profile_type)
    ? profile.profile_type
    : null;
  const academicProfile = profileType ? isAcademicProfileType(profileType) : false;
  const checks: Array<{ key: string; label: string; href: string; done: boolean }> = [
    {
      key: "photo",
      label: "Add profile photo",
      href: "/settings",
      done: present(profile?.avatar_url),
    },
    {
      key: "bio",
      label: "Add a short bio",
      href: "/settings",
      done: present(profile?.bio),
    },
    {
      key: "country",
      label: "Add country",
      href: "/settings",
      done: present(profile?.country),
    },
    ...(academicProfile
      ? [
          {
            key: "university",
            label: "Add university",
            href: "/settings",
            done: present(profile?.university),
          },
          {
            key: "field",
            label: "Add field of study",
            href: "/settings",
            done: present(profile?.field_of_study),
          },
        ]
      : []),
    {
      key: "interests",
      label: "Select writing topics",
      href: "/settings",
      done: interests.length > 0,
    },
    {
      key: "featured",
      label: "Feature strongest work",
      href: profile?.username ? `/${profile.username}#featured-work` : "/dashboard",
      done: positive(stats.featuredWorkCount),
    },
  ];

  const badges: ProfileCredibilityBadge[] = [];
  if (positive(stats.sourceBackedCount)) {
    badges.push({ key: "source_backed", label: "Source-backed work", tone: "emerald" });
  }
  if (positive(stats.citableCount)) {
    badges.push({ key: "citable", label: "Citable work", tone: "sky" });
  }
  if (positive(stats.reviewedCount)) {
    badges.push({ key: "reviewed", label: "Reviewed work", tone: "purple" });
  }
  if (positive(stats.coAuthoredCount)) {
    badges.push({ key: "coauthor", label: "Co-authored work", tone: "amber" });
  }
  if (positive(stats.debateContributionCount)) {
    badges.push({ key: "debate", label: "Debate contributor", tone: "amber" });
  }
  if (positive(stats.responseCount)) {
    badges.push({ key: "responses", label: "Published responses", tone: "amber" });
  }
  if (profile?.verified) {
    badges.push({
      key: "verified",
      label: profile.verified_type
        ? `Verified ${profile.verified_type}`
        : "Verified profile",
      tone: "emerald",
    });
  }
  if (profile?.university || profile?.field_of_study) {
    badges.push({
      key: "academic_identity",
      label: [profile.field_of_study, profile.university].filter(Boolean).join(" / "),
      tone: "gray",
    });
  }

  const completionScore = Math.round(
    (checks.filter((check) => check.done).length / checks.length) * 100
  );
  const strongestSignal =
    badges[0]?.label ??
    (positive(stats.publishedCount)
      ? `${stats.publishedCount?.toLocaleString()} public ${
          stats.publishedCount === 1 ? "piece" : "pieces"
        }`
      : profile?.university
        ? profile.university
        : null);

  return {
    profileCompletionScore: completionScore,
    missingProfileItems: checks
      .filter((check) => !check.done)
      .map(({ key, label, href }) => ({ key, label, href })),
    credibilityBadges: badges.slice(0, 6),
    strongestSignal,
  };
}

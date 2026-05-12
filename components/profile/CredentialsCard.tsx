import Link from "next/link";
import { getPointTier } from "@/lib/utils";

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

interface CredentialsCardProps {
  profile: {
    username: string;
    university?: string | null;
    field_of_study?: string | null;
    points: number;
    verified: boolean;
    verified_type: string | null;
  };
  badges: Badge[];
  postCount: number;
  totalViews: number;
  totalLikes: number;
  citableWorkCount: number;
  reviewedWorkCount: number;
  coAuthoredWorkCount: number;
  debateContributionCount: number;
  topicStats: Array<{ tag: string; count: number }>;
  followerCount: number;
  followingCount: number;
  isOpenToOpportunities: boolean;
  opportunityVisible: boolean;
  opportunityReadinessStatus: string;
}

const VERIFIED_COLORS: Record<string, string> = {
  student: "text-emerald-600",
  researcher: "text-purple-600",
  faculty: "text-amber-500",
  institution: "text-blue-600",
};

export default function CredentialsCard({
  profile,
  badges,
  postCount,
  totalViews,
  totalLikes,
  citableWorkCount,
  reviewedWorkCount,
  coAuthoredWorkCount,
  debateContributionCount,
  topicStats,
  followerCount,
  followingCount,
  isOpenToOpportunities,
  opportunityVisible,
  opportunityReadinessStatus,
}: CredentialsCardProps) {
  const tier = getPointTier(profile.points);
  const verifiedLabel = profile.verified_type
    ? profile.verified_type.charAt(0).toUpperCase() +
      profile.verified_type.slice(1)
    : "Student";

  return (
    <aside className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm shadow-black/[0.02]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
        Academic signal
      </p>
      <h2 className="font-display mt-1 text-lg font-semibold text-gray-900">
        External proof points
      </h2>

      <div className="mt-5 space-y-4">
        {profile.verified ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Verified
            </p>
            <p
              className={`mt-1 text-sm font-medium ${
                VERIFIED_COLORS[profile.verified_type ?? "student"] ??
                "text-emerald-600"
              }`}
            >
              Verified {verifiedLabel}
            </p>
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Opportunity status
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">
            {isOpenToOpportunities
              ? opportunityVisible
                ? "Open and discoverable"
                : "Open with limited visibility"
              : "Not currently open"}
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            {opportunityReadinessStatus}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Tier
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">{tier.name}</p>
        </div>

        {badges.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Recognition
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  title={badge.description ?? badge.name}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs text-amber-700"
                >
                  {badge.icon ? <span>{badge.icon}</span> : null}
                  <span>{badge.name}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
            Portfolio metrics
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {postCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Publications</p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {reviewedWorkCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Reviewed work</p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {citableWorkCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Citable work</p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {coAuthoredWorkCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Co-authored</p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {debateContributionCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Debate arguments</p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {totalViews.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Reads</p>
            </div>
          </div>
        </div>

        {profile.university || profile.field_of_study ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Institution
            </p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {[profile.field_of_study, profile.university].filter(Boolean).join(" / ")}
            </p>
          </div>
        ) : null}

        {topicStats.length > 0 ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">
              Topics written on
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {topicStats.slice(0, 8).map((topic) => (
                <span
                  key={topic.tag}
                  className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700"
                >
                  {topic.tag} {topic.count > 1 ? topic.count : ""}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400">
        <span>{totalLikes.toLocaleString()} likes</span>
        <span className="mx-2">/</span>
        <Link
          href={`/${profile.username}/followers`}
          className="transition-colors hover:text-gray-600"
        >
          {followerCount.toLocaleString()} followers
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/${profile.username}/following`}
          className="transition-colors hover:text-gray-600"
        >
          {followingCount.toLocaleString()} following
        </Link>
      </div>
    </aside>
  );
}

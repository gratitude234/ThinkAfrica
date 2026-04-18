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
    points: number;
    verified: boolean;
    verified_type: string | null;
  };
  badges: Badge[];
  postCount: number;
  totalViews: number;
  followerCount: number;
  followingCount: number;
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
  followerCount,
  followingCount,
}: CredentialsCardProps) {
  const tier = getPointTier(profile.points);
  const verifiedLabel = profile.verified_type
    ? profile.verified_type.charAt(0).toUpperCase() +
      profile.verified_type.slice(1)
    : "Student";

  return (
    <aside className="rounded-2xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">Credentials</h2>

      <div className="mt-5 space-y-4">
        {profile.verified ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Verified
            </p>
            <p
              className={`mt-1 text-sm font-medium ${
                VERIFIED_COLORS[profile.verified_type ?? "student"] ??
                "text-emerald-600"
              }`}
            >
              ✓ Verified {verifiedLabel}
            </p>
          </div>
        ) : null}

        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Tier
          </p>
          <p className="mt-1 text-sm font-medium text-gray-900">{tier.name}</p>
        </div>

        {badges.length > 0 ? (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
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
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
            Public metrics
          </p>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {totalViews.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Total reads</p>
            </div>
            <div className="rounded-xl bg-canvas p-3">
              <p className="text-lg font-semibold text-gray-900">
                {postCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-500">Publications</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-gray-100 pt-4 text-xs text-gray-400">
        <Link
          href={`/${profile.username}/followers`}
          className="transition-colors hover:text-gray-600"
        >
          {followerCount.toLocaleString()} followers
        </Link>
        <span className="mx-2">·</span>
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

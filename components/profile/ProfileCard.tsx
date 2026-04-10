import Link from "next/link";
import PointsTierBadge from "@/components/ui/PointsTierBadge";

interface Badge {
  id: string;
  name: string;
  description: string | null;
  icon: string | null;
}

const VERIFIED_COLORS: Record<string, string> = {
  student: "text-emerald-600",
  researcher: "text-purple-600",
  faculty: "text-amber-500",
  institution: "text-blue-600",
};

interface ProfileCardProps {
  profile: {
    username: string;
    full_name: string | null;
    university: string | null;
    field_of_study: string | null;
    bio: string | null;
    avatar_url: string | null;
    points: number;
    verified?: boolean;
    verified_type?: string | null;
  };
  badges?: Badge[];
  postCount?: number;
  followerCount?: number;
  followingCount?: number;
  totalViews?: number;
  children?: React.ReactNode;
}

export default function ProfileCard({
  profile,
  badges = [],
  postCount = 0,
  followerCount = 0,
  followingCount = 0,
  totalViews = 0,
  children,
}: ProfileCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      {/* Avatar & Name */}
      <div className="flex items-start gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-2xl font-bold flex-shrink-0">
          {profile.full_name?.charAt(0)?.toUpperCase() ??
            profile.username?.charAt(0)?.toUpperCase() ??
            "?"}
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-1.5 flex-wrap">
            {profile.full_name ?? profile.username}
            {profile.verified && (
              <span
                title={profile.verified_type ? `Verified ${profile.verified_type}` : "Verified"}
                className={`inline-flex items-center text-sm font-bold ${VERIFIED_COLORS[profile.verified_type ?? "student"] ?? "text-emerald-600"}`}
              >
                ✓
              </span>
            )}
          </h1>
          <p className="text-sm text-gray-500">@{profile.username}</p>
          {profile.university && (
            <p className="text-sm text-emerald-brand font-medium mt-0.5">
              {profile.university}
            </p>
          )}
          {profile.field_of_study && (
            <p className="text-sm text-gray-500">{profile.field_of_study}</p>
          )}
        </div>
      </div>

      {/* Bio */}
      {profile.bio && (
        <p className="text-gray-600 text-sm leading-relaxed mb-4">
          {profile.bio}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-sm mb-4 flex-wrap">
        <div className="text-center">
          <p className="font-semibold text-gray-900">{postCount}</p>
          <p className="text-gray-400 text-xs">Posts</p>
        </div>
        <Link href={`/${profile.username}/followers`} className="text-center hover:opacity-75 transition-opacity">
          <p className="font-semibold text-gray-900">{followerCount}</p>
          <p className="text-gray-400 text-xs">Followers</p>
        </Link>
        <Link href={`/${profile.username}/following`} className="text-center hover:opacity-75 transition-opacity">
          <p className="font-semibold text-gray-900">{followingCount}</p>
          <p className="text-gray-400 text-xs">Following</p>
        </Link>
        {totalViews > 0 && (
          <div className="text-center">
            <p className="font-semibold text-gray-900">{totalViews.toLocaleString()}</p>
            <p className="text-gray-400 text-xs">Views</p>
          </div>
        )}
        <div className="text-center">
          <PointsTierBadge points={profile.points} showProgress={true} />
        </div>
      </div>

      {/* Follow button slot */}
      {children}

      {/* Badges */}
      {badges.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Badges
          </p>
          <div className="flex flex-wrap gap-2">
            {badges.map((badge) => (
              <div
                key={badge.id}
                title={badge.description ?? badge.name}
                className="flex items-center gap-1 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 text-xs text-amber-700"
              >
                <span>{badge.icon}</span>
                <span>{badge.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

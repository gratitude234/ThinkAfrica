import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/ui/FollowButton";

interface Props {
  currentUserId: string;
  university: string | null;
  fieldOfStudy: string | null;
  limit?: number;
}

type Suggestion = {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
};

export default async function SuggestedPeople({
  currentUserId,
  university,
  fieldOfStudy,
  limit = 3,
}: Props) {
  const supabase = await createClient();

  const { data: alreadyFollowing } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUserId);

  const excludeIds = [
    currentUserId,
    ...(alreadyFollowing?.map((f) => f.following_id) ?? []),
  ];

  let suggestions: Suggestion[] = [];
  let reason = "Top contributors";

  const applyExclusions = <T extends { neq: (col: string, val: string) => T }>(q: T): T => {
    let result = q;
    for (const id of excludeIds) result = result.neq("id", id);
    return result;
  };

  // 1. Same university AND same field
  if (university && fieldOfStudy && suggestions.length === 0) {
    let q = supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url")
      .eq("university", university)
      .eq("field_of_study", fieldOfStudy);
    q = applyExclusions(q);
    const { data } = await q.limit(limit);
    if (data && data.length > 0) {
      suggestions = data as Suggestion[];
      reason = "From your university & field";
    }
  }

  // 2. Same university only
  if (suggestions.length === 0 && university) {
    let q = supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url")
      .eq("university", university);
    q = applyExclusions(q);
    const { data } = await q.limit(limit);
    if (data && data.length > 0) {
      suggestions = data as Suggestion[];
      reason = "From your university";
    }
  }

  // 3. Fallback: top by points
  if (suggestions.length === 0) {
    let q = supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url")
      .order("points", { ascending: false });
    q = applyExclusions(q);
    const { data } = await q.limit(limit);
    suggestions = (data as Suggestion[] | null) ?? [];
  }

  if (suggestions.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900">
          People to Follow
        </h2>
        <span className="text-xs text-gray-400">{reason}</span>
      </div>
      <div className="space-y-3">
        {suggestions.map((person) => (
          <div key={person.id} className="flex items-center gap-3">
            <Link
              href={`/${person.username}`}
              className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0 hover:opacity-80 transition-opacity"
              aria-label={`View ${person.full_name ?? person.username}'s profile`}
            >
              {person.full_name?.charAt(0)?.toUpperCase() ??
                person.username?.charAt(0)?.toUpperCase() ??
                "?"}
            </Link>
            <div className="flex-1 min-w-0">
              <Link href={`/${person.username}`}>
                <p className="text-sm font-medium text-gray-900 hover:text-emerald-brand transition-colors truncate">
                  {person.full_name ?? person.username}
                </p>
              </Link>
              {person.university && (
                <p className="text-xs text-gray-400 truncate">
                  {person.university}
                </p>
              )}
            </div>
            <FollowButton
              followerId={currentUserId}
              followingId={person.id}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

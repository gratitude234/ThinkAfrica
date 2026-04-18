import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import FollowButton from "@/components/ui/FollowButton";
import { getSuggestedPeople } from "@/lib/suggestedPeople";

interface Props {
  currentUserId: string;
  university: string | null;
  fieldOfStudy: string | null;
  limit?: number;
}

export default async function SuggestedPeople({
  currentUserId,
  university,
  fieldOfStudy,
  limit = 3,
}: Props) {
  const supabase = await createClient();
  const { suggestions, reason } = await getSuggestedPeople(supabase, {
    currentUserId,
    university,
    fieldOfStudy,
    limit,
  });

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

"use client";

import Link from "next/link";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";

interface Person {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

export default function PeopleInterlude({
  people,
  currentUserId,
}: {
  people: Person[];
  currentUserId: string | null;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">
            People to follow
          </p>
          <h3 className="text-lg font-semibold text-gray-900">
            Writers worth following
          </h3>
        </div>
        <Link
          href="/leaderboard"
          className="text-sm font-medium text-emerald-brand hover:underline"
        >
          Explore →
        </Link>
      </div>

      <div className="space-y-3">
        {people.map((person) => (
          <div key={person.id} className="flex items-center gap-3">
            <Link href={`/${person.username}`} className="shrink-0">
              <UserAvatar
                name={person.full_name ?? person.username ?? "Anonymous"}
                src={person.avatar_url}
                size={40}
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/${person.username}`}>
                <p className="truncate text-sm font-medium text-gray-900 hover:text-emerald-brand">
                  {person.full_name ?? person.username}
                </p>
              </Link>
              {person.university ? (
                <p className="truncate text-xs text-gray-400">
                  {person.university}
                </p>
              ) : null}
            </div>
            {currentUserId ? (
              <FollowButton
                followerId={currentUserId}
                followingId={person.id}
              />
            ) : (
              <Link
                href={`/${person.username}`}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
              >
                View
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

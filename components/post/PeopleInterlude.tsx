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
  reason,
  currentUserId,
}: {
  people: Person[];
  reason: string;
  currentUserId: string | null;
}) {
  return (
    <section className="-mx-4 my-3 border-y border-gray-200 bg-white px-4 py-[18px] sm:mx-0 sm:rounded-xl sm:border sm:px-5">
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-400">
            Writers to follow
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-ink">
            Based on your reading history
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">{reason}</p>
        </div>
        <Link
          href="/leaderboard"
          className="text-[13px] font-semibold text-emerald-brand hover:underline"
        >
          Explore -&gt;
        </Link>
      </div>

      <div>
        {people.map((person) => (
          <div
            key={person.id}
            className="flex items-center gap-3 border-b border-gray-100 py-2 last:border-b-0 last:pb-0"
          >
            <Link href={`/${person.username}`} className="shrink-0">
              <UserAvatar
                name={person.full_name ?? person.username ?? "Anonymous"}
                src={person.avatar_url}
                size={38}
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/${person.username}`}>
                <p className="truncate text-sm font-medium text-ink hover:text-emerald-brand">
                  {person.full_name ?? person.username}
                </p>
              </Link>
              {person.university ? (
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {person.university}
                </p>
              ) : null}
            </div>
            {currentUserId ? (
              <FollowButton followerId={currentUserId} followingId={person.id} />
            ) : (
              <Link
                href={`/${person.username}`}
                className="rounded-full border border-gray-200 px-3.5 py-1 text-xs font-medium text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
              >
                View
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

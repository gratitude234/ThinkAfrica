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
    <section className="-mx-4 my-3 border-y border-divider bg-card px-4 py-4 sm:mx-0 sm:rounded-xl sm:border sm:px-5 sm:py-[18px]">
      <div className="mb-3.5 flex items-center justify-between">
        <div>
          {/* Was gray-400: 2.8:1, at 11px, uppercase and letter-spaced. */}
          <p className="text-kicker font-semibold uppercase text-ink-muted">
            Writers to follow
          </p>
          <h3 className="mt-0.5 text-base font-semibold text-ink">
            Based on your reading history
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">{reason}</p>
        </div>
        <Link
          href="/leaderboard"
          className="text-meta font-semibold text-emerald-ink hover:underline"
        >
          Explore -&gt;
        </Link>
      </div>

      <div className="-mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden">
        {people.slice(0, 3).map((person) => (
          <article
            key={person.id}
            className="w-[218px] shrink-0 snap-start rounded-xl border border-card-border bg-canvas p-3 sm:w-auto"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Link href={`/${person.username}`} className="shrink-0">
                <UserAvatar
                  name={person.full_name ?? person.username ?? "Anonymous"}
                  src={person.avatar_url}
                  size={38}
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/${person.username}`}>
                  <p className="truncate text-sm font-semibold text-ink hover:text-emerald-ink">
                    {person.full_name ?? person.username}
                  </p>
                </Link>
                {person.university ? (
                  <p className="mt-0.5 line-clamp-1 text-meta text-ink-muted">
                    {person.university}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="mt-3 flex min-h-9 items-center">
              {currentUserId ? (
                <FollowButton
                  followerId={currentUserId}
                  followingId={person.id}
                  authorName={person.full_name ?? person.username}
                  source="home_suggestion"
                />
              ) : (
                <Link
                  href={`/${person.username}`}
                  className="inline-flex min-h-9 items-center rounded-full border border-card-border px-3.5 text-xs font-semibold text-ink-soft hover:border-emerald-ink hover:text-emerald-ink"
                >
                  View profile
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

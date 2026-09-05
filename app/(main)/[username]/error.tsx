"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * Boundary for the profile segment and everything under it: the profile
 * itself, the record, the follower and following lists.
 *
 * The segment boundary exists so a failure in one of those stays where it
 * happened. Without it a throw here climbs to the `(main)` boundary, which
 * replaces the whole page body and cannot say which surface failed or offer a
 * way back into the profile the reader was already on.
 *
 * Nothing about the underlying error reaches the screen. The reader gets what
 * they can act on; the cause goes to the console, and Next replaces the
 * message with a digest in production either way.
 */
export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const params = useParams<{ username?: string }>();
  const username = typeof params?.username === "string" ? params.username : null;

  useEffect(() => {
    console.error("Profile route error:", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="mx-auto flex max-w-md flex-col items-center py-24 text-center"
    >
      <div className="mb-4 text-4xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="font-display text-xl font-semibold text-ink">
        This profile didn&apos;t load
      </h1>
      <p className="mt-2 text-sm leading-6 text-ink-muted">
        Something went wrong on our side. The profile is still there. Try
        again, or come back to it in a moment.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="focus-ring rounded-lg bg-emerald-brand px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
        >
          Try again
        </button>
        {/* Only offered when the segment actually knows whose profile this is,
            so the link can never point at /undefined. */}
        {username ? (
          <Link
            href={`/${username}`}
            className="focus-ring rounded-lg border border-card-border bg-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-card-border-hover hover:text-ink"
          >
            Back to profile
          </Link>
        ) : null}
        <Link
          href="/"
          className="focus-ring rounded-lg border border-card-border bg-card px-5 py-2.5 text-sm font-semibold text-ink-soft transition-colors hover:border-card-border-hover hover:text-ink"
        >
          Back to the feed
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 text-[11px] text-ink-muted">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}

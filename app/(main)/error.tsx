"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Route-level boundary for everything inside the main app shell. Without
 * this, a throw in any server component (a failed Supabase query, a null
 * profile) unmounts the whole tree up to the root and the reader gets a
 * blank screen with no way back. Here the nav shell stays mounted and the
 * failure is scoped to the page body.
 */
export default function MainError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <div className="mb-4 text-4xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="text-xl font-bold text-gray-900">
        This page didn&apos;t load
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">
        Something went wrong on our side. Your work isn&apos;t lost — try again,
        or head back to the feed.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
        >
          Back to the feed
        </Link>
      </div>

      {error.digest ? (
        <p className="mt-6 text-[11px] text-gray-400">
          Reference: {error.digest}
        </p>
      ) : null}
    </div>
  );
}

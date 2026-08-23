"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * The composer routes get their own boundary rather than inheriting a
 * generic one: a crash here happens while someone has unsaved writing on
 * screen, so the copy has to answer "did I lose my work?" first.
 * The composer keeps a periodic localStorage backup, so retrying in place
 * (reset) recovers the draft — that's why "Try again" leads, and navigating
 * away is the secondary action.
 */
export default function WriteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Composer error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <div className="mb-4 text-4xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="text-xl font-bold text-gray-900">
        The editor hit a problem
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">
        Your draft is backed up in this browser. Reloading the editor should
        bring it back.
      </p>

      <div className="mt-6 flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg bg-emerald-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          Reload the editor
        </button>
        <Link
          href="/dashboard"
          className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
        >
          Go to your drafts
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

"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AuthError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Auth route error:", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 text-center">
      <span className="mb-6 text-2xl font-bold text-emerald-brand">
        Indegenius
      </span>
      <h1 className="text-xl font-bold text-gray-900">
        We couldn&apos;t load this step
      </h1>
      <p className="mt-2 text-sm leading-6 text-gray-500">
        Something went wrong signing you in. Try again — if it keeps happening,
        your session may have expired.
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
          href="/login"
          className="rounded-lg border border-gray-200 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
        >
          Back to sign in
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

"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Shown in place of the thread when the comments could not be read. The
 * article above stays on screen: a failed comments query used to reach the
 * route's error boundary and replace the whole page.
 */
export default function CommentsUnavailable() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 font-public-sans text-[13.5px] text-ink-muted">
      <p>Comments didn&apos;t load.</p>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        className="min-h-11 rounded-lg px-3 font-semibold text-emerald-brand hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-60"
      >
        {pending ? "Loading…" : "Try again"}
      </button>
    </div>
  );
}

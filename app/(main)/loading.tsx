import FeedSkeleton from "@/components/post/FeedSkeleton";

function SideCardSkeleton({ rows }: { rows: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="h-2.5 w-24 rounded bg-gray-200" />
      <div className="mt-3 space-y-2">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="h-3 w-full rounded bg-gray-100" />
        ))}
      </div>
    </div>
  );
}

/**
 * Segment-level loading UI for (main). It mirrors the feed + sidebar geometry of
 * app/(main)/page.tsx, which is the shape most routes in this group fall back
 * to, and reuses FeedSkeleton so the placeholder cards match the real ones
 * instead of drifting from them.
 */
export default function Loading() {
  return (
    <div
      className="grid grid-cols-1 items-start lg:grid-cols-[minmax(0,700px)_minmax(280px,304px)] lg:justify-center lg:gap-8 xl:grid-cols-[minmax(0,1fr)_304px] xl:justify-normal xl:gap-10"
      role="status"
      aria-label="Loading your feed"
    >
      <div className="min-w-0">
        <FeedSkeleton />
      </div>

      <div
        aria-hidden="true"
        className="hidden animate-pulse flex-col gap-3.5 motion-reduce:animate-none lg:flex"
      >
        <SideCardSkeleton rows={2} />
        <SideCardSkeleton rows={3} />
        <SideCardSkeleton rows={3} />
      </div>

      <span className="sr-only">Loading your feed…</span>
    </div>
  );
}

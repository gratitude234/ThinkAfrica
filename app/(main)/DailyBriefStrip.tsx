import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import { getNextTier, getPointTier } from "@/lib/utils";

interface FeaturedPost {
  title: string;
}

export default function DailyBriefStrip({
  featuredPost,
  activeDebate,
  points,
}: {
  featuredPost: FeaturedPost | null;
  activeDebate: DebateInterludeData | null;
  points: number | null;
}) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const tier = typeof points === "number" ? getPointTier(points) : null;
  const nextTier = typeof points === "number" ? getNextTier(points) : null;
  const pointsToNext = nextTier ? Math.max(0, nextTier.min - (points ?? 0)) : 0;

  return (
    <section className="mb-5 flex items-center gap-3 rounded-[11px] border border-gray-200 border-l-[3px] border-l-emerald-brand bg-white px-4 py-3">
      <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.15em] text-emerald-brand">
        {today}
      </span>
      <span className="h-5 w-px shrink-0 bg-gray-200" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
        {featuredPost ? (
          <span className="max-w-[260px] truncate text-[13px] text-gray-700">
            <strong className="font-medium text-ink">Top post:</strong>{" "}
            {featuredPost.title}
          </span>
        ) : null}
        {activeDebate ? (
          <span className="max-w-[300px] truncate text-[13px] text-gray-700">
            <strong className="font-medium text-ink">Live debate:</strong>{" "}
            {activeDebate.title} - {activeDebate.argumentCount} arguments
          </span>
        ) : null}
        {!featuredPost && !activeDebate ? (
          <span className="max-w-[300px] truncate text-[13px] text-gray-700">
            <strong className="font-medium text-ink">Latest:</strong> New essays,
            research, and quick takes from the network
          </span>
        ) : null}
      </div>
      {tier ? (
        <span className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
          <span aria-hidden="true">*</span>
          {tier.name}
          {nextTier ? ` - ${pointsToNext} pts to ${nextTier.name}` : ""}
        </span>
      ) : null}
    </section>
  );
}

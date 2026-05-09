import Link from "next/link";
import type { DebateInterludeData } from "@/components/post/DebateInterlude";
import { getNextTier, getPointTier } from "@/lib/utils";

interface FeaturedPost {
  title: string;
  slug?: string;
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
    <>
      <section className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0A3D2E] to-emerald-brand p-4 text-white shadow-[0_14px_30px_-18px_rgb(10_61_46/0.75)] sm:hidden">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">
            Daily brief - {today}
          </p>
          {tier ? (
            <span className="shrink-0 rounded-full bg-white/14 px-2 py-1 text-[10px] font-semibold text-white">
              {tier.name}
            </span>
          ) : null}
        </div>

        {featuredPost ? (
          <Link
            href={featuredPost.slug ? `/post/${featuredPost.slug}` : "/"}
            className="block font-display text-[18px] font-semibold leading-snug"
          >
            {featuredPost.title}
          </Link>
        ) : (
          <p className="font-display text-[18px] font-semibold leading-snug">
            New essays, research, and quick takes from the network
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-white/75">
          <span>Top post today</span>
          {activeDebate ? (
            <Link
              href={`/debates/${activeDebate.id}`}
              className="max-w-full truncate text-white"
            >
              Live debate: {activeDebate.title}
            </Link>
          ) : null}
          {nextTier ? (
            <span>{pointsToNext} pts to {nextTier.name}</span>
          ) : null}
        </div>
      </section>

      <section className="mb-5 hidden flex-col gap-3 rounded-xl border border-gray-200 border-l-[3px] border-l-emerald-brand bg-white px-4 py-3.5 sm:flex sm:flex-row sm:items-center">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-brand">
          {today}
        </span>
        <span className="hidden h-5 w-px shrink-0 bg-gray-200 sm:block" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {featuredPost ? (
            <span className="max-w-full truncate text-[13px] text-gray-700 sm:max-w-[280px]">
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
          <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 sm:ml-auto sm:self-auto">
            <span aria-hidden="true">*</span>
            {tier.name}
            {nextTier ? ` - ${pointsToNext} pts to ${nextTier.name}` : ""}
          </span>
        ) : null}
      </section>
    </>
  );
}

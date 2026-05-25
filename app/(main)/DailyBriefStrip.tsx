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
      <section className="mb-5 overflow-hidden rounded-xl border border-gray-200 border-l-[3px] border-l-emerald-brand bg-white px-4 py-3.5 sm:hidden">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[10px] font-bold uppercase tracking-[0.16em] text-emerald-brand">
            Daily brief
            <span className="ml-1 text-gray-400">{"\u00B7"} {today}</span>
          </p>
          {tier ? (
            <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-800">
              {tier.name}
            </span>
          ) : null}
        </div>

        <div className="mt-3 space-y-1.5">
          {featuredPost ? (
            <p className="flex min-w-0 gap-1.5 text-[13px] leading-5 text-gray-700">
              <span className="shrink-0 font-semibold text-ink">Top post:</span>
              <Link
                href={featuredPost.slug ? `/post/${featuredPost.slug}` : "/"}
                className="min-w-0 truncate hover:text-emerald-brand"
              >
                {featuredPost.title}
              </Link>
            </p>
          ) : (
            <p className="text-[13px] font-medium leading-5 text-gray-700">
              New essays, research, and quick takes from the network
            </p>
          )}

          {activeDebate ? (
            <p className="flex min-w-0 gap-1.5 text-[13px] leading-5 text-gray-700">
              <span className="shrink-0 font-semibold text-ink">Live debate:</span>
              <Link
                href={`/debates/${activeDebate.id}`}
                className="min-w-0 truncate hover:text-emerald-brand"
              >
                {activeDebate.title}
              </Link>
            </p>
          ) : null}
        </div>

        {nextTier ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-medium text-gray-500">
            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-amber-800">
              {tier?.name} {"\u00B7"} {pointsToNext} pts to {nextTier.name}
            </span>
          </div>
        ) : null}
      </section>

      <section className="mb-5 hidden flex-col gap-3 rounded-xl border border-gray-200 border-l-[3px] border-l-emerald-brand bg-white px-4 py-3.5 sm:flex sm:flex-row sm:items-center">
        <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-brand">
          {today}
        </span>
        <span className="hidden h-5 w-px shrink-0 bg-gray-200 sm:block" aria-hidden="true" />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1">
          {featuredPost ? (
            <Link
              href={featuredPost.slug ? `/post/${featuredPost.slug}` : "/"}
              className="max-w-full truncate text-[13px] text-gray-700 hover:text-emerald-brand sm:max-w-[320px]"
            >
              <strong className="font-semibold text-ink">Top post:</strong>{" "}
              {featuredPost.title}
            </Link>
          ) : null}
          {activeDebate ? (
            <Link
              href={`/debates/${activeDebate.id}`}
              className="max-w-[320px] truncate text-[13px] text-gray-700 hover:text-emerald-brand"
            >
              <strong className="font-semibold text-ink">Live debate:</strong>{" "}
              {activeDebate.title} {"\u00B7"} {activeDebate.argumentCount} arguments
            </Link>
          ) : null}
          {!featuredPost && !activeDebate ? (
            <span className="max-w-[320px] truncate text-[13px] text-gray-700">
              <strong className="font-semibold text-ink">Latest:</strong> New essays,
              research, and quick takes from the network
            </span>
          ) : null}
        </div>
        {tier ? (
          <span className="inline-flex shrink-0 items-center gap-1 self-start rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800 sm:ml-auto sm:self-auto">
            {tier.name}
            {nextTier ? ` \u00B7 ${pointsToNext} pts to ${nextTier.name}` : ""}
          </span>
        ) : null}
      </section>
    </>
  );
}

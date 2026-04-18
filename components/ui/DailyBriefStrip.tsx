import Link from "next/link";
import { getNextTier, getPointTier } from "@/lib/utils";

interface DailyBriefStripProps {
  points: number;
  topPost: {
    title: string;
    slug: string;
  } | null;
  hotDebate: {
    id: string;
    title: string;
  } | null;
}

export default function DailyBriefStrip({
  points,
  topPost,
  hotDebate,
}: DailyBriefStripProps) {
  const tier = getPointTier(points);
  const nextTier = getNextTier(points);

  if (!topPost && !hotDebate) return null;

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-col gap-2 text-sm text-gray-600 sm:flex-row sm:flex-wrap sm:items-center">
        {topPost ? (
          <Link
            href={`/post/${topPost.slug}`}
            className="truncate font-medium text-gray-900 hover:text-emerald-brand"
          >
            Today&apos;s top: &quot;{topPost.title}&quot;
          </Link>
        ) : null}
        {hotDebate ? (
          <Link
            href={`/debates/${hotDebate.id}`}
            className="truncate hover:text-emerald-brand"
          >
            Hot debate: &quot;{hotDebate.title}&quot;
          </Link>
        ) : null}
        <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
          {tier.name}
          {nextTier ? ` · ${nextTier.min - points} pts to ${nextTier.name}` : " · top tier"}
        </span>
      </div>
    </div>
  );
}

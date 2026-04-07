import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPointTier, getNextTier } from "@/lib/utils";

interface Props {
  userId: string;
  points: number;
}

export default async function DailyBrief({ userId: _userId, points }: Props) {
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartStr = todayStart.toISOString();

  const [{ data: topPost }, { data: hotDebate }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "title, slug, view_count, profiles!posts_author_id_fkey(full_name)"
      )
      .eq("status", "published")
      .gte("published_at", todayStartStr)
      .order("view_count", { ascending: false })
      .limit(1)
      .maybeSingle(),

    supabase
      .from("debates")
      .select("id, title, debate_arguments(count)")
      .in("status", ["open", "active"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const tier = getPointTier(points);
  const nextTier = getNextTier(points);

  const hotDebateArgCount = hotDebate?.debate_arguments
    ? Array.isArray(hotDebate.debate_arguments)
      ? ((hotDebate.debate_arguments[0] as unknown as { count: number })
          ?.count ?? 0)
      : 0
    : 0;

  const hasContent = topPost || hotDebate;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 mb-6">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
        Daily Brief
      </p>
      <div className="flex flex-col lg:flex-row gap-4 lg:divide-x lg:divide-gray-100">
        {topPost && (
          <div className="flex-1 lg:pr-4">
            <p className="text-xs text-gray-400 font-medium mb-1">
              Today&apos;s Top
            </p>
            <Link
              href={`/post/${topPost.slug}`}
              className="text-sm font-semibold text-gray-900 hover:text-emerald-brand transition-colors line-clamp-2 leading-snug block"
            >
              {topPost.title.length > 50
                ? topPost.title.substring(0, 50) + "…"
                : topPost.title}
            </Link>
            <p className="text-xs text-gray-400 mt-1">
              {topPost.view_count ?? 0} views
            </p>
          </div>
        )}
        {hotDebate && (
          <div className={`flex-1 ${hasContent ? "lg:px-4" : ""}`}>
            <p className="text-xs text-gray-400 font-medium mb-1">
              Hot Debate
            </p>
            <p className="text-sm font-semibold text-gray-900 line-clamp-2 leading-snug">
              {hotDebate.title.length > 40
                ? hotDebate.title.substring(0, 40) + "…"
                : hotDebate.title}
            </p>
            <Link
              href={`/debates/${hotDebate.id}`}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium mt-1 inline-block"
            >
              Join → ({hotDebateArgCount}{" "}
              {hotDebateArgCount === 1 ? "arg" : "args"})
            </Link>
          </div>
        )}
        <div className={`flex-1 ${hasContent ? "lg:pl-4" : ""}`}>
          <p className="text-xs text-gray-400 font-medium mb-1">
            Your Progress
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {tier.name} · {points} pts
          </p>
          {nextTier ? (
            <p className="text-xs text-gray-400 mt-0.5">
              {nextTier.min - points} pts to {nextTier.name}
            </p>
          ) : (
            <p className="text-xs text-emerald-600 mt-0.5">
              Top tier reached!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

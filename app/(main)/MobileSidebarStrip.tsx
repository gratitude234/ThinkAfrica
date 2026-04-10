"use client";

import { useState } from "react";
import Link from "next/link";

interface TrendingPost {
  id: string;
  title: string;
  slug: string;
  view_count: number | null;
}

interface ActiveDebate {
  id: string;
  title: string;
  debate_arguments?: { count: number }[] | unknown[];
}

interface TopContributor {
  id: string;
  username: string;
  full_name: string | null;
  points: number;
}

interface MobileSidebarStripProps {
  trendingPosts: TrendingPost[];
  activeDebates: ActiveDebate[];
  topContributors: TopContributor[];
}

type ActivePill = "trending" | "debates" | "writers" | null;

export default function MobileSidebarStrip({
  trendingPosts,
  activeDebates,
  topContributors,
}: MobileSidebarStripProps) {
  const [active, setActive] = useState<ActivePill>(null);

  const toggle = (pill: ActivePill) =>
    setActive((prev) => (prev === pill ? null : pill));

  return (
    <div className="block lg:hidden mb-6">
      {/* Pill row */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        <button
          onClick={() => toggle("trending")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active === "trending"
              ? "bg-emerald-brand text-white border-emerald-brand"
              : "bg-white border-gray-200 text-gray-700 hover:border-emerald-brand"
          }`}
        >
          🔥 Trending
        </button>
        <button
          onClick={() => toggle("debates")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active === "debates"
              ? "bg-emerald-brand text-white border-emerald-brand"
              : "bg-white border-gray-200 text-gray-700 hover:border-emerald-brand"
          }`}
        >
          ⚡ Debates
        </button>
        <button
          onClick={() => toggle("writers")}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
            active === "writers"
              ? "bg-emerald-brand text-white border-emerald-brand"
              : "bg-white border-gray-200 text-gray-700 hover:border-emerald-brand"
          }`}
        >
          🏆 Top Writers
        </button>
      </div>

      {/* Expanded content */}
      {active === "trending" && trendingPosts.length > 0 && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {trendingPosts.map((post, i) => (
            <Link
              key={post.id}
              href={`/post/${post.slug}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
            >
              <span className="text-xs font-bold text-gray-300 w-4 flex-shrink-0">
                {i + 1}
              </span>
              <p className="text-sm text-gray-800 font-medium line-clamp-1 flex-1">
                {post.title}
              </p>
              <span className="text-xs text-gray-400 flex-shrink-0">
                {post.view_count ?? 0} views
              </span>
            </Link>
          ))}
        </div>
      )}

      {active === "debates" && activeDebates.length > 0 && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {activeDebates.map((debate) => {
            const argCount = Array.isArray(debate.debate_arguments)
              ? (debate.debate_arguments[0] as { count: number })?.count ?? 0
              : 0;
            return (
              <Link
                key={debate.id}
                href={`/debates/${debate.id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
              >
                <span className="text-base flex-shrink-0">⚡</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium line-clamp-1">
                    {debate.title}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {argCount} {argCount === 1 ? "argument" : "arguments"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {active === "writers" && topContributors.length > 0 && (
        <div className="mt-3 bg-white border border-gray-200 rounded-xl overflow-hidden">
          {topContributors.map((c, i) => (
            <Link
              key={c.id}
              href={`/${c.username}`}
              className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors"
            >
              <span className="text-sm w-4 flex-shrink-0 text-gray-300 font-bold">
                {i + 1}
              </span>
              <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-700 text-xs font-bold flex-shrink-0">
                {c.full_name?.charAt(0)?.toUpperCase() ??
                  c.username?.charAt(0)?.toUpperCase() ??
                  "?"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {c.full_name ?? c.username}
                </p>
                <p className="text-xs text-emerald-brand font-semibold">
                  {c.points} pts
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

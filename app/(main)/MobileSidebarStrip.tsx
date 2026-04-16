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
type SheetSection = "trending" | "debates" | "contributors";

function getArgumentCount(debate: ActiveDebate) {
  if (!Array.isArray(debate.debate_arguments)) {
    return 0;
  }

  return (debate.debate_arguments[0] as { count?: number } | undefined)?.count ?? 0;
}

export default function MobileSidebarStrip({
  trendingPosts,
  activeDebates,
  topContributors,
}: MobileSidebarStripProps) {
  const [active, setActive] = useState<ActivePill>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [openSections, setOpenSections] = useState<Record<SheetSection, boolean>>({
    trending: true,
    debates: true,
    contributors: true,
  });

  const toggle = (pill: ActivePill) =>
    setActive((prev) => (prev === pill ? null : pill));

  const toggleSection = (section: SheetSection) => {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  };

  return (
    <div className="mb-6 block lg:hidden">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        <button
          onClick={() => toggle("trending")}
          className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            active === "trending"
              ? "border-emerald-brand bg-emerald-brand text-white"
              : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand"
          }`}
        >
          Trending
        </button>
        <button
          onClick={() => toggle("debates")}
          className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            active === "debates"
              ? "border-emerald-brand bg-emerald-brand text-white"
              : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand"
          }`}
        >
          Debates
        </button>
        <button
          onClick={() => toggle("writers")}
          className={`flex-shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            active === "writers"
              ? "border-emerald-brand bg-emerald-brand text-white"
              : "border-gray-200 bg-white text-gray-700 hover:border-emerald-brand"
          }`}
        >
          Top Writers
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex-shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:border-emerald-brand hover:text-emerald-brand"
        >
          More →
        </button>
      </div>

      {active === "trending" && trendingPosts.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {trendingPosts.map((post, index) => (
            <Link
              key={post.id}
              href={`/post/${post.slug}`}
              className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50"
            >
              <span className="w-4 flex-shrink-0 text-xs font-bold text-gray-300">
                {index + 1}
              </span>
              <p className="flex-1 text-sm font-medium text-gray-800 line-clamp-1">
                {post.title}
              </p>
              <span className="flex-shrink-0 text-xs text-gray-400">
                {post.view_count ?? 0} views
              </span>
            </Link>
          ))}
        </div>
      ) : null}

      {active === "debates" && activeDebates.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {activeDebates.map((debate) => {
            const argCount = getArgumentCount(debate);

            return (
              <Link
                key={debate.id}
                href={`/debates/${debate.id}`}
                className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <p className="line-clamp-1 text-sm font-medium text-gray-800">
                    {debate.title}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {argCount} {argCount === 1 ? "argument" : "arguments"}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      ) : null}

      {active === "writers" && topContributors.length > 0 ? (
        <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {topContributors.map((contributor, index) => (
            <Link
              key={contributor.id}
              href={`/${contributor.username}`}
              className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 transition-colors last:border-0 hover:bg-gray-50"
            >
              <span className="w-4 flex-shrink-0 text-sm font-bold text-gray-300">
                {index + 1}
              </span>
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-700">
                {contributor.full_name?.charAt(0)?.toUpperCase() ??
                  contributor.username.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-800">
                  {contributor.full_name ?? contributor.username}
                </p>
                <p className="text-xs font-semibold text-emerald-brand">
                  {contributor.points} pts
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {sheetOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-gray-900/40"
            aria-label="Close sidebar sheet"
          />

          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3">
              <div className="mx-auto h-1.5 w-12 rounded-full bg-gray-200" />
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                className="absolute right-4 top-3 text-lg text-gray-400 transition-colors hover:text-gray-600"
                aria-label="Close"
              >
                x
              </button>
            </div>

            <div className="max-h-[80vh] overflow-y-auto px-4 pb-6">
              <section className="rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection("trending")}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    🔥 Trending This Week
                  </h3>
                  <span className="text-sm text-gray-400">
                    {openSections.trending ? "−" : "+"}
                  </span>
                </button>
                {openSections.trending ? (
                  <div className="divide-y divide-gray-100">
                    {trendingPosts.slice(0, 5).map((post) => (
                      <Link
                        key={post.id}
                        href={`/post/${post.slug}`}
                        className="block px-4 py-3 transition-colors hover:bg-gray-50"
                        onClick={() => setSheetOpen(false)}
                      >
                        <p className="text-sm font-medium text-gray-800">{post.title}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          {post.view_count ?? 0} views
                        </p>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>

              <section className="mt-4 rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection("debates")}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    ⚡ Active Debates
                  </h3>
                  <span className="text-sm text-gray-400">
                    {openSections.debates ? "−" : "+"}
                  </span>
                </button>
                {openSections.debates ? (
                  <div className="divide-y divide-gray-100">
                    {activeDebates.slice(0, 3).map((debate) => {
                      const argCount = getArgumentCount(debate);

                      return (
                        <div key={debate.id} className="px-4 py-3">
                          <p className="text-sm font-medium text-gray-800">
                            {debate.title}
                          </p>
                          <div className="mt-1 flex items-center justify-between text-xs text-gray-400">
                            <span>
                              {argCount} {argCount === 1 ? "argument" : "arguments"}
                            </span>
                            <Link
                              href={`/debates/${debate.id}`}
                              onClick={() => setSheetOpen(false)}
                              className="font-medium text-emerald-600"
                            >
                              Join →
                            </Link>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>

              <section className="mt-4 rounded-xl border border-gray-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleSection("contributors")}
                  className="flex w-full items-center justify-between px-4 py-3 text-left"
                >
                  <h3 className="text-sm font-semibold text-gray-900">
                    🏆 Top Contributors
                  </h3>
                  <span className="text-sm text-gray-400">
                    {openSections.contributors ? "−" : "+"}
                  </span>
                </button>
                {openSections.contributors ? (
                  <div className="divide-y divide-gray-100">
                    {topContributors.slice(0, 3).map((contributor) => (
                      <Link
                        key={contributor.id}
                        href={`/${contributor.username}`}
                        onClick={() => setSheetOpen(false)}
                        className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50"
                      >
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                          {contributor.full_name?.charAt(0)?.toUpperCase() ??
                            contributor.username.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">
                            {contributor.full_name ?? contributor.username}
                          </p>
                          <p className="text-xs text-gray-400">{contributor.points} points</p>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";

interface TrendingPost {
  id: string;
  title: string;
  slug: string;
  view_count: number | null;
}

interface MobileTrendingStripProps {
  trendingPosts: TrendingPost[];
}

export default function MobileTrendingStrip({
  trendingPosts,
}: MobileTrendingStripProps) {
  if (trendingPosts.length === 0) {
    return null;
  }

  return (
    <div className="mb-6 block lg:hidden">
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">
            Trending this week
          </h2>
          <span className="text-xs text-gray-400">Top reads</span>
        </div>
        <div className="divide-y divide-gray-100">
          {trendingPosts.map((post, index) => (
            <Link
              key={post.id}
              href={`/post/${post.slug}`}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-canvas"
            >
              <span className="w-4 flex-shrink-0 text-xs font-bold text-gray-300">
                {index + 1}
              </span>
              <p className="line-clamp-1 flex-1 text-sm font-medium text-gray-800">
                {post.title}
              </p>
              <span className="flex-shrink-0 text-xs text-gray-400">
                {post.view_count ?? 0} views
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

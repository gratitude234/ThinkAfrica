"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { getPostDisplayTitle, getPostMetadataTitle } from "@/lib/postDisplay";

interface ProfilePostSummary {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  created_at: string;
  published_at: string | null;
  read_count?: number | null;
  profiles?: { username: string; full_name: string | null } | null;
}

interface PostsSectionProps {
  posts: ProfilePostSummary[];
  fullName: string;
}

const PREVIEW_COUNT = 5;

export default function PostsSection({ posts, fullName }: PostsSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (posts.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Posts</h2>
        <p className="mt-2 text-sm text-gray-500">
          {fullName} hasn&apos;t posted anything yet.
        </p>
      </section>
    );
  }

  const visiblePosts = expanded ? posts : posts.slice(0, PREVIEW_COUNT);

  return (
    <section className="min-w-0 rounded-xl border border-gray-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
            Activity
          </p>
          <h2 className="mt-1 text-base font-semibold text-gray-900">
            Posts / {posts.length}
          </h2>
        </div>
        {posts.length > PREVIEW_COUNT ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            className="text-sm font-medium text-emerald-brand transition-colors hover:text-emerald-700"
          >
            {expanded ? "Show less" : `See all (${posts.length}) ->`}
          </button>
        ) : null}
      </div>

      <div className="divide-y divide-gray-100">
        {visiblePosts.map((post) => {
          const publishedDate = post.published_at ?? post.created_at;
          const displayTitle = getPostDisplayTitle(post);
          const leadText = displayTitle ?? post.excerpt ?? getPostMetadataTitle(post, post.profiles);

          return (
            <article key={post.id} className="flex min-w-0 flex-col gap-1.5 py-4 first:pt-0 last:pb-0">
              <Link
                href={`/post/${post.slug}`}
                className="block min-w-0 transition-colors hover:text-emerald-brand"
              >
                {displayTitle ? (
                  <h4 className="truncate text-sm font-semibold text-gray-900">
                    {displayTitle}
                  </h4>
                ) : (
                  <p className="line-clamp-2 text-sm font-medium text-gray-900">{leadText}</p>
                )}
              </Link>
              {displayTitle && post.excerpt ? (
                <p className="line-clamp-1 text-sm text-gray-500">{post.excerpt}</p>
              ) : null}
              <p className="text-xs text-gray-400">
                {formatDate(publishedDate)}
                {(post.read_count ?? 0) > 0
                  ? ` · ${(post.read_count ?? 0).toLocaleString()} reads`
                  : ""}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}

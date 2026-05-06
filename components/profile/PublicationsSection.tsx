"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/lib/utils";

interface PublicationPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  type: string;
  created_at: string;
  published_at: string | null;
  view_count?: number | null;
  isCoAuthor?: boolean;
  co_authors?: Array<{
    user_id: string;
    profile: { username: string; full_name: string | null } | null;
  }>;
}

interface PublicationsSectionProps {
  posts: PublicationPost[];
  fullName: string;
}

const GROUP_CONFIG = [
  { type: "research", label: "Research" },
  { type: "policy_brief", label: "Policy Briefs" },
  { type: "essay", label: "Essays" },
  { type: "blog", label: "Quick Takes" },
] as const;

export default function PublicationsSection({
  posts,
  fullName,
}: PublicationsSectionProps) {
  const [expandedTypes, setExpandedTypes] = useState<Record<string, boolean>>(
    {}
  );

  if (posts.length === 0) {
    return (
      <section className="rounded-xl border border-gray-200 bg-white p-8 text-center">
        <h2 className="text-lg font-semibold text-gray-900">Publications</h2>
        <p className="mt-2 text-sm text-gray-500">
          {fullName} hasn&apos;t published anything yet.
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
          Publications
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold text-gray-900">
          Published work
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Organized by format so the strongest signal is easy to scan.
        </p>
      </div>

      {GROUP_CONFIG.map(({ type, label }) => {
        const groupPosts = posts.filter((post) => post.type === type);
        if (groupPosts.length === 0) return null;

        const expanded = expandedTypes[type] ?? false;
        const visiblePosts = expanded ? groupPosts : groupPosts.slice(0, 5);

        return (
          <div
            key={type}
            className="rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">
                {label} / {groupPosts.length}
              </h3>
              {groupPosts.length > 5 ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedTypes((current) => ({
                      ...current,
                      [type]: !expanded,
                    }))
                  }
                  className="text-sm font-medium text-emerald-brand transition-colors hover:text-emerald-700"
                >
                  {expanded ? "Show less" : `See all (${groupPosts.length}) ->`}
                </button>
              ) : null}
            </div>

            <div className="divide-y divide-gray-100">
              {visiblePosts.map((post) => {
                const publishedDate = post.published_at ?? post.created_at;
                return (
                  <Link
                    key={post.id}
                    href={`/post/${post.slug}`}
                    className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 transition-colors hover:text-emerald-brand md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <h4 className="truncate text-sm font-semibold text-gray-900">
                        {post.title}
                        {post.isCoAuthor ? (
                          <span className="ml-2 rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-purple-700">
                            Co-author
                          </span>
                        ) : null}
                      </h4>
                      {post.excerpt ? (
                        <p className="mt-1 line-clamp-1 text-sm text-gray-500">
                          {post.excerpt}
                        </p>
                      ) : null}
                      {post.co_authors && post.co_authors.length > 0 ? (
                        <p className="mt-1 line-clamp-1 text-xs text-gray-400">
                          With{" "}
                          {post.co_authors
                            .map(
                              (coAuthor) =>
                                coAuthor.profile?.full_name ??
                                coAuthor.profile?.username ??
                                "coauthor"
                            )
                            .join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-sm text-gray-400 md:text-right">
                      <p>{formatDate(publishedDate)}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

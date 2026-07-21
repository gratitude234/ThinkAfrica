"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { formatDate } from "@/lib/utils";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import {
  getArticleFormatLabel,
  getContentKindLabel,
  isFormallyReviewed,
  resolveArticleFormat,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";

interface PublicationPost {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  citation_id?: string | null;
  published_version_id?: string | null;
  created_at: string;
  published_at: string | null;
  view_count?: number | null;
  read_count?: number | null;
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

// Grouped by resolved content_kind, not legacy `type` -- a generic Article
// (article_format null) and a legacy Essay/Policy Brief all belong in the
// same "Articles" group; only their secondary format badge differs. "post"
// is deliberately absent: resolved Post content lives in the separate
// PostsSection instead — Publications is reserved for Article/Research.
const GROUPS: Array<{ kind: Extract<ContentKind, "research" | "article">; label: string }> = [
  { kind: "research", label: "Research" },
  { kind: "article", label: "Articles" },
];

function PublicationSignalBadge({
  children,
  variant = "gray",
}: {
  children: ReactNode;
  variant?: "gray" | "sky" | "purple" | "emerald";
}) {
  const styles = {
    gray: "border-gray-200 bg-gray-50 text-gray-600",
    sky: "border-sky-200 bg-sky-50 text-sky-700",
    purple: "border-purple-200 bg-purple-50 text-purple-700",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  };

  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${styles[variant]}`}
    >
      {children}
    </span>
  );
}

export default function PublicationsSection({
  posts,
  fullName,
}: PublicationsSectionProps) {
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(
    {}
  );

  // Not just "posts.length === 0": posts may be non-empty but contain only
  // kinds that no longer group here (e.g. all Post records), in which case
  // Publications should still show its empty state rather than a heading
  // with no groups under it.
  const hasPublications = GROUPS.some(({ kind }) =>
    posts.some((post) => resolveContentKind(post) === kind)
  );

  if (!hasPublications) {
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
    <section className="min-w-0 space-y-6">
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

      {GROUPS.map(({ kind, label }) => {
        const groupPosts = posts.filter((post) => resolveContentKind(post) === kind);
        if (groupPosts.length === 0) return null;

        const expanded = expandedGroups[kind] ?? false;
        const visiblePosts = expanded ? groupPosts : groupPosts.slice(0, 5);

        return (
          <div
            key={kind}
            className="min-w-0 rounded-xl border border-gray-200 bg-white p-5"
          >
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="text-base font-semibold text-gray-900">
                {label} / {groupPosts.length}
              </h3>
              {groupPosts.length > 5 ? (
                <button
                  type="button"
                  onClick={() =>
                    setExpandedGroups((current) => ({
                      ...current,
                      [kind]: !expanded,
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
                const articleFormat = resolveArticleFormat(post);
                const formatLabel = getArticleFormatLabel(articleFormat);
                return (
                  <article
                    key={post.id}
                    className="flex min-w-0 flex-col gap-3 py-4 first:pt-0 last:pb-0 md:flex-row md:items-start md:justify-between"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/post/${post.slug}`}
                        className="block transition-colors hover:text-emerald-brand"
                      >
                        <h4 className="truncate text-sm font-semibold text-gray-900">
                        {getPostDisplayTitle(post) ?? "Untitled"}
                        </h4>
                      </Link>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {formatLabel ? (
                          <PublicationSignalBadge variant="gray">
                            {getContentKindLabel(kind)} · {formatLabel}
                          </PublicationSignalBadge>
                        ) : null}
                        {isFormallyReviewed(post) ? (
                          <PublicationSignalBadge variant="emerald">
                            Reviewed
                          </PublicationSignalBadge>
                        ) : null}
                        {post.citation_id ? (
                          <Link href={`/publication/${post.citation_id}`}>
                            <PublicationSignalBadge variant="sky">
                              Citable
                            </PublicationSignalBadge>
                          </Link>
                        ) : null}
                        {post.isCoAuthor ? (
                          <PublicationSignalBadge variant="purple">
                            Co-author
                          </PublicationSignalBadge>
                        ) : null}
                      </div>
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
                      {(post.read_count ?? 0) > 0 ? (
                        <p className="mt-1 text-xs">
                          {(post.read_count ?? 0).toLocaleString()} reads
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        );
      })}
    </section>
  );
}

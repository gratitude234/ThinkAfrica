"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PostCover from "@/components/post/PostCover";
import {
  getArticleFormatLabel,
  resolveArticleFormat,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";
import {
  getContributionQualityLabels,
  INTELLECTUAL_RECORD_LABEL_DEFINITIONS,
  type IntellectualRecordLabel,
} from "@/lib/intellectualRecord";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";
import { FEATURE_FLAGS } from "@/lib/featureFlags";

export interface ProfileContentItem {
  id: string;
  title: string | null;
  slug: string;
  in_response_to?: string | null;
  excerpt: string | null;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  citation_id?: string | null;
  published_version_id?: string | null;
  reference_count?: number;
  response_count?: number;
  created_at: string;
  published_at: string | null;
  cover_image_url?: string | null;
  read_count?: number | null;
  isCoAuthor?: boolean;
  profiles?: {
    username: string;
    full_name: string | null;
    university?: string | null;
    avatar_url?: string | null;
  } | null;
  co_authors?: Array<{
    user_id: string;
    profile: { username: string; full_name: string | null } | null;
  }>;
}

export interface ProfileDebateContribution {
  id: string;
  content: string;
  stance: string | null;
  upvotes: number | null;
  round_number: number | null;
  created_at: string;
  debates: {
    id: string;
    title: string;
    status?: string | null;
  } | null;
}

type PublicationTab = Extract<ContentKind, "post" | "article" | "research">;
type Tab = "record" | "response" | PublicationTab | "debate";

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "record", label: "All" },
  { value: "post", label: "Posts" },
  { value: "response", label: "Responses" },
  { value: "article", label: "Articles" },
  ...(FEATURE_FLAGS.research
    ? [{ value: "research" as const, label: "Research" }]
    : []),
  { value: "debate", label: "Debates" },
];

const EMPTY_COPY: Record<
  Tab,
  { title: string; description: string; action: string; href: string }
> = {
  record: {
    title: "No contributions yet",
    description:
      "Published ideas, responses, and debate arguments will form this Intellectual Record.",
    action: "Add your first contribution",
    href: "/write",
  },
  post: {
    title: "No posts yet",
    description: "Short thoughts and questions will appear here.",
    action: "Start writing",
    href: "/write",
  },
  response: {
    title: "No responses yet",
    description:
      "Published contributions that respond directly to another idea will appear here.",
    action: "Find an idea to respond to",
    href: "/explore",
  },
  article: {
    title: "No articles yet",
    description: "Essays, opinions, and policy briefs will appear here.",
    action: "Start writing",
    href: "/write",
  },
  research: {
    title: "No published research yet",
    description: "Research appears here after formal editorial review.",
    action: "Submit research",
    href: "/submit/research",
  },
  debate: {
    title: "No debate contributions yet",
    description: "Public arguments contributed to debates will appear here.",
    action: "Explore debates",
    href: "/debates",
  },
};

const QUALITY_LABEL_CLASSES: Record<IntellectualRecordLabel["tone"], string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
  sky: "border-sky-200 bg-sky-50 text-sky-700",
  purple: "border-purple-200 bg-purple-50 text-purple-700",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
};

type RecordEntry =
  | {
      key: string;
      date: string;
      kind: "publication";
      item: ProfileContentItem;
    }
  | {
      key: string;
      date: string;
      kind: "debate";
      item: ProfileDebateContribution;
    };

function QualityLabels({ item }: { item: ProfileContentItem }) {
  const labels = getContributionQualityLabels({
    citationId: item.citation_id,
    publishedVersionId: item.published_version_id,
    referenceCount: item.reference_count,
    coAuthorCount: item.co_authors?.length ?? 0,
    isCoAuthor: item.isCoAuthor,
  });

  if (labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Quality labels">
      {labels.map((label) => {
        const className = `rounded-full border px-2 py-0.5 text-[10px] font-semibold ${QUALITY_LABEL_CLASSES[label.tone]}`;
        return label.key === "citable" && item.citation_id ? (
          <Link
            key={label.key}
            href={`/publication/${item.citation_id}`}
            title={label.description}
            className={`${className} transition-colors hover:border-sky-300 hover:text-sky-900`}
          >
            {label.label}
          </Link>
        ) : (
          <span key={label.key} title={label.description} className={className}>
            {label.label}
          </span>
        );
      })}
    </div>
  );
}

function ProfileCard({ item }: { item: ProfileContentItem }) {
  const kind = resolveContentKind(item) ?? "post";
  const title = getPostDisplayTitle(item);
  const excerpt = sanitizePostExcerpt(item.excerpt);
  const date = item.published_at ?? item.created_at;
  const format =
    kind === "article" ? getArticleFormatLabel(resolveArticleFormat(item)) : null;
  const coauthors = (item.co_authors ?? [])
    .map((author) => author.profile?.full_name ?? author.profile?.username)
    .filter(Boolean);

  return (
    <article
      className={`overflow-hidden rounded-xl border bg-card p-4 sm:p-[18px] ${
        kind === "research" ? "border-purple-100" : "border-card-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={`font-display text-[10.5px] font-bold uppercase tracking-[0.15em] ${
            kind === "research" || format === "Policy Brief"
              ? "text-purple-accent"
              : kind === "article"
                ? "text-gold-ink"
                : "text-emerald-brand"
          }`}
        >
          {item.in_response_to
            ? "Response"
            : kind === "research"
              ? "Research"
              : kind === "article"
                ? `Article${format ? ` · ${format}` : ""}`
                : "Post"}
        </p>
        <QualityLabels item={item} />
      </div>

      {kind === "post" && !title ? (
        <p className="mt-2 line-clamp-5 whitespace-pre-line text-[16px] leading-[1.62] text-ink">
          {excerpt || "View post"}
        </p>
      ) : (
        <>
          <h3 className="mt-1.5 font-display text-[19px] font-semibold leading-[1.22] text-ink">
            {title ?? "Untitled"}
          </h3>
          {coauthors.length > 0 ? (
            <p className="mt-1 text-[11.5px] text-ink-muted">
              With {coauthors.join(", ")}
            </p>
          ) : null}
          {excerpt ? (
            <p className="mt-2 line-clamp-2 text-[13.5px] leading-[1.58] text-ink-soft">
              {excerpt}
            </p>
          ) : null}
        </>
      )}

      <p className="mt-2 text-[11.5px] text-ink-muted">
        {formatRelativeTime(date)}
        {(item.read_count ?? 0) > 0
          ? ` · ${item.read_count!.toLocaleString()} reads`
          : ""}
        {(item.response_count ?? 0) > 0
          ? ` · ${item.response_count!.toLocaleString()} responses`
          : ""}
      </p>

      {item.cover_image_url?.trim() && kind !== "research" ? (
        <PostCover
          src={item.cover_image_url}
          alt={title ?? excerpt ?? "Publication cover"}
          type={item.type}
          content_kind={item.content_kind}
          article_format={item.article_format}
          sizes="(max-width: 640px) calc(100vw - 56px), 680px"
          className="mt-3 aspect-[16/9] w-full rounded-[10px] bg-canvas"
          imageClassName="object-cover"
        />
      ) : null}

      <Link
        href={`/post/${item.slug}`}
        className="mt-3 inline-flex min-h-11 items-center rounded-lg text-[12px] font-semibold text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
      >
        {kind === "research"
          ? "View paper →"
          : item.in_response_to
            ? "Read response →"
            : kind === "article"
              ? "Read article →"
              : "View post →"}
      </Link>
    </article>
  );
}

function DebateCard({ contribution }: { contribution: ProfileDebateContribution }) {
  return (
    <article className="rounded-xl border border-amber-100 bg-card p-4 sm:p-[18px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[10.5px] font-bold uppercase tracking-[0.15em] text-amber-700">
          Debate argument
        </span>
        {contribution.stance ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
            {contribution.stance}
          </span>
        ) : null}
      </div>
      <h3 className="mt-2 font-display text-[17px] font-semibold text-ink">
        {contribution.debates?.title ?? "Public debate"}
      </h3>
      <p className="mt-2 line-clamp-4 whitespace-pre-line text-[14px] leading-6 text-ink-soft">
        {contribution.content}
      </p>
      <p className="mt-2 text-[11.5px] text-ink-muted">
        {formatRelativeTime(contribution.created_at)}
        {(contribution.upvotes ?? 0) > 0
          ? ` · ${contribution.upvotes!.toLocaleString()} reader votes`
          : ""}
      </p>
      {contribution.debates ? (
        <Link
          href={`/debates/${contribution.debates.id}`}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg text-[12px] font-semibold text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
        >
          View debate →
        </Link>
      ) : null}
    </article>
  );
}

function QualityLabelLegend() {
  return (
    <details className="rounded-xl border border-card-border bg-card px-4 py-3 text-sm">
      <summary className="cursor-pointer font-semibold text-ink-soft">
        How quality labels work
      </summary>
      <p className="mt-2 text-xs leading-5 text-ink-muted">
        Labels describe evidence attached to a contribution. They are not popularity scores.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {Object.values(INTELLECTUAL_RECORD_LABEL_DEFINITIONS).map((label) => (
          <li key={label.key} className="text-xs leading-5 text-ink-soft">
            <span className="font-semibold text-ink">{label.label}:</span>{" "}
            {label.description}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function ProfileContentTabs({
  items,
  debateContributions = [],
  isOwnProfile,
}: {
  items: ProfileContentItem[];
  debateContributions?: ProfileDebateContribution[];
  isOwnProfile: boolean;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("record");
  const visibleItems = useMemo(
    () =>
      FEATURE_FLAGS.research
        ? items
        : items.filter((item) => resolveContentKind(item) !== "research"),
    [items]
  );
  const grouped = useMemo(() => {
    const publications = {
      post: visibleItems.filter(
        (item) => resolveContentKind(item) === "post" && !item.in_response_to
      ),
      response: visibleItems.filter((item) => Boolean(item.in_response_to)),
      article: visibleItems.filter((item) => resolveContentKind(item) === "article"),
      research: visibleItems.filter((item) => resolveContentKind(item) === "research"),
    };
    const record: RecordEntry[] = [
      ...visibleItems.map((item) => ({
        key: `publication-${item.id}`,
        date: item.published_at ?? item.created_at,
        kind: "publication" as const,
        item,
      })),
      ...debateContributions.map((item) => ({
        key: `debate-${item.id}`,
        date: item.created_at,
        kind: "debate" as const,
        item,
      })),
    ].sort(
      (left, right) =>
        new Date(right.date).getTime() - new Date(left.date).getTime()
    );

    return { ...publications, debate: debateContributions, record };
  }, [debateContributions, visibleItems]);

  const counts: Record<Tab, number> = {
    record: grouped.record.length,
    post: grouped.post.length,
    response: grouped.response.length,
    article: grouped.article.length,
    research: grouped.research.length,
    debate: grouped.debate.length,
  };
  const empty = EMPTY_COPY[activeTab];

  return (
    <section
      id="intellectual-record"
      className="min-w-0 scroll-mt-24"
      aria-labelledby="intellectual-record-title"
    >
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-brand">
            Intellectual Record
          </p>
          <h2
            id="intellectual-record-title"
            className="font-display mt-1 text-xl font-semibold text-ink"
          >
            Contributions, in public
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-muted">
            A dated record of published ideas, linked responses, and debate arguments.
          </p>
        </div>
        {isOwnProfile ? (
          <Link
            href="/write"
            className="inline-flex min-h-11 w-fit items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
          >
            Add contribution
          </Link>
        ) : null}
      </div>

      <QualityLabelLegend />

      <div
        className="mb-3 mt-4 flex overflow-x-auto border-b border-card-border bg-canvas [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Intellectual Record contribution types"
      >
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls="profile-content-panel"
            onClick={() => setActiveTab(tab.value)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${
              activeTab === tab.value
                ? "border-emerald-brand text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {tab.label}{" "}
            <span className="ml-1 text-[11px] text-ink-muted">
              {counts[tab.value]}
            </span>
          </button>
        ))}
      </div>

      <div id="profile-content-panel" role="tabpanel" className="space-y-3">
        {counts[activeTab] > 0 ? (
          activeTab === "record" ? (
            grouped.record.map((entry) =>
              entry.kind === "publication" ? (
                <ProfileCard key={entry.key} item={entry.item} />
              ) : (
                <DebateCard key={entry.key} contribution={entry.item} />
              )
            )
          ) : activeTab === "debate" ? (
            grouped.debate.map((item) => (
              <DebateCard key={item.id} contribution={item} />
            ))
          ) : (
            grouped[activeTab].map((item) => (
              <ProfileCard key={item.id} item={item} />
            ))
          )
        ) : (
          <div className="rounded-xl border border-dashed border-card-border bg-card p-8 text-center">
            <h3 className="font-display text-xl font-semibold text-ink">{empty.title}</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-muted">
              {empty.description}
            </p>
            {isOwnProfile ? (
              <Link
                href={empty.href}
                className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2"
              >
                {empty.action}
              </Link>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}

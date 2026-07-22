"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import PostCover from "@/components/post/PostCover";
import {
  getArticleFormatLabel,
  isFormallyReviewed,
  resolveArticleFormat,
  resolveContentKind,
  type ContentKind,
} from "@/lib/contentModel";
import { getPostDisplayTitle } from "@/lib/postDisplay";
import { formatRelativeTime, sanitizePostExcerpt } from "@/lib/utils";

export interface ProfileContentItem {
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
  cover_image_url?: string | null;
  read_count?: number | null;
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

type Tab = Extract<ContentKind, "post" | "article" | "research">;

const TABS: Array<{ value: Tab; label: string }> = [
  { value: "post", label: "Posts" },
  { value: "article", label: "Articles" },
  { value: "research", label: "Research" },
];

const EMPTY_COPY: Record<Tab, { title: string; description: string; action: string; href: string }> = {
  post: { title: "No posts yet", description: "Short thoughts and questions will appear here.", action: "Write a post", href: "/create/post" },
  article: { title: "No articles yet", description: "Essays, opinions, and policy briefs will appear here.", action: "Write an article", href: "/write?kind=article" },
  research: { title: "No published research yet", description: "Research appears here after formal editorial review.", action: "Submit research", href: "/submit/research" },
};

function ProfileCard({ item, kind }: { item: ProfileContentItem; kind: Tab }) {
  const title = getPostDisplayTitle(item);
  const excerpt = sanitizePostExcerpt(item.excerpt);
  const date = item.published_at ?? item.created_at;
  const format = kind === "article" ? getArticleFormatLabel(resolveArticleFormat(item)) : null;
  const evidence = item.citation_id ? "Citable" : isFormallyReviewed(item) ? "Reviewed" : null;
  const coauthors = (item.co_authors ?? [])
    .map((author) => author.profile?.full_name ?? author.profile?.username)
    .filter(Boolean);

  return (
    <article className={`overflow-hidden rounded-xl border bg-white p-4 sm:p-[18px] ${kind === "research" ? "border-purple-100" : "border-gray-200"}`}>
      {kind === "post" ? (
        <>
          <p className="line-clamp-5 whitespace-pre-line text-[16px] leading-[1.62] text-gray-800">{excerpt || title || "View post"}</p>
          <p className="mt-2 text-[11.5px] text-gray-500">{formatRelativeTime(date)}</p>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <p className={`font-display text-[10.5px] font-bold uppercase tracking-[0.15em] ${kind === "research" || format === "Policy Brief" ? "text-purple-accent" : "text-gold-ink"}`}>
              {kind === "research" ? "Research" : `Article${format ? ` · ${format}` : ""}`}
            </p>
            {kind === "research" && evidence ? <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">{evidence}</span> : null}
          </div>
          <h3 className="mt-1.5 font-display text-[19px] font-semibold leading-[1.22] text-ink">{title ?? "Untitled"}</h3>
          {coauthors.length > 0 ? <p className="mt-1 text-[11.5px] text-gray-500">With {coauthors.join(", ")}</p> : null}
          {excerpt ? <p className="mt-2 line-clamp-2 text-[13.5px] leading-[1.58] text-gray-600">{excerpt}</p> : null}
          <p className="mt-2 text-[11.5px] text-gray-500">{formatRelativeTime(date)}{(item.read_count ?? 0) > 0 ? ` · ${item.read_count!.toLocaleString()} reads` : ""}</p>
        </>
      )}

      {item.cover_image_url?.trim() && kind !== "research" ? (
        <PostCover
          src={item.cover_image_url}
          alt={title ?? excerpt ?? "Publication cover"}
          type={item.type}
          content_kind={item.content_kind}
          article_format={item.article_format}
          sizes="(max-width: 640px) calc(100vw - 56px), 680px"
          className="mt-3 aspect-[16/9] w-full rounded-[10px] bg-gray-100"
          imageClassName="object-cover"
        />
      ) : null}

      <Link href={`/post/${item.slug}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg text-[12px] font-semibold text-emerald-brand hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">
        {kind === "research" ? "View paper →" : kind === "article" ? "Read article →" : "View post →"}
      </Link>
    </article>
  );
}

export default function ProfileContentTabs({ items, isOwnProfile }: { items: ProfileContentItem[]; isOwnProfile: boolean }) {
  const [activeTab, setActiveTab] = useState<Tab>("post");
  const grouped = useMemo(
    () => ({
      post: items.filter((item) => resolveContentKind(item) === "post"),
      article: items.filter((item) => resolveContentKind(item) === "article"),
      research: items.filter((item) => resolveContentKind(item) === "research"),
    }),
    [items]
  );
  const visible = grouped[activeTab];
  const empty = EMPTY_COPY[activeTab];

  return (
    <section className="min-w-0" aria-label="Published content">
      <div className="mb-3 flex overflow-x-auto border-b border-gray-200 bg-canvas [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Content by type">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.value}
            aria-controls="profile-content-panel"
            onClick={() => setActiveTab(tab.value)}
            className={`-mb-px min-h-11 shrink-0 border-b-2 px-4 text-[13px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold ${activeTab === tab.value ? "border-emerald-brand text-ink" : "border-transparent text-gray-500 hover:text-ink"}`}
          >
            {tab.label} <span className="ml-1 text-[11px] text-gray-400">{grouped[tab.value].length}</span>
          </button>
        ))}
      </div>

      <div id="profile-content-panel" role="tabpanel" className="space-y-3">
        {visible.length > 0 ? visible.map((item) => <ProfileCard key={item.id} item={item} kind={activeTab} />) : (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <h2 className="font-display text-xl font-semibold text-ink">{empty.title}</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-gray-500">{empty.description}</p>
            {isOwnProfile ? <Link href={empty.href} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2">{empty.action}</Link> : null}
          </div>
        )}
      </div>
    </section>
  );
}

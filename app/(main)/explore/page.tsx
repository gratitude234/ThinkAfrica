import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getDiscoverData,
  getDiscoverTab,
  type DiscoverConversation,
  type DiscoverData,
  type DiscoverPerson,
  type DiscoverTab,
} from "@/lib/discoverData";
import { type PostCardData } from "@/components/post/PostCard";
import { resolveArticleFormat, resolveContentKind } from "@/lib/contentModel";
import PostCardImpression from "@/components/post/PostCardImpression";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import DiscoverTrackedLink from "../discover/DiscoverTrackedLink";
import DiscoverTopicsGrid from "../discover/DiscoverTopicsGrid";
import { formatDate } from "@/lib/utils";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";

export const revalidate = 60;

export const metadata: Metadata = {
  title: "Explore African Student Posts, Articles, and Research",
  description:
    "Discover trending posts, articles, citable research, topics, and emerging African student writers on Indegenius.",
  alternates: { canonical: canonicalPath("/explore") },
  openGraph: {
    title: "Explore African Student Posts, Articles, and Research",
    description:
      "Discover trending posts, articles, citable research, topics, and emerging African student writers on Indegenius.",
    url: absoluteUrl("/explore"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore African Student Posts, Articles, and Research",
    description:
      "Discover trending posts, articles, citable research, topics, and emerging African student writers on Indegenius.",
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    genre?: string;
  }>;
}

const TABS: Array<{
  value: DiscoverTab;
  label: string;
  mobileLabel?: string;
  href: string;
}> = [
  { value: "for-you", label: "For you", href: "/explore" },
  { value: "trending", label: "Trending", href: "/explore?tab=trending" },
  {
    value: "citable",
    label: "Citable",
    mobileLabel: "Citable",
    href: "/explore?tab=citable",
  },
  { value: "topics", label: "Topics", href: "/explore?tab=topics" },
  { value: "people", label: "People", href: "/explore?tab=people" },
];

// Primary Explore filters are the three top-level content kinds (plus
// "All"). "Blog" and "Policy" used to be shown as peer-level primary
// filters, but Blog/Essay/Policy Brief are not top-level content types --
// see docs/content-model.md. Essay/Policy Brief now live one level down,
// as a genre *refinement* that only applies while "Articles" is active.
export type ExplorePrimaryFilter = "all" | "post" | "article" | "research";
export type ExploreGenreFilter = "all" | "general" | "essay" | "policy_brief";
type DiscoveryPromptSource = DiscoverData["personalizedPrompts"][number]["source"];

export const PRIMARY_FILTERS: Array<{
  value: ExplorePrimaryFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "post", label: "Posts" },
  { value: "article", label: "Articles" },
  { value: "research", label: "Research" },
];

export const GENRE_FILTERS: Array<{
  value: ExploreGenreFilter;
  label: string;
}> = [
  { value: "all", label: "All genres" },
  { value: "general", label: "General" },
  { value: "essay", label: "Essay" },
  { value: "policy_brief", label: "Policy Brief" },
];

function isExploreGenreFilter(value: string): value is ExploreGenreFilter {
  return (
    value === "all" || value === "general" || value === "essay" || value === "policy_brief"
  );
}

// Legacy `?type=` values from before the three-content-kind model. Kept so
// old links/bookmarks keep resolving:
//   - `blog` (the old flat type) -> Posts.
//   - `essay`/`policy_brief` (the old flat types) -> Articles, narrowed to
//     that specific genre -- these historically meant "only this genre",
//     unlike the current `article` value which means "all genres".
//   - `post`/`article`/`research` are the current primary-filter values.
const LEGACY_TYPE_PARAM: Record<string, { primary: ExplorePrimaryFilter; genre: ExploreGenreFilter }> = {
  blog: { primary: "post", genre: "all" },
  post: { primary: "post", genre: "all" },
  article: { primary: "article", genre: "all" },
  essay: { primary: "article", genre: "essay" },
  policy_brief: { primary: "article", genre: "policy_brief" },
  research: { primary: "research", genre: "all" },
};

export function getExploreFilters(
  typeParam: string | null | undefined,
  genreParam: string | null | undefined
): { primary: ExplorePrimaryFilter; genre: ExploreGenreFilter } {
  if (!typeParam || !(typeParam in LEGACY_TYPE_PARAM)) {
    return { primary: "all", genre: "all" };
  }

  const mapped = LEGACY_TYPE_PARAM[typeParam];
  if (mapped.primary === "article" && genreParam && isExploreGenreFilter(genreParam)) {
    return { primary: "article", genre: genreParam };
  }
  return mapped;
}

function getExploreHref(
  tab: DiscoverTab,
  primary: ExplorePrimaryFilter = "all",
  genre: ExploreGenreFilter = "all"
) {
  const params = new URLSearchParams();

  if (tab !== "for-you") {
    params.set("tab", tab);
  }

  if (primary !== "all" && (tab === "for-you" || tab === "trending")) {
    params.set("type", primary);
    if (primary === "article" && genre !== "all") {
      params.set("genre", genre);
    }
  }

  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}

export function filterPostsByExplore(
  posts: PostCardData[],
  primary: ExplorePrimaryFilter,
  genre: ExploreGenreFilter = "all"
) {
  // Every filter is resolved against the new-model columns, never the
  // legacy `type` column directly (see docs/content-model.md), so a
  // brand-new Policy-Brief-format Article (whose legacy `type` is always
  // "essay") and a future titleless Post with no legacy type are still
  // classified correctly.
  if (primary === "post") {
    return posts.filter((post) => resolveContentKind(post) === "post");
  }
  if (primary === "research") {
    return posts.filter((post) => resolveContentKind(post) === "research");
  }
  if (primary === "article") {
    const articles = posts.filter((post) => resolveContentKind(post) === "article");
    if (genre === "general") {
      return articles.filter((post) => resolveArticleFormat(post) === null);
    }
    if (genre === "essay" || genre === "policy_brief") {
      return articles.filter((post) => resolveArticleFormat(post) === genre);
    }
    return articles;
  }
  return posts;
}

const PROMPT_STYLES: Record<
  DiscoveryPromptSource,
  {
    accent: string;
    icon: string;
    iconBg: string;
    border: string;
    cta: string;
  }
> = {
  interest: {
    accent: "border-l-emerald-brand",
    icon: "text-emerald-brand",
    iconBg: "bg-emerald-50",
    border: "hover:border-emerald-200",
    cta: "text-emerald-brand",
  },
  trending: {
    accent: "border-l-emerald-brand",
    icon: "text-emerald-brand",
    iconBg: "bg-emerald-50",
    border: "hover:border-emerald-200",
    cta: "text-emerald-brand",
  },
  follow: {
    accent: "border-l-purple-accent",
    icon: "text-purple-accent",
    iconBg: "bg-purple-50",
    border: "hover:border-purple-200",
    cta: "text-purple-accent",
  },
  conversation: {
    accent: "border-l-purple-accent",
    icon: "text-purple-accent",
    iconBg: "bg-purple-50",
    border: "hover:border-purple-200",
    cta: "text-purple-accent",
  },
  debate: {
    accent: "border-l-amber-500",
    icon: "text-amber-600",
    iconBg: "bg-amber-50",
    border: "hover:border-amber-200",
    cta: "text-amber-700",
  },
  opportunity: {
    accent: "border-l-blue-600",
    icon: "text-blue-600",
    iconBg: "bg-blue-50",
    border: "hover:border-blue-200",
    cta: "text-blue-700",
  },
};

function PromptIcon({ source }: { source: DiscoveryPromptSource }) {
  if (source === "conversation" || source === "follow") {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 8.5h10M7 12.25h6.5M5.75 19 9 15.75h8.25A2.75 2.75 0 0020 13V7.75A2.75 2.75 0 0017.25 5H6.75A2.75 2.75 0 004 7.75V13a2.75 2.75 0 002.75 2.75H7V19z"
        />
      </svg>
    );
  }

  if (source === "debate") {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"
        />
      </svg>
    );
  }

  if (source === "opportunity") {
    return (
      <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 6.5V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M4.5 9A2.5 2.5 0 0 1 7 6.5h10A2.5 2.5 0 0 1 19.5 9v8A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V9zM4.5 12.5h15"
        />
      </svg>
    );
  }

  return (
    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"
      />
    </svg>
  );
}

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="mb-3 sm:mb-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-muted">
        {subtitle}
      </p>
    </div>
  );
}

function SearchEntry({
  activeTab,
  topics,
}: {
  activeTab: DiscoverTab;
  topics: DiscoverData["topics"];
}) {
  const quickTopics = topics.slice(0, 6);

  return (
    <section className="mt-4 min-w-0 max-w-3xl sm:mt-5">
      <form action="/search" className="group relative min-w-0">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 sm:pl-4">
          <svg
            className="h-4 w-4 transition-colors group-focus-within:text-emerald-brand sm:h-5 sm:w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
            />
          </svg>
        </div>
        <input
          type="search"
          name="q"
          aria-label="Search Indegenius"
          placeholder="Search posts, people, topics, universities..."
          className="h-12 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-[13px] text-ink shadow-sm outline-none transition-[border-color,box-shadow,background-color] placeholder:text-gray-400 focus:border-emerald-brand focus:bg-white focus:ring-4 focus:ring-emerald-100 sm:h-[52px] sm:pl-12 sm:pr-4 sm:text-sm"
        />
      </form>

      {quickTopics.length > 0 ? (
        <div className="mt-3 flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pr-6 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden">
          {quickTopics.map((topic, index) => (
            <DiscoverTrackedLink
              key={topic.tag}
              href={`/search?q=${encodeURIComponent(topic.tag)}`}
              metadata={{
                item: "quick_search_chip",
                tab: activeTab,
                tag: topic.tag,
                surface: "explore",
              }}
              className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-[12px] font-medium leading-none transition-colors ${
                topic.followed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 bg-white text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
              } ${
                index >= 4 ? "hidden sm:inline-flex" : "inline-flex"
              }`}
            >
              #{topic.tag}
            </DiscoverTrackedLink>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function DiscoverTabs({
  activeTab,
  activePrimary,
  activeGenre,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
}) {
  return (
    <div className="sticky top-[60px] z-30 -mx-4 mb-5 max-w-[calc(100%+2rem)] overflow-x-auto border-b border-gray-200 bg-canvas/95 px-4 pt-1 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:mb-6 sm:max-w-[calc(100%+3rem)] sm:px-6 lg:mx-0 lg:max-w-full lg:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-0.5 pr-2 sm:gap-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          const shouldPreserveType =
            tab.value === "for-you" || tab.value === "trending";
          return (
            <DiscoverTrackedLink
              key={tab.value}
              href={getExploreHref(
                tab.value,
                shouldPreserveType ? activePrimary : "all",
                shouldPreserveType ? activeGenre : "all"
              )}
              event="discover_tab_changed"
              metadata={{ tab: tab.value, surface: "explore" }}
              ariaCurrent={active ? "page" : undefined}
              className={`mb-[-1px] border-b-2 px-3.5 py-3 text-[13px] font-semibold transition-colors sm:px-4 sm:text-[13.5px] ${
                active
                  ? "border-emerald-brand text-ink"
                  : "border-transparent text-gray-500 hover:text-ink"
              }`}
            >
              {tab.mobileLabel ? (
                <>
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </>
              ) : (
                tab.label
              )}
            </DiscoverTrackedLink>
          );
        })}
      </div>
    </div>
  );
}

function FilterChip({
  href,
  active,
  label,
  metadata,
}: {
  href: string;
  active: boolean;
  label: string;
  metadata: Record<string, string | number | boolean | null>;
}) {
  return (
    <DiscoverTrackedLink
      href={href}
      metadata={metadata}
      ariaCurrent={active ? "page" : undefined}
      className={`inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? "border-emerald-brand bg-emerald-50 text-emerald-700"
          : "border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-ink"
      }`}
    >
      {active ? (
        <svg
          className="h-3 w-3 shrink-0"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
      {label}
    </DiscoverTrackedLink>
  );
}

function PrimaryFilterBar({
  activeTab,
  activePrimary,
  activeGenre,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
}) {
  return (
    <div
      role="group"
      aria-label="Filter by content type"
      className="mb-4 flex max-w-full gap-2 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden"
    >
      {PRIMARY_FILTERS.map((filter) => (
        <FilterChip
          key={filter.value}
          href={getExploreHref(
            activeTab,
            filter.value,
            filter.value === "article" ? activeGenre : "all"
          )}
          active={activePrimary === filter.value}
          label={filter.label}
          metadata={{
            item: "primary_filter",
            type: filter.value,
            tab: activeTab,
            surface: "explore",
          }}
        />
      ))}
    </div>
  );
}

function GenreFilterBar({
  activeTab,
  activeGenre,
}: {
  activeTab: DiscoverTab;
  activeGenre: ExploreGenreFilter;
}) {
  return (
    <div className="-mt-2.5 mb-4">
      <div
        role="group"
        aria-label="Refine Articles by genre. Genre is descriptive only -- it does not affect review status or credibility."
        className="flex max-w-full gap-2 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden"
      >
        {GENRE_FILTERS.map((filter) => (
          <FilterChip
            key={filter.value}
            href={getExploreHref(activeTab, "article", filter.value)}
            active={activeGenre === filter.value}
            label={filter.label}
            metadata={{
              item: "genre_filter",
              genre: filter.value,
              tab: activeTab,
              surface: "explore",
            }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] leading-4 text-ink-muted">
        Genre is descriptive only -- it doesn&apos;t change review status or credibility.
      </p>
    </div>
  );
}

function EmptyPosts({ signedIn }: { signedIn: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
      <p className="text-sm font-medium text-gray-700">
        No recommendations yet.
      </p>
      <p className="mt-1 text-sm text-gray-400">
        {signedIn
          ? "Follow topics and writers to tune your Explore page."
          : "Sign in to get personalized recommendations."}
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Link
          href="/topics"
          className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-canvas"
        >
          Browse topics
        </Link>
        {!signedIn ? (
          <Link
            href="/login?redirectTo=/explore"
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-[#0E4B37]"
          >
            Sign in
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function PostList({
  posts,
  signedIn,
  surface,
}: {
  posts: PostCardData[];
  signedIn: boolean;
  surface: string;
}) {
  if (posts.length === 0) return <EmptyPosts signedIn={signedIn} />;

  return (
    <div>
      {posts.map((post) => (
        <PostCardImpression
          key={post.id}
          post={post}
          surface={surface}
          variant="explore"
        />
      ))}
    </div>
  );
}

function TopicStrip({ data }: { data: DiscoverData }) {
  const topics = data.topics.slice(0, 8);
  if (topics.length === 0) return null;

  return (
    <section className="mb-5 min-w-0 max-w-full sm:mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
          Popular topics
        </p>
        <DiscoverTrackedLink
          href="/topics"
          metadata={{ item: "view_all_topics" }}
          className="shrink-0 text-xs font-semibold text-emerald-brand hover:underline"
        >
          <span className="sm:hidden">All topics</span>
          <span className="hidden sm:inline">View all topics</span>
        </DiscoverTrackedLink>
      </div>
      <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden">
        {topics.map((topic) => (
          <DiscoverTrackedLink
            key={topic.tag}
            href={`/topics/${encodeURIComponent(topic.tag)}`}
            metadata={{ item: "topic_strip", tag: topic.tag }}
            className={`inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium leading-none transition-colors sm:text-sm ${
              topic.followed
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            <span>#{topic.tag}</span>
            <span
              className={`text-[11px] font-semibold ${
                topic.followed ? "text-emerald-600" : "text-gray-400"
              }`}
            >
              {topic.count.toLocaleString()}
            </span>
          </DiscoverTrackedLink>
        ))}
      </div>
    </section>
  );
}

function PersonCard({
  person,
  currentUserId,
}: {
  person: DiscoverPerson;
  currentUserId: string | null;
}) {
  const strongestSignal =
    person.field_of_study ??
    person.university ??
    (person.points !== null ? `${person.points.toLocaleString()} points` : null);

  return (
    <div className="flex min-h-[92px] items-center gap-3 rounded-xl border border-gray-200 bg-white p-4">
      <Link href={`/${person.username}`} className="shrink-0">
        <UserAvatar
          name={person.full_name ?? person.username}
          src={person.avatar_url}
          size={42}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/${person.username}`}>
          <p className="truncate text-sm font-semibold text-ink hover:text-emerald-brand">
            {person.full_name ?? person.username}
          </p>
        </Link>
        <p className="mt-0.5 truncate text-xs text-ink-muted">
          @{person.username}
          {person.university ? ` - ${person.university}` : ""}
        </p>
        {person.field_of_study ? (
          <p className="mt-0.5 truncate text-xs text-gray-400">
            {person.field_of_study}
          </p>
        ) : person.points !== null ? (
          <p className="mt-0.5 text-xs text-gray-400">
            {person.points.toLocaleString()} points
          </p>
        ) : null}
        {strongestSignal ? (
          <p className="mt-1 inline-flex rounded-full bg-canvas px-2 py-0.5 text-[11px] font-medium text-gray-500">
            {strongestSignal}
          </p>
        ) : null}
      </div>
      {currentUserId ? (
        <FollowButton
          followerId={currentUserId}
          followingId={person.id}
          initialFollowing={person.followed}
        />
      ) : (
        <DiscoverTrackedLink
          href={`/${person.username}`}
          metadata={{ item: "person", personId: person.id }}
          className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
        >
          View
        </DiscoverTrackedLink>
      )}
    </div>
  );
}

function PeopleGrid({
  people,
  currentUserId,
}: {
  people: DiscoverPerson[];
  currentUserId: string | null;
}) {
  if (people.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-10 text-center text-sm text-gray-400">
        No writer suggestions yet.
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {people.map((person) => (
        <PersonCard
          key={person.id}
          person={person}
          currentUserId={currentUserId}
        />
      ))}
    </div>
  );
}

function DiscoveryBrief({
  data,
  activeTab,
}: {
  data: DiscoverData;
  activeTab: DiscoverTab;
}) {
  if (data.personalizedPrompts.length === 0) return null;

  return (
    <section className="mb-5 sm:mb-6">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
            Discovery brief
          </p>
          <h2 className="mt-1 text-base font-semibold text-ink sm:text-[17px]">
            Start with the strongest signal
          </h2>
        </div>
        <p className="hidden text-xs text-ink-muted sm:block">
          Based on interests, writers, and active work.
        </p>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3 sm:gap-3">
        {data.personalizedPrompts.map((prompt, index) => (
          <DiscoverTrackedLink
            key={prompt.key}
            href={prompt.href}
            metadata={{
              item: "discovery_prompt",
              prompt: prompt.key,
              source: prompt.source,
              tab: activeTab,
              rank: index + 1,
              surface: "explore",
            }}
            className={`group flex min-h-[132px] flex-col justify-between rounded-[10px] border border-l-[3px] border-gray-200 bg-white p-3.5 shadow-sm transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:shadow-md ${
              PROMPT_STYLES[prompt.source].accent
            } ${PROMPT_STYLES[prompt.source].border}`}
          >
            <span className="flex items-start gap-2.5">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                  PROMPT_STYLES[prompt.source].iconBg
                } ${PROMPT_STYLES[prompt.source].icon}`}
              >
                <PromptIcon source={prompt.source} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold leading-snug text-ink">
                  {prompt.label}
                </span>
                <span className="mt-1 line-clamp-2 block text-[11.5px] leading-[1.45] text-ink-muted">
                  {prompt.description}
                </span>
              </span>
            </span>
            <span
              className={`mt-3 inline-flex items-center gap-1 text-[11.5px] font-semibold ${
                PROMPT_STYLES[prompt.source].cta
              }`}
            >
              {prompt.cta}
              <svg className="h-3 w-3 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2.5}
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </span>
          </DiscoverTrackedLink>
        ))}
      </div>
    </section>
  );
}

function ConversationCard({
  conversation,
  index,
}: {
  conversation: DiscoverConversation;
  index: number;
}) {
  const signal = getConversationSignal(conversation);
  const statsLabel = getConversationStats(conversation);

  return (
    <DiscoverTrackedLink
      href={`/post/${conversation.slug}`}
      metadata={{
        item: "active_conversation",
        postId: conversation.postId,
        rank: index + 1,
        surface: "explore",
      }}
      className="group block rounded-xl border border-gray-200 bg-white p-4 transition-[transform,box-shadow,border-color] hover:-translate-y-0.5 hover:border-gray-300 hover:shadow-md"
    >
      <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${signal.dot}`} />
        <span className={`text-[10.5px] font-semibold ${signal.text}`}>
          {conversation.reason}
        </span>
        {conversation.tag ? (
          <span className="min-w-0 truncate text-[10.5px] text-gray-400">
            - #{conversation.tag}
          </span>
        ) : null}
      </div>
      <h3 className="font-display line-clamp-2 text-sm font-semibold leading-snug text-ink transition-colors group-hover:text-gray-700">
        {conversation.title}
      </h3>
      <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-ink-muted">
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
          />
        </svg>
        {statsLabel}
      </p>
    </DiscoverTrackedLink>
  );
}

function getConversationSignal(conversation: DiscoverConversation) {
  const reason = conversation.reason.toLowerCase();

  if (reason.includes("response") || reason.includes("discuss")) {
    return { dot: "bg-purple-accent", text: "text-purple-700" };
  }

  if (conversation.referenceCount > 0 || reason.includes("source")) {
    return { dot: "bg-blue-600", text: "text-blue-700" };
  }

  if (reason.includes("follow")) {
    return { dot: "bg-emerald-brand", text: "text-emerald-700" };
  }

  return { dot: "bg-emerald-brand", text: "text-emerald-700" };
}

function getConversationStats(conversation: DiscoverConversation) {
  if (conversation.responseCount > 0) {
    return `${conversation.responseCount.toLocaleString()} ${
      conversation.responseCount === 1 ? "response" : "responses"
    }`;
  }

  if (conversation.referenceCount > 0) {
    return `${conversation.referenceCount.toLocaleString()} ${
      conversation.referenceCount === 1 ? "reference" : "references"
    } cited`;
  }

  if (conversation.commentCount > 0) {
    return `${conversation.commentCount.toLocaleString()} ${
      conversation.commentCount === 1 ? "comment" : "comments"
    }`;
  }

  return "Join the conversation";
}

function ActiveConversations({ data }: { data: DiscoverData }) {
  if (data.activeConversations.length === 0) return null;

  return (
    <section className="mb-5 sm:mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
            Active conversations
          </p>
          <p className="mt-1 text-[13px] text-ink-muted">
            Posts with discussion, responses, or rising signals.
          </p>
        </div>
        <DiscoverTrackedLink
          href="/search?q=response"
          metadata={{ item: "active_conversations_search", surface: "explore" }}
          className="hidden shrink-0 text-xs font-semibold text-emerald-brand hover:underline sm:inline-flex"
        >
          Search more
        </DiscoverTrackedLink>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {data.activeConversations.map((conversation, index) => (
          <ConversationCard
            key={conversation.postId}
            conversation={conversation}
            index={index}
          />
        ))}
      </div>
    </section>
  );
}

function DebateRailCard({ data }: { data: DiscoverData }) {
  const debate = data.debateHighlights[0];
  if (!debate) return null;

  return (
    <section className="rounded-xl bg-gray-900 p-5 text-white">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-brand animate-pulse" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/55">
          {debate.status === "active" ? "Live debate" : "Open debate"}
        </p>
      </div>
      <h3 className="font-display text-base font-semibold leading-snug">
        {debate.title}
      </h3>
      <p className="mt-2 text-xs leading-5 text-white/50">
        {debate.argumentCount === 0
          ? "Be the first to argue the motion."
          : `${debate.argumentCount.toLocaleString()} ${
              debate.argumentCount === 1 ? "argument" : "arguments"
            } so far`}
      </p>
      <DiscoverTrackedLink
        href={`/debates/${debate.id}`}
        metadata={{ item: "active_debate", debateId: debate.id, surface: "explore" }}
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-300 hover:text-emerald-200"
      >
        Join the debate
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 12h14M12 5l7 7-7 7"
          />
        </svg>
      </DiscoverTrackedLink>
    </section>
  );
}

function MobileDebateBanner({ data }: { data: DiscoverData }) {
  const debate = data.debateHighlights[0];
  if (!debate) return null;

  return (
    <DiscoverTrackedLink
      href={`/debates/${debate.id}`}
      metadata={{ item: "mobile_debate_banner", debateId: debate.id, surface: "explore" }}
      className="mb-4 flex min-w-0 items-center justify-between gap-3 rounded-[10px] bg-gray-900 px-3.5 py-3 text-white lg:hidden"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-brand animate-pulse" />
        <span className="min-w-0">
          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.14em] text-white/50">
            {debate.status === "active" ? "Live debate" : "Open debate"}
          </span>
          <span className="block truncate text-xs font-semibold">
            {debate.title}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-[11px] font-semibold text-emerald-300">
        Join
      </span>
    </DiscoverTrackedLink>
  );
}

function WritersRailCard({
  people,
  currentUserId,
}: {
  people: DiscoverPerson[];
  currentUserId: string | null;
}) {
  const writers = people.slice(0, 4);
  if (writers.length === 0) return null;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-3.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
          Writers to follow
        </p>
        <DiscoverTrackedLink
          href="/explore?tab=people"
          metadata={{ item: "writers_all", surface: "explore" }}
          className="text-[11px] font-semibold text-emerald-brand hover:underline"
        >
          See all
        </DiscoverTrackedLink>
      </div>
      <div className="space-y-3">
        {writers.map((person, index) => (
          <div key={person.id}>
            {index > 0 ? <div className="mb-3 h-px bg-gray-100" /> : null}
            <div className="flex items-center gap-2.5">
              <Link href={`/${person.username}`} className="shrink-0">
                <UserAvatar
                  name={person.full_name ?? person.username}
                  src={person.avatar_url}
                  size={32}
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/${person.username}`}>
                  <p className="truncate text-[12.5px] font-semibold text-ink hover:text-emerald-brand">
                    {person.full_name ?? person.username}
                  </p>
                </Link>
                <p className="truncate text-[10.5px] text-gray-400">
                  {person.field_of_study ?? person.university ?? `@${person.username}`}
                </p>
              </div>
              {currentUserId ? (
                <FollowButton
                  followerId={currentUserId}
                  followingId={person.id}
                  initialFollowing={person.followed}
                />
              ) : (
                <DiscoverTrackedLink
                  href={`/${person.username}`}
                  metadata={{ item: "writer_view", personId: person.id, surface: "explore" }}
                  className="rounded-full border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-600 hover:border-emerald-brand hover:text-emerald-brand"
                >
                  View
                </DiscoverTrackedLink>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpportunitiesRailCard({ data }: { data: DiscoverData }) {
  const { openProfileCount, openFellowshipCount } = data.opportunitySummary;
  const hasOpportunitySignal = openProfileCount > 0 || openFellowshipCount > 0;

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        Opportunities
      </p>
      <h3 className="mt-2 font-display text-sm font-semibold leading-snug text-ink">
        {hasOpportunitySignal
          ? "Find people and openings connected to serious work"
          : "Make your academic profile discoverable"}
      </h3>
      <p className="mt-1.5 text-xs leading-5 text-ink-muted">
        {hasOpportunitySignal
          ? `${openProfileCount.toLocaleString()} open profiles${
              openFellowshipCount > 0
                ? ` and ${openFellowshipCount.toLocaleString()} curated opportunities`
                : ""
            }`
          : "Signal your skills, interests, and availability for collaboration."}
      </p>

      {data.fellowships.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {data.fellowships.slice(0, 2).map((fellowship) => (
            <DiscoverTrackedLink
              key={fellowship.id}
              href={`/fellowships/${fellowship.id}`}
              metadata={{ item: "fellowship", fellowshipId: fellowship.id, surface: "explore" }}
              className="block rounded-lg bg-canvas p-3 transition-colors hover:bg-[#F5F3EE]"
            >
              <span className="line-clamp-2 text-xs font-semibold leading-snug text-ink">
                {fellowship.title}
              </span>
              <span className="mt-1 block text-[11px] text-ink-muted">
                {fellowship.sponsor_name ?? "Indegenius"}
                {fellowship.deadline ? ` - Due ${formatDate(fellowship.deadline)}` : ""}
              </span>
            </DiscoverTrackedLink>
          ))}
        </div>
      ) : null}

      <DiscoverTrackedLink
        href="/opportunities"
        metadata={{ item: "opportunities", surface: "explore" }}
        className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-brand hover:underline"
      >
        Explore opportunities
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 12h14M12 5l7 7-7 7"
          />
        </svg>
      </DiscoverTrackedLink>
    </section>
  );
}

function DiscoverAside({
  data,
  currentUserId,
}: {
  data: DiscoverData;
  currentUserId: string | null;
}) {
  return (
    <aside className="hidden space-y-4 lg:sticky lg:top-[108px] lg:block">
      <DebateRailCard data={data} />
      <WritersRailCard people={data.people} currentUserId={currentUserId} />
      <OpportunitiesRailCard data={data} />
    </aside>
  );
}

function ForYouSection({
  data,
  signedIn,
  activePrimary,
  activeGenre,
}: {
  data: DiscoverData;
  signedIn: boolean;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
}) {
  const posts = filterPostsByExplore(data.forYouPosts, activePrimary, activeGenre);

  return (
    <>
      <DiscoveryBrief data={data} activeTab="for-you" />
      <PrimaryFilterBar activeTab="for-you" activePrimary={activePrimary} activeGenre={activeGenre} />
      {activePrimary === "article" ? (
        <GenreFilterBar activeTab="for-you" activeGenre={activeGenre} />
      ) : null}
      <TopicStrip data={data} />
      <ActiveConversations data={data} />
      {sectionTitle(
        signedIn ? "Recommended reads" : "Start with what is active now",
        signedIn
          ? "Ranked with your interests, follows, and engagement signals."
          : "Popular community work you can read before signing in."
      )}
      <PostList posts={posts} signedIn={signedIn} surface="explore-for-you" />
    </>
  );
}

function TrendingSection({
  data,
  signedIn,
  activePrimary,
  activeGenre,
}: {
  data: DiscoverData;
  signedIn: boolean;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
}) {
  const posts = filterPostsByExplore(data.trendingPosts, activePrimary, activeGenre);

  return (
    <>
      <PrimaryFilterBar activeTab="trending" activePrimary={activePrimary} activeGenre={activeGenre} />
      {activePrimary === "article" ? (
        <GenreFilterBar activeTab="trending" activeGenre={activeGenre} />
      ) : null}
      {sectionTitle(
        "Trending this week",
        "Recent posts with the strongest engagement and freshness signals."
      )}
      <PostList posts={posts} signedIn={signedIn} surface="explore-trending" />
    </>
  );
}

function CitableSection({
  data,
  signedIn,
}: {
  data: DiscoverData;
  signedIn: boolean;
}) {
  return (
    <>
      {sectionTitle(
        "Citable works",
        "Archived research and articles with the strongest academic signal."
      )}
      <PostList posts={data.citablePosts} signedIn={signedIn} surface="explore-citable" />
    </>
  );
}

function TopicsSection({
  data,
  userId,
}: {
  data: DiscoverData;
  userId: string | null;
}) {
  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        {sectionTitle(
          "Explore topics",
          userId
            ? "Follow topics to tune your home feed and Explore recommendations."
            : "Browse what the community is writing about."
        )}
        <DiscoverTrackedLink
          href="/topics"
          metadata={{ item: "topic_directory" }}
          className="w-fit rounded-lg border border-gray-200 bg-white px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-canvas"
        >
          Full directory
        </DiscoverTrackedLink>
      </div>
      <DiscoverTopicsGrid
        topics={data.topics}
        initialInterests={data.userInterests}
        userId={userId}
      />
    </>
  );
}

function PeopleSection({
  data,
  userId,
}: {
  data: DiscoverData;
  userId: string | null;
}) {
  return (
    <>
      {sectionTitle(
        "Writers to follow",
        userId
          ? data.peopleReason
          : "Top contributors from the community."
      )}
      <PeopleGrid people={data.people} currentUserId={userId} />
    </>
  );
}

function ActiveSection({
  activeTab,
  activePrimary,
  activeGenre,
  data,
  userId,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
  data: DiscoverData;
  userId: string | null;
}) {
  if (activeTab === "trending") {
    return (
      <TrendingSection
        data={data}
        signedIn={Boolean(userId)}
        activePrimary={activePrimary}
        activeGenre={activeGenre}
      />
    );
  }

  if (activeTab === "citable") {
    return <CitableSection data={data} signedIn={Boolean(userId)} />;
  }

  if (activeTab === "topics") {
    return <TopicsSection data={data} userId={userId} />;
  }

  if (activeTab === "people") {
    return <PeopleSection data={data} userId={userId} />;
  }

  return (
    <ForYouSection
      data={data}
      signedIn={Boolean(userId)}
      activePrimary={activePrimary}
      activeGenre={activeGenre}
    />
  );
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const { tab, type, genre } = await searchParams;
  const activeTab = getDiscoverTab(tab);
  const { primary: activePrimary, genre: activeGenre } = getExploreFilters(type, genre);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getDiscoverData(supabase, user?.id ?? null);

  return (
    <div className="mx-auto min-w-0 max-w-full overflow-hidden lg:max-w-6xl">
      <RetentionEventTracker
        event="discover_viewed"
        metadata={{
          tab: activeTab,
          surface: "explore",
          signedIn: Boolean(user),
          interests: data.userInterests.length,
          following: data.followedIds.length,
        }}
      />

      <div className="mb-5 min-w-0 max-w-full sm:mb-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-brand">
          Explore
        </p>
        <h1 className="mt-1 text-[23px] font-semibold leading-[1.12] tracking-normal text-ink sm:mt-2 sm:text-[30px]">
          Find serious student ideas
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-ink-muted sm:mt-2 sm:text-sm sm:leading-6">
          <span className="sm:hidden">
            Posts, articles, and research across Indegenius.
          </span>
          <span className="hidden sm:inline">
            Posts, articles, research, debates, and opportunities across
            Indegenius, ranked to match your interests.
          </span>
        </p>
        <SearchEntry activeTab={activeTab} topics={data.topics} />
      </div>

      <DiscoverTabs activeTab={activeTab} activePrimary={activePrimary} activeGenre={activeGenre} />
      <MobileDebateBanner data={data} />

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_312px] lg:gap-8">
        <main className="min-w-0">
          <ActiveSection
            activeTab={activeTab}
            activePrimary={activePrimary}
            activeGenre={activeGenre}
            data={data}
            userId={user?.id ?? null}
          />
        </main>
        <DiscoverAside data={data} currentUserId={user?.id ?? null} />
      </div>
    </div>
  );
}

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
import UserAvatar from "@/components/ui/UserAvatar";
import StickySubnav from "@/components/ui/StickySubnav";
import FollowButton from "@/components/ui/FollowButton";
import PostCardImpression from "@/components/post/PostCardImpression";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import ExploreTrackedLink from "./ExploreTrackedLink";
import ExploreTopicsGrid from "./ExploreTopicsGrid";
import ExploreFeed from "./ExploreFeed";
import MobileOpportunitiesBanner from "./MobileOpportunitiesBanner";
import IntellectualRecordWelcome from "@/components/ui/IntellectualRecordWelcome";
import {
  getExploreFilters,
  toFeedContentFilter,
  GENRE_FILTERS,
  PRIMARY_FILTERS,
  type ExploreGenreFilter,
  type ExplorePrimaryFilter,
} from "./exploreFilters";
import { formatDate } from "@/lib/utils";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";

const EXPLORE_DESCRIPTION =
  "Discover posts, articles, research, debates, topics, and people building evidence-backed Intellectual Records on Indegenius.";

/**
 * No `revalidate` here. This route reads the session through
 * `supabase.auth.getUser()`, which opts it into dynamic rendering, so a
 * route-level revalidate window is silently inert. The expensive shared
 * queries (topic counts, top people, debates, fellowships, opportunity
 * counts) carry their own `unstable_cache` windows in lib/discoverData.ts,
 * which is where the caching actually takes effect.
 */
export const metadata: Metadata = {
  title: "Explore Ideas and Intellectual Work",
  description: EXPLORE_DESCRIPTION,
  alternates: { canonical: canonicalPath("/explore") },
  openGraph: {
    title: "Explore Ideas and Intellectual Work",
    description: EXPLORE_DESCRIPTION,
    url: absoluteUrl("/explore"),
    siteName: SITE_NAME,
    images: [{ url: absoluteUrl(DEFAULT_OG_IMAGE), width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Explore Ideas and Intellectual Work",
    description: EXPLORE_DESCRIPTION,
    images: [absoluteUrl(DEFAULT_OG_IMAGE)],
  },
};

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    type?: string;
    genre?: string;
    welcome?: string;
  }>;
}

/**
 * Five tabs, all of which swap the content below them. Campus and Research
 * projects used to sit in this row wearing identical styling while navigating
 * away to unrelated pages; they are destinations, so they live in the rail now.
 */
const TABS: Array<{ value: DiscoverTab; label: string }> = [
  { value: "for-you", label: "For you" },
  { value: "trending", label: "Trending" },
  { value: "citable", label: "Citable" },
  { value: "topics", label: "Topics" },
  { value: "people", label: "People" },
];

const FILTERABLE_TABS: DiscoverTab[] = ["for-you", "trending"];

function getExploreHref(
  tab: DiscoverTab,
  primary: ExplorePrimaryFilter = "all",
  genre: ExploreGenreFilter = "all"
) {
  const params = new URLSearchParams();

  if (tab !== "for-you") {
    params.set("tab", tab);
  }

  if (primary !== "all" && FILTERABLE_TABS.includes(tab)) {
    params.set("type", primary);
    if (primary === "article" && genre !== "all") {
      params.set("genre", genre);
    }
  }

  const query = params.toString();
  return query ? `/explore?${query}` : "/explore";
}

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-3 sm:mb-4">
      <h2 className="text-byline font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-meta text-ink-muted">{subtitle}</p>
    </div>
  );
}

function SearchEntry() {
  return (
    <section className="mt-4 min-w-0 max-w-3xl sm:mt-5">
      <form action="/search" className="group relative min-w-0">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-ink-muted sm:pl-4">
          <svg
            className="h-4 w-4 transition-colors group-focus-within:text-emerald-ink sm:h-5 sm:w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
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
          className="h-12 w-full rounded-xl border border-card-border bg-card pl-10 pr-3 text-byline text-ink shadow-sm outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted focus:border-emerald-brand focus:ring-4 focus:ring-green-tint sm:h-[52px] sm:pl-12 sm:pr-4"
        />
      </form>
    </section>
  );
}

function ExploreTabs({
  activeTab,
  activePrimary,
  activeGenre,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
}) {
  return (
    <StickySubnav className="z-30 -mx-4 mb-4 max-w-[calc(100%+2rem)] overflow-x-auto border-b border-card-border bg-canvas/95 px-4 pt-1 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:max-w-[calc(100%+3rem)] sm:px-6 lg:mx-0 lg:max-w-full lg:px-0 [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-0.5 pr-2 sm:gap-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          const preserveFilters = FILTERABLE_TABS.includes(tab.value);
          return (
            <ExploreTrackedLink
              key={tab.value}
              href={getExploreHref(
                tab.value,
                preserveFilters ? activePrimary : "all",
                preserveFilters ? activeGenre : "all"
              )}
              event="discover_tab_changed"
              metadata={{ tab: tab.value, surface: "explore" }}
              ariaCurrent={active ? "page" : undefined}
              className={`mb-[-1px] border-b-2 px-3.5 py-3 text-byline font-semibold transition-colors sm:px-4 ${
                active
                  ? "border-emerald-brand text-ink"
                  : "border-transparent text-ink-muted hover:text-ink"
              }`}
            >
              {tab.label}
            </ExploreTrackedLink>
          );
        })}
      </div>
    </StickySubnav>
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
    <ExploreTrackedLink
      href={href}
      metadata={metadata}
      ariaCurrent={active ? "page" : undefined}
      className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-meta font-semibold transition-colors ${
        active
          ? "border-emerald-brand bg-green-tint text-emerald-ink"
          : "border-card-border bg-card text-ink-soft hover:border-card-border-hover hover:text-ink"
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
    </ExploreTrackedLink>
  );
}

function FilterBar({
  activeTab,
  activePrimary,
  activeGenre,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
  activeGenre: ExploreGenreFilter;
}) {
  const showGenres = activePrimary === "article";

  return (
    <div className="mb-4">
      <div
        role="group"
        aria-label="Filter by content type"
        className="flex max-w-full gap-2 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden"
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

      {showGenres ? (
        <div className="mt-2">
          <div
            role="group"
            aria-label="Refine Articles by genre. Genre is descriptive only: it does not affect review status or credibility."
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
          <p className="mt-1.5 text-meta text-ink-muted">
            Genre is descriptive only: it does not change review status or credibility.
          </p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Sits between the third and fourth card rather than above the feed, so the
 * reading run starts immediately and topics arrive once the reader has
 * something to compare them against.
 */
function TopicInterlude({ topics }: { topics: DiscoverData["topics"] }) {
  const shown = topics.slice(0, 8);
  if (shown.length === 0) return null;

  return (
    <section className="my-5 rounded-xl border border-card-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-kicker font-semibold uppercase text-ink-muted">
          Popular topics
        </p>
        <ExploreTrackedLink
          href="/topics"
          metadata={{ item: "view_all_topics", surface: "explore" }}
          className="shrink-0 text-meta font-semibold text-emerald-ink hover:underline"
        >
          View all
        </ExploreTrackedLink>
      </div>
      <div className="flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden">
        {shown.map((topic) => (
          <ExploreTrackedLink
            key={topic.tag}
            href={`/topics/${encodeURIComponent(topic.tag)}`}
            metadata={{ item: "topic_strip", tag: topic.tag, surface: "explore" }}
            className={`inline-flex min-h-11 shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1.5 text-byline font-medium transition-colors ${
              topic.followed
                ? "border-green-wash-border bg-green-tint text-emerald-ink"
                : "border-card-border bg-card text-ink-soft hover:border-card-border-hover"
            }`}
          >
            <span>#{topic.tag}</span>
            <span className="text-meta font-semibold text-ink-muted">
              {topic.count.toLocaleString()}
            </span>
          </ExploreTrackedLink>
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
  // One signal, strongest first. The card used to print field_of_study or
  // university on its own line and then repeat whichever it found in a badge
  // underneath, so every card said the same thing twice.
  const signal =
    person.field_of_study ??
    person.university ??
    (person.points !== null ? `${person.points.toLocaleString()} points` : null);

  return (
    <div className="flex min-h-[92px] items-center gap-3 rounded-xl border border-card-border bg-card p-4">
      <Link href={`/${person.username}`} className="shrink-0">
        <UserAvatar
          name={person.full_name ?? person.username}
          src={person.avatar_url}
          size={42}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/${person.username}`}>
          <p className="truncate text-byline font-semibold text-ink hover:text-emerald-ink">
            {person.full_name ?? person.username}
          </p>
        </Link>
        <p className="mt-0.5 truncate text-meta text-ink-muted">
          @{person.username}
        </p>
        {signal ? (
          <p className="mt-1.5 inline-flex rounded-full bg-canvas px-2 py-0.5 text-meta font-medium text-ink-soft">
            {signal}
          </p>
        ) : null}
      </div>
      {currentUserId ? (
        <FollowButton
          followerId={currentUserId}
          followingId={person.id}
          initialFollowing={person.followed}
          initialSubscribed={person.subscribed}
          authorName={person.full_name ?? person.username}
          source="explore"
        />
      ) : (
        <ExploreTrackedLink
          href={`/${person.username}`}
          metadata={{ item: "person", personId: person.id, surface: "explore" }}
          className="inline-flex min-h-11 items-center rounded-full border border-card-border px-3 py-1 text-meta font-medium text-ink-soft hover:border-emerald-brand hover:text-emerald-ink"
        >
          View
        </ExploreTrackedLink>
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
      <div className="rounded-xl border border-dashed border-card-border bg-card px-6 py-10 text-center">
        <p className="text-byline font-medium text-ink">
          No writer suggestions yet.
        </p>
        <p className="mt-1 text-meta text-ink-muted">
          Suggestions improve once more people publish from your university or field.
        </p>
        <Link
          href="/leaderboard"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover hover:bg-canvas"
        >
          See top contributors
        </Link>
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

function getConversationSignal(conversation: DiscoverConversation) {
  const reason = conversation.reason.toLowerCase();

  if (reason.includes("response") || reason.includes("discuss")) {
    return { dot: "bg-purple-accent", text: "text-purple-accent" };
  }

  if (conversation.referenceCount > 0 || reason.includes("source")) {
    return { dot: "bg-gold", text: "text-gold-ink" };
  }

  return { dot: "bg-emerald-brand", text: "text-emerald-ink" };
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

  return "Join the conversation";
}

function ConversationsRailCard({ data }: { data: DiscoverData }) {
  if (data.activeConversations.length === 0) return null;

  return (
    <section className="rounded-xl border border-card-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-kicker font-semibold uppercase text-ink-muted">
          Active conversations
        </p>
        <ExploreTrackedLink
          href="/responses"
          metadata={{ item: "all_responses", surface: "explore" }}
          className="shrink-0 text-meta font-semibold text-emerald-ink hover:underline"
        >
          See all
        </ExploreTrackedLink>
      </div>
      <div className="space-y-3">
        {data.activeConversations.map((conversation, index) => {
          const signal = getConversationSignal(conversation);
          return (
            <div key={conversation.postId}>
              {index > 0 ? <div className="mb-3 h-px bg-divider" /> : null}
              <ExploreTrackedLink
                href={`/post/${conversation.slug}`}
                metadata={{
                  item: "active_conversation",
                  postId: conversation.postId,
                  rank: index + 1,
                  surface: "explore",
                }}
                className="group block"
              >
                <span className="mb-1.5 flex min-w-0 flex-wrap items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${signal.dot}`} />
                  <span className={`text-meta font-semibold ${signal.text}`}>
                    {conversation.reason}
                  </span>
                  {conversation.tag ? (
                    <span className="min-w-0 truncate text-meta text-ink-muted">
                      · #{conversation.tag}
                    </span>
                  ) : null}
                </span>
                <span className="font-display line-clamp-2 block text-byline font-semibold leading-snug text-ink transition-colors group-hover:text-emerald-ink">
                  {conversation.title}
                </span>
                <span className="mt-1.5 block text-meta text-ink-muted">
                  {getConversationStats(conversation)}
                </span>
              </ExploreTrackedLink>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DebateRailCard({ data }: { data: DiscoverData }) {
  const debate = data.debateHighlights[0];
  if (!debate) return null;

  return (
    <section className="rounded-xl bg-emerald-brand p-5 text-white">
      <div className="mb-3 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-gold animate-pulse motion-reduce:animate-none" />
        <p className="text-kicker font-semibold uppercase text-white/80">
          {debate.status === "active" ? "Live debate" : "Open debate"}
        </p>
      </div>
      <h3 className="font-display text-byline font-semibold leading-snug">
        {debate.title}
      </h3>
      <p className="mt-2 text-meta leading-5 text-white/80">
        {debate.argumentCount === 0
          ? "Be the first to argue the motion."
          : `${debate.argumentCount.toLocaleString()} ${
              debate.argumentCount === 1 ? "argument" : "arguments"
            } so far`}
      </p>
      <ExploreTrackedLink
        href={`/debates/${debate.id}`}
        metadata={{ item: "active_debate", debateId: debate.id, surface: "explore" }}
        className="mt-4 inline-flex items-center gap-1 text-meta font-semibold text-gold hover:underline"
      >
        Join the debate
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 12h14M12 5l7 7-7 7"
          />
        </svg>
      </ExploreTrackedLink>
    </section>
  );
}

function MobileDebateBanner({ data }: { data: DiscoverData }) {
  const debate = data.debateHighlights[0];
  if (!debate) return null;

  return (
    <ExploreTrackedLink
      href={`/debates/${debate.id}`}
      metadata={{ item: "mobile_debate_banner", debateId: debate.id, surface: "explore" }}
      className="mb-4 flex min-h-16 min-w-0 items-center justify-between gap-3 rounded-xl bg-emerald-brand px-4 py-3 text-white lg:hidden"
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold animate-pulse motion-reduce:animate-none" />
        <span className="min-w-0">
          <span className="block text-kicker font-semibold uppercase text-white/80">
            {debate.status === "active" ? "Live debate" : "Open debate"}
          </span>
          <span className="block truncate text-byline font-semibold">
            {debate.title}
          </span>
        </span>
      </span>
      <span className="shrink-0 text-meta font-semibold text-gold">Join</span>
    </ExploreTrackedLink>
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
    <section className="rounded-xl border border-card-border bg-card p-4">
      <div className="mb-3.5 flex items-center justify-between">
        <p className="text-kicker font-semibold uppercase text-ink-muted">
          Writers to follow
        </p>
        <ExploreTrackedLink
          href="/explore?tab=people"
          metadata={{ item: "writers_all", surface: "explore" }}
          className="text-meta font-semibold text-emerald-ink hover:underline"
        >
          See all
        </ExploreTrackedLink>
      </div>
      <div className="space-y-3">
        {writers.map((person, index) => (
          <div key={person.id}>
            {index > 0 ? <div className="mb-3 h-px bg-divider" /> : null}
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
                  <p className="truncate text-byline font-semibold text-ink hover:text-emerald-ink">
                    {person.full_name ?? person.username}
                  </p>
                </Link>
                <p className="truncate text-meta text-ink-muted">
                  {person.field_of_study ?? person.university ?? `@${person.username}`}
                </p>
              </div>
              {currentUserId ? (
                <FollowButton
                  followerId={currentUserId}
                  followingId={person.id}
                  initialFollowing={person.followed}
                  initialSubscribed={person.subscribed}
                  authorName={person.full_name ?? person.username}
                  source="explore"
                />
              ) : (
                <ExploreTrackedLink
                  href={`/${person.username}`}
                  metadata={{ item: "writer_view", personId: person.id, surface: "explore" }}
                  className="rounded-full border border-card-border px-2.5 py-1 text-meta font-semibold text-ink-soft hover:border-emerald-brand hover:text-emerald-ink"
                >
                  View
                </ExploreTrackedLink>
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
    <section className="rounded-xl border border-card-border bg-card p-4">
      <p className="text-kicker font-semibold uppercase text-ink-muted">
        Opportunities
      </p>
      <h3 className="mt-2 font-display text-byline font-semibold leading-snug text-ink">
        {hasOpportunitySignal
          ? "Find people and openings connected to serious work"
          : "Make your Intellectual Record discoverable"}
      </h3>
      <p className="mt-1.5 text-meta leading-5 text-ink-muted">
        {hasOpportunitySignal
          ? `${openProfileCount.toLocaleString()} open profiles${
              openFellowshipCount > 0
                ? ` and ${openFellowshipCount.toLocaleString()} curated opportunities`
                : ""
            }`
          : "Signal your skills, interests, and availability for collaboration."}
      </p>

      {data.fellowships.length > 0 ? (
        <div className="mt-3 space-y-2 border-t border-divider pt-3">
          {data.fellowships.slice(0, 2).map((fellowship) => (
            <ExploreTrackedLink
              key={fellowship.id}
              href={`/fellowships/${fellowship.id}`}
              metadata={{ item: "fellowship", fellowshipId: fellowship.id, surface: "explore" }}
              className="block rounded-lg bg-canvas p-3 transition-colors hover:bg-green-wash"
            >
              <span className="line-clamp-2 text-meta font-semibold leading-snug text-ink">
                {fellowship.title}
              </span>
              <span className="mt-1 block text-meta text-ink-muted">
                {fellowship.sponsor_name ?? "Indegenius"}
                {fellowship.deadline ? ` · Due ${formatDate(fellowship.deadline)}` : ""}
              </span>
            </ExploreTrackedLink>
          ))}
        </div>
      ) : null}

      <ExploreTrackedLink
        href="/opportunities"
        metadata={{ item: "opportunities", surface: "explore" }}
        className="mt-3 inline-flex items-center gap-1 text-meta font-semibold text-emerald-ink hover:underline"
      >
        Explore opportunities
        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 12h14M12 5l7 7-7 7"
          />
        </svg>
      </ExploreTrackedLink>
    </section>
  );
}

/**
 * The two destinations that used to masquerade as tabs. They are still one
 * click away, but they no longer promise to swap the content below them.
 */
function MoreDestinationsCard() {
  const destinations = [
    {
      href: "/campus",
      label: "Campus",
      body: "Work grouped by university.",
      item: "campus",
    },
    {
      href: "/research",
      label: "Research projects",
      body: "Open projects looking for collaborators.",
      item: "research_project",
    },
  ];

  return (
    <section className="rounded-xl border border-card-border bg-card p-4">
      <p className="mb-3 text-kicker font-semibold uppercase text-ink-muted">
        More on Indegenius
      </p>
      <div className="space-y-2">
        {destinations.map((destination) => (
          <ExploreTrackedLink
            key={destination.href}
            href={destination.href}
            metadata={{ itemType: destination.item, surface: "explore_rail" }}
            className="block rounded-lg bg-canvas p-3 transition-colors hover:bg-green-wash"
          >
            <span className="block text-byline font-semibold text-ink">
              {destination.label}
            </span>
            <span className="mt-0.5 block text-meta text-ink-muted">
              {destination.body}
            </span>
          </ExploreTrackedLink>
        ))}
      </div>
    </section>
  );
}

function ExploreAside({
  data,
  currentUserId,
}: {
  data: DiscoverData;
  currentUserId: string | null;
}) {
  return (
    <aside className="hidden space-y-4 lg:sticky lg:top-[var(--app-sticky-offset)] lg:block">
      <ConversationsRailCard data={data} />
      <DebateRailCard data={data} />
      <WritersRailCard people={data.people} currentUserId={currentUserId} />
      <OpportunitiesRailCard data={data} />
      <MoreDestinationsCard />
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
  return (
    <>
      <FilterBar activeTab="for-you" activePrimary={activePrimary} activeGenre={activeGenre} />
      <SectionHeading
        title={signedIn ? "Recommended reads" : "Active on Indegenius now"}
        subtitle={
          signedIn
            ? "Ranked with your interests, follows, and engagement signals."
            : "Popular community work you can read before signing in."
        }
      />
      <ExploreFeed
        tab="for-you"
        initialPosts={data.forYou.posts}
        initialHasMore={data.forYou.hasMore}
        initialNextCursor={data.forYou.nextCursor}
        primary={activePrimary}
        genre={activeGenre}
        signedIn={signedIn}
        surface="explore-for-you"
        interlude={<TopicInterlude topics={data.topics} />}
      />
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
  return (
    <>
      <FilterBar activeTab="trending" activePrimary={activePrimary} activeGenre={activeGenre} />
      <SectionHeading
        title="Trending this week"
        subtitle="Recent posts with the strongest engagement and freshness signals, the same for everyone."
      />
      <ExploreFeed
        tab="trending"
        initialPosts={data.trending.posts}
        initialHasMore={data.trending.hasMore}
        initialNextCursor={data.trending.nextCursor}
        primary={activePrimary}
        genre={activeGenre}
        signedIn={signedIn}
        surface="explore-trending"
        interlude={<TopicInterlude topics={data.topics} />}
      />
    </>
  );
}

function CitableSection({ data }: { data: DiscoverData }) {
  return (
    <>
      <SectionHeading
        title="Citable works"
        subtitle="Archived research and articles carrying a citation record."
      />
      {data.citablePosts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-card-border bg-card px-6 py-10 text-center">
          <p className="text-byline font-medium text-ink">
            Nothing has been archived yet.
          </p>
          <p className="mt-1 text-meta text-ink-muted">
            Works appear here once they complete review and receive a citation ID.
          </p>
        </div>
      ) : (
        <>
          <div>
            {data.citablePosts.map((post) => (
              <PostCardImpression
                key={post.id}
                post={post}
                surface="explore-citable"
                variant="explore"
              />
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <span aria-hidden="true" className="mb-1 h-px w-8 bg-divider" />
            <p className="text-byline font-medium text-ink-muted">
              That is the full citable archive.
            </p>
            <p className="text-meta text-ink-muted">
              Every work here has completed review.
            </p>
          </div>
        </>
      )}
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
        <SectionHeading
          title="Explore topics"
          subtitle={
            userId
              ? "Subscribe to topics for a dedicated feed and in-app publication alerts."
              : "Browse what the community is writing about."
          }
        />
        <ExploreTrackedLink
          href="/topics"
          metadata={{ item: "topic_directory", surface: "explore" }}
          className="inline-flex min-h-11 w-fit items-center rounded-lg border border-card-border bg-card px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover hover:bg-canvas"
        >
          Full directory
        </ExploreTrackedLink>
      </div>
      <ExploreTopicsGrid
        topics={data.topics}
        initialInterests={data.userInterests}
        initialSubscribedTopicKeys={data.topicSubscriptionKeys}
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
      <SectionHeading
        title="Writers to follow"
        subtitle={userId ? data.peopleReason : "Top contributors from the community."}
      />
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

  if (activeTab === "citable") return <CitableSection data={data} />;
  if (activeTab === "topics") return <TopicsSection data={data} userId={userId} />;
  if (activeTab === "people") return <PeopleSection data={data} userId={userId} />;

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
  const { tab, type, genre, welcome } = await searchParams;
  const activeTab = getDiscoverTab(tab);
  const { primary: activePrimary, genre: activeGenre } = getExploreFilters(type, genre);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Filters are resolved before the query runs so the database returns the
  // requested content type rather than Explore trimming a mixed page after
  // the fact. Only the filterable tabs pass one down.
  const data = await getDiscoverData(supabase, user?.id ?? null, {
    primary: FILTERABLE_TABS.includes(activeTab)
      ? toFeedContentFilter(activePrimary)
      : "all",
    genre: activeGenre,
  });

  return (
    <div className="mx-auto min-w-0 max-w-full overflow-x-clip lg:max-w-6xl">
      <RetentionEventTracker
        event="discover_viewed"
        metadata={{
          tab: activeTab,
          surface: "explore",
          signedIn: Boolean(user),
          type: activePrimary,
          genre: activeGenre,
          interests: data.userInterests.length,
          following: data.followedIds.length,
        }}
      />

      {user && welcome === "1" ? <IntellectualRecordWelcome /> : null}

      <div className="mb-4 min-w-0 max-w-full sm:mb-5">
        <h1 className="text-headline font-semibold tracking-normal text-ink">
          Find ideas worth engaging with
        </h1>
        <p className="mt-1.5 max-w-measure text-byline text-ink-muted sm:mt-2">
          Posts, articles, research, debates, and people across Indegenius.
        </p>
        <SearchEntry />
      </div>

      <ExploreTabs
        activeTab={activeTab}
        activePrimary={activePrimary}
        activeGenre={activeGenre}
      />
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
          {/* Below the reading run on mobile: an aside on desktop, and never
              the thing standing between a reader and the first post. */}
          <div className="mt-6 lg:hidden">
            <MobileOpportunitiesBanner
              openProfileCount={data.opportunitySummary.openProfileCount}
              openFellowshipCount={data.opportunitySummary.openFellowshipCount}
            />
          </div>
        </main>
        <ExploreAside data={data} currentUserId={user?.id ?? null} />
      </div>
    </div>
  );
}

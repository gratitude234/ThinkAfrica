import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import {
  getDiscoverData,
  getDiscoverTab,
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
import {
  getExploreFilter,
  toFeedContentFilter,
  PRIMARY_FILTERS,
  type ExplorePrimaryFilter,
} from "./exploreFilters";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";

const EXPLORE_DESCRIPTION =
  "Discover posts, articles, topics, and writers on Indegenius.";

/**
 * No `revalidate` here. This route reads the session through
 * `supabase.auth.getUser()`, which opts it into dynamic rendering, so a
 * route-level revalidate window is silently inert. The expensive shared
 * queries (topic counts, recent writers) carry their own `unstable_cache`
 * windows in lib/discoverData.ts, which is where the caching actually takes
 * effect.
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
  }>;
}

/**
 * Four tabs, all of which swap the content below them. Campus and Research
 * projects used to sit in this row wearing identical styling while navigating
 * away to unrelated pages. Both products have since been removed.
 */
const TABS: Array<{ value: DiscoverTab; label: string }> = [
  { value: "for-you", label: "For you" },
  { value: "trending", label: "Trending" },
  { value: "topics", label: "Topics" },
  { value: "people", label: "People" },
];

const FILTERABLE_TABS: DiscoverTab[] = ["for-you", "trending"];

function getExploreHref(
  tab: DiscoverTab,
  primary: ExplorePrimaryFilter = "all"
) {
  const params = new URLSearchParams();

  if (tab !== "for-you") {
    params.set("tab", tab);
  }

  if (primary !== "all" && FILTERABLE_TABS.includes(tab)) {
    params.set("type", primary);
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
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
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
                preserveFilters ? activePrimary : "all"
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

/**
 * One row of chips: All, Posts, Articles.
 *
 * A second row used to appear under Articles offering Essay, Policy Brief and
 * General, with a line explaining that genre "does not change review status or
 * credibility" -- a sentence that only needed writing because the filter
 * implied otherwise. Genre is not part of the product.
 */
function FilterBar({
  activeTab,
  activePrimary,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
}) {
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
            href={getExploreHref(activeTab, filter.value)}
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
      </div>
      {currentUserId ? (
        <FollowButton
          followingId={person.id}
          currentUserId={currentUserId}
          initialFollowing={person.followed}
          authorName={person.full_name ?? person.username}
          source="explore"
          size="compact"
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
          Suggestions appear as more people publish on the topics you follow.
        </p>
        <Link
          href="/topics"
          className="mt-4 inline-flex min-h-11 items-center rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover hover:bg-canvas"
        >
          Browse topics
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
                  @{person.username}
                </p>
              </div>
              {currentUserId ? (
                <FollowButton
                  followingId={person.id}
                  currentUserId={currentUserId}
                  initialFollowing={person.followed}
                  authorName={person.full_name ?? person.username}
                  source="explore"
                  size="compact"
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

function ExploreAside({
  data,
  currentUserId,
}: {
  data: DiscoverData;
  currentUserId: string | null;
}) {
  return (
    <aside className="hidden space-y-4 lg:sticky lg:top-[var(--app-sticky-offset)] lg:block">
      <WritersRailCard people={data.people} currentUserId={currentUserId} />
    </aside>
  );
}

function ForYouSection({
  data,
  signedIn,
  activePrimary,
}: {
  data: DiscoverData;
  signedIn: boolean;
  activePrimary: ExplorePrimaryFilter;
}) {
  return (
    <>
      <FilterBar activeTab="for-you" activePrimary={activePrimary} />
      <SectionHeading
        title={signedIn ? "Recommended reads" : "Active on Indegenius now"}
        subtitle={
          signedIn
            ? "Posts and articles selected for you."
            : "Popular community work you can read before signing in."
        }
      />
      <ExploreFeed
        tab="for-you"
        initialPosts={data.forYou.posts}
        initialHasMore={data.forYou.hasMore}
        initialNextCursor={data.forYou.nextCursor}
        primary={activePrimary}
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
}: {
  data: DiscoverData;
  signedIn: boolean;
  activePrimary: ExplorePrimaryFilter;
}) {
  return (
    <>
      <FilterBar activeTab="trending" activePrimary={activePrimary} />
      <SectionHeading
        title="Trending this week"
        subtitle="Recent posts and articles readers are engaging with."
      />
      <ExploreFeed
        tab="trending"
        initialPosts={data.trending.posts}
        initialHasMore={data.trending.hasMore}
        initialNextCursor={data.trending.nextCursor}
        primary={activePrimary}
        signedIn={signedIn}
        surface="explore-trending"
        interlude={<TopicInterlude topics={data.topics} />}
      />
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
              ? "Follow topics to shape your For you feed."
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
        subtitle="Writers publishing on Indegenius."
      />
      <PeopleGrid people={data.people} currentUserId={userId} />
    </>
  );
}

function ActiveSection({
  activeTab,
  activePrimary,
  data,
  userId,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
  data: DiscoverData;
  userId: string | null;
}) {
  if (activeTab === "trending") {
    return (
      <TrendingSection
        data={data}
        signedIn={Boolean(userId)}
        activePrimary={activePrimary}
      />
    );
  }

  if (activeTab === "topics") return <TopicsSection data={data} userId={userId} />;
  if (activeTab === "people") return <PeopleSection data={data} userId={userId} />;

  return (
    <ForYouSection
      data={data}
      signedIn={Boolean(userId)}
      activePrimary={activePrimary}
    />
  );
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const { tab, type } = await searchParams;
  const activeTab = getDiscoverTab(tab);
  const activePrimary = getExploreFilter(type);
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
          interests: data.userInterests.length,
          following: data.followedIds.length,
        }}
      />

      <div className="mb-4 min-w-0 max-w-full sm:mb-5">
        <h1 className="text-headline font-semibold tracking-normal text-ink">
          Find ideas worth engaging with
        </h1>
        <p className="mt-1.5 max-w-measure text-byline text-ink-muted sm:mt-2">
          Posts, articles, and people across Indegenius.
        </p>
        <SearchEntry />
      </div>

      <ExploreTabs activeTab={activeTab} activePrimary={activePrimary} />

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_312px] lg:gap-8">
        <main className="min-w-0">
          <ActiveSection
            activeTab={activeTab}
            activePrimary={activePrimary}
            data={data}
            userId={user?.id ?? null}
          />
        </main>
        <ExploreAside data={data} currentUserId={user?.id ?? null} />
      </div>
    </div>
  );
}

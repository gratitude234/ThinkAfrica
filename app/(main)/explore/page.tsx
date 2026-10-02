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
import FollowButton from "@/components/ui/FollowButton";
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
import { formatRelativeTime } from "@/lib/utils";
import { DEFAULT_OG_IMAGE, SITE_NAME, absoluteUrl, canonicalPath } from "@/lib/site";

const EXPLORE_DESCRIPTION =
  "Discover posts, articles, topics, and writers on Indegenius.";

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

  if (tab !== "for-you") params.set("tab", tab);
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
    <div className="mb-[18px]">
      <h2 className="text-[13px] font-semibold text-ink sm:text-[14px]">{title}</h2>
      <p className="mt-1 text-[11.5px] text-ink-muted sm:text-[12.5px]">{subtitle}</p>
    </div>
  );
}

function SearchEntry() {
  return (
    <section className="mt-3.5 min-w-0 max-w-[640px] sm:mt-[22px]">
      <form action="/search" className="group relative min-w-0">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-ink-muted sm:pl-[18px]">
          <svg
            className="h-[17px] w-[17px] transition-colors group-focus-within:text-emerald-ink"
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
          placeholder="Search Posts, Articles, writers, and topics…"
          className="h-[46px] w-full rounded-xl border border-card-border bg-[#F5F3EE] pl-11 pr-4 text-[13.5px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink-muted focus:border-emerald-brand focus:ring-4 focus:ring-green-tint sm:h-[52px] sm:pl-[46px] sm:text-[14.5px]"
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
    <div className="mt-[18px] max-w-full overflow-x-auto border-b border-card-border [scrollbar-width:none] sm:mt-[26px] [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-[18px] sm:gap-[26px]">
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
              className={`border-b-2 pb-[10px] text-[13.5px] font-semibold transition-colors sm:pb-3 sm:text-[14px] ${
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
    <ExploreTrackedLink
      href={href}
      metadata={metadata}
      ariaCurrent={active ? "page" : undefined}
      className={`inline-flex min-h-8 shrink-0 items-center rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors sm:text-[12.5px] ${
        active
          ? "border-emerald-brand bg-green-tint text-emerald-ink"
          : "border-card-border bg-card text-ink-soft hover:border-card-border-hover hover:text-ink"
      }`}
    >
      {label}
    </ExploreTrackedLink>
  );
}

function FilterBar({
  activeTab,
  activePrimary,
}: {
  activeTab: DiscoverTab;
  activePrimary: ExplorePrimaryFilter;
}) {
  return (
    <div className="mb-[18px] sm:mb-[22px]">
      <div
        role="group"
        aria-label="Filter by content type"
        className="flex max-w-full gap-2 overflow-x-auto pb-1 pr-5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden"
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

function TopicInterlude({ topics }: { topics: DiscoverData["topics"] }) {
  const shown = topics.slice(0, 5);
  if (shown.length === 0) return null;

  return (
    <section className="my-[18px] rounded-xl bg-green-wash p-4 sm:my-[22px] sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3 sm:mb-3.5">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-muted sm:text-[11px] sm:tracking-[0.14em]">
          Popular topics
        </p>
        <ExploreTrackedLink
          href="/topics"
          metadata={{ item: "view_all_topics", surface: "explore" }}
          className="shrink-0 text-[11.5px] font-semibold text-emerald-ink hover:underline sm:text-[12.5px]"
        >
          View all
        </ExploreTrackedLink>
      </div>
      <div className="flex max-w-full gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
        {shown.map((topic) => (
          <ExploreTrackedLink
            key={topic.tag}
            href={`/topics/${encodeURIComponent(topic.tag)}`}
            metadata={{ item: "topic_strip", tag: topic.tag, surface: "explore" }}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors sm:px-[13px] sm:text-[13px] ${
              topic.followed
                ? "border-green-wash-border bg-green-tint text-emerald-ink"
                : "border-card-border bg-card text-ink-soft hover:border-card-border-hover"
            }`}
          >
            <span>#{topic.tag}</span>
            <span className="font-bold text-[#9C9A94]">
              {topic.count.toLocaleString()}
            </span>
          </ExploreTrackedLink>
        ))}
      </div>
    </section>
  );
}

function ExploreAvatar({ name, src, size }: { name: string; src: string | null; size: number }) {
  if (src) return <UserAvatar name={name} src={src} size={size} />;
  return (
    <span role="img" aria-label={name} className="flex shrink-0 items-center justify-center rounded-full bg-green-tint font-bold text-emerald-ink" style={{ width: size, height: size, fontSize: size === 40 ? 14 : 12 }}>
      {name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}
    </span>
  );
}

function personDescriptor(person: DiscoverPerson) {
  if (person.sharedTopic) {
    return `@${person.username} · also writes about ${person.sharedTopic}`;
  }
  if (person.lastPublishedAt) {
    return `@${person.username} · published ${formatRelativeTime(person.lastPublishedAt)}`;
  }
  return `@${person.username}`;
}

function PersonCard({
  person,
  currentUserId,
}: {
  person: DiscoverPerson;
  currentUserId: string | null;
}) {
  return (
    <div className="flex min-h-[68px] items-center gap-3 border-b border-divider py-3.5">
      <Link href={`/${person.username}`} className="shrink-0">
        <ExploreAvatar
          name={person.full_name ?? person.username}
          src={person.avatar_url}
          size={40}
        />
      </Link>
      <div className="min-w-0 flex-1">
        <Link href={`/${person.username}`}>
          <p className="truncate text-[14px] font-semibold text-ink transition-colors hover:text-emerald-ink">
            {person.full_name ?? person.username}
          </p>
        </Link>
        <p className="mt-0.5 truncate text-[12px] text-ink-muted">
          {personDescriptor(person)}
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
          className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-card-border px-4 py-1.5 text-xs font-semibold text-ink-soft hover:border-emerald-brand hover:text-emerald-ink"
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
      <div className="border-t border-divider py-10 text-center">
        <p className="text-byline font-medium text-ink">No writer suggestions yet.</p>
        <p className="mt-1 text-meta text-ink-muted">
          Suggestions appear as more people publish on the topics you follow.
        </p>
        <Link
          href="/topics"
          className="mt-4 inline-flex min-h-10 items-center rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover"
        >
          Browse topics
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-x-7 gap-y-3.5 sm:grid-cols-2">
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

function WritersRail({
  people,
  currentUserId,
}: {
  people: DiscoverPerson[];
  currentUserId: string | null;
}) {
  const writers = people.slice(0, 4);
  if (writers.length === 0) return null;

  return (
    <section>
      <div className="mb-3.5 flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          Writers to follow
        </p>
        <ExploreTrackedLink
          href="/explore?tab=people"
          metadata={{ item: "writers_all", surface: "explore" }}
          className="text-[12.5px] font-semibold text-emerald-ink hover:underline"
        >
          See all
        </ExploreTrackedLink>
      </div>
      <div>
        {writers.map((person, index) => (
          <div key={person.id}>
            {index > 0 ? <div className="mb-3.5 h-px bg-divider" /> : null}
            <div className="flex items-center gap-2.5 pb-3.5">
              <Link href={`/${person.username}`} className="shrink-0">
                <ExploreAvatar
                  name={person.full_name ?? person.username}
                  src={person.avatar_url}
                  size={32}
                />
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={`/${person.username}`}>
                  <p className="truncate text-[13.5px] font-semibold text-ink hover:text-emerald-ink">
                    {person.full_name ?? person.username}
                  </p>
                </Link>
                <p className="mt-0.5 truncate text-[12px] text-ink-muted">
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
                  className="rounded-full border border-card-border px-3.5 py-1.5 text-xs font-semibold text-ink-soft hover:border-emerald-brand hover:text-emerald-ink"
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
            ? "Posts and Articles selected for you."
            : "Popular community work you can read before signing in."
        }
      />
      <ExploreFeed
        key={`for-you:${activePrimary}`}
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
        subtitle="Recent Posts and Articles readers are engaging with."
      />
      <ExploreFeed
        key={`trending:${activePrimary}`}
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
      <div className="mb-1 flex flex-wrap items-end justify-between gap-x-4">
        <SectionHeading
          title="Explore topics"
          subtitle={
            userId
              ? "Follow topics to shape your For You feed."
              : "Browse what the community is writing about."
          }
        />
        <ExploreTrackedLink
          href="/topics"
          metadata={{ item: "topic_directory", surface: "explore" }}
          className="mb-[18px] inline-flex min-h-10 shrink-0 items-center rounded-lg border border-card-border bg-card px-4 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:border-card-border-hover"
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

  const data = await getDiscoverData(supabase, user?.id ?? null, {
    primary: FILTERABLE_TABS.includes(activeTab)
      ? toFeedContentFilter(activePrimary)
      : "all",
  });

  const showWritersRail = activeTab !== "people";

  return (
    <div className="mx-auto min-w-0 max-w-full min-[1280px]:max-w-[1064px]">
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

      <header className="min-w-0 max-w-full">
        <h1 className="font-display text-[23px] font-semibold leading-[1.15] text-ink sm:text-[30px]">
          Find ideas worth engaging with
        </h1>
        <p className="mt-1.5 max-w-[52ch] text-[13.5px] text-ink-muted sm:mt-2 sm:text-[15.5px]">
          Posts, Articles, topics and writers across Indegenius.
        </p>
        <SearchEntry />
      </header>

      <ExploreTabs activeTab={activeTab} activePrimary={activePrimary} />

      <div
        className={`mt-3.5 grid min-w-0 grid-cols-1 items-start sm:mt-6 ${
          showWritersRail
            ? "min-[1280px]:grid-cols-[minmax(0,720px)_312px] min-[1280px]:gap-8"
            : "lg:grid-cols-1"
        }`}
      >
        <section aria-label={`${TABS.find((item) => item.value === activeTab)?.label} results`} className="min-w-0">
          <ActiveSection
            activeTab={activeTab}
            activePrimary={activePrimary}
            data={data}
            userId={user?.id ?? null}
          />
        </section>

        {showWritersRail ? (
          <aside className="hidden min-[1280px]:sticky min-[1280px]:top-[var(--app-sticky-offset)] min-[1280px]:block">
            <WritersRail people={data.people} currentUserId={user?.id ?? null} />
          </aside>
        ) : null}
      </div>
    </div>
  );
}

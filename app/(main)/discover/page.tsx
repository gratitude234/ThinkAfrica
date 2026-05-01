import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDiscoverData,
  getDiscoverTab,
  type DiscoverData,
  type DiscoverPerson,
  type DiscoverTab,
} from "@/lib/discoverData";
import { formatDate } from "@/lib/utils";
import PostCard, { type PostCardData } from "@/components/post/PostCard";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import DiscoverTrackedLink from "./DiscoverTrackedLink";
import DiscoverTopicsGrid from "./DiscoverTopicsGrid";

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{
    tab?: string;
  }>;
}

const TABS: Array<{ value: DiscoverTab; label: string; href: string }> = [
  { value: "for-you", label: "For you", href: "/discover" },
  { value: "trending", label: "Trending", href: "/discover?tab=trending" },
  { value: "topics", label: "Topics", href: "/discover?tab=topics" },
  { value: "people", label: "People", href: "/discover?tab=people" },
];

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
    </div>
  );
}

function SearchEntry({ activeTab }: { activeTab: DiscoverTab }) {
  return (
    <DiscoverTrackedLink
      href="/search"
      metadata={{ item: "search_entry", tab: activeTab }}
      className="group flex min-h-[54px] items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 text-left shadow-sm transition-colors hover:border-gray-300 hover:bg-gray-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-gray-500 group-hover:text-ink">
        <svg
          className="h-4 w-4"
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
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink">
          Search posts, writers, topics, and universities
        </span>
        <span className="mt-0.5 block text-xs text-ink-muted">
          Open full search
        </span>
      </span>
    </DiscoverTrackedLink>
  );
}

function DiscoverTabs({ activeTab }: { activeTab: DiscoverTab }) {
  return (
    <div className="mb-6 overflow-x-auto border-b border-gray-200">
      <div className="flex min-w-max gap-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <DiscoverTrackedLink
              key={tab.value}
              href={tab.href}
              event="discover_tab_changed"
              metadata={{ tab: tab.value }}
              ariaCurrent={active ? "page" : undefined}
              className={`mb-[-1px] border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-emerald-brand text-ink"
                  : "border-transparent text-gray-500 hover:text-ink"
              }`}
            >
              {tab.label}
            </DiscoverTrackedLink>
          );
        })}
      </div>
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
          ? "Follow topics and writers to tune your Discover page."
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
            href="/login?redirectTo=/discover"
            className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
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
}: {
  posts: PostCardData[];
  signedIn: boolean;
}) {
  if (posts.length === 0) return <EmptyPosts signedIn={signedIn} />;

  return (
    <div>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

function TopicStrip({ data }: { data: DiscoverData }) {
  const topics = data.topics.slice(0, 8);
  if (topics.length === 0) return null;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
          Topic signals
        </p>
        <DiscoverTrackedLink
          href="/topics"
          metadata={{ item: "view_all_topics" }}
          className="shrink-0 text-xs font-semibold text-emerald-brand hover:underline"
        >
          View all topics
        </DiscoverTrackedLink>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {topics.map((topic) => (
          <DiscoverTrackedLink
            key={topic.tag}
            href={`/topics/${encodeURIComponent(topic.tag)}`}
            metadata={{ item: "topic_strip", tag: topic.tag }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors ${
              topic.followed
                ? "border-emerald-100 bg-emerald-50 text-emerald-brand"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
            }`}
          >
            #{topic.tag}
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

function SpotlightCard({
  kicker,
  title,
  body,
  href,
  cta,
  metadata,
}: {
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  metadata: Record<string, string | number | boolean | null>;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
        {kicker}
      </p>
      <h3 className="font-display text-sm font-semibold leading-snug text-ink">
        {title}
      </h3>
      <p className="mt-1.5 text-xs leading-5 text-ink-muted">{body}</p>
      <DiscoverTrackedLink
        href={href}
        metadata={metadata}
        className="mt-3 inline-flex text-xs font-semibold text-emerald-brand hover:underline"
      >
        {cta}
      </DiscoverTrackedLink>
    </section>
  );
}

function DiscoverAside({ data }: { data: DiscoverData }) {
  const hasOpportunitySignal =
    data.opportunitySummary.openProfileCount > 0 ||
    data.opportunitySummary.openFellowshipCount > 0;

  return (
    <aside className="space-y-4 lg:sticky lg:top-[76px]">
      {data.activeDebate ? (
        <SpotlightCard
          kicker={data.activeDebate.status === "active" ? "Live debate" : "Open debate"}
          title={data.activeDebate.title}
          body={`${data.activeDebate.argumentCount.toLocaleString()} ${
            data.activeDebate.argumentCount === 1 ? "argument" : "arguments"
          } so far`}
          href={`/debates/${data.activeDebate.id}`}
          cta="Join the debate"
          metadata={{ item: "active_debate", debateId: data.activeDebate.id }}
        />
      ) : null}

      {data.upcomingWebinar ? (
        <SpotlightCard
          kicker={data.upcomingWebinar.status === "live" ? "Live session" : "Upcoming webinar"}
          title={data.upcomingWebinar.title}
          body={`${formatDate(data.upcomingWebinar.scheduled_at)}${
            data.upcomingWebinar.attendee_count
              ? ` - ${data.upcomingWebinar.attendee_count.toLocaleString()} registered`
              : ""
          }`}
          href={`/webinars/${data.upcomingWebinar.id}`}
          cta="View session"
          metadata={{ item: "webinar", webinarId: data.upcomingWebinar.id }}
        />
      ) : null}

      {hasOpportunitySignal ? (
        <SpotlightCard
          kicker="Opportunities"
          title="Find people and openings connected to serious work"
          body={`${data.opportunitySummary.openProfileCount.toLocaleString()} open profiles${
            data.opportunitySummary.openFellowshipCount > 0
              ? ` and ${data.opportunitySummary.openFellowshipCount} open fellowships`
              : ""
          }`}
          href="/opportunities"
          cta="Explore opportunities"
          metadata={{ item: "opportunities" }}
        />
      ) : (
        <SpotlightCard
          kicker="Opportunities"
          title="Make your academic profile discoverable"
          body="Signal your skills, interests, and availability for collaborations or roles."
          href="/opportunities"
          cta="Open opportunities"
          metadata={{ item: "opportunities_empty" }}
        />
      )}

      {data.fellowships.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-muted">
              Fellowships
            </p>
            <DiscoverTrackedLink
              href="/fellowships"
              metadata={{ item: "fellowships_all" }}
              className="text-[11px] font-semibold text-emerald-brand hover:underline"
            >
              See all
            </DiscoverTrackedLink>
          </div>
          <div className="space-y-3">
            {data.fellowships.map((fellowship) => (
              <DiscoverTrackedLink
                key={fellowship.id}
                href={`/fellowships/${fellowship.id}`}
                metadata={{ item: "fellowship", fellowshipId: fellowship.id }}
                className="block rounded-lg bg-canvas p-3 hover:bg-[#F5F3EE]"
              >
                <span className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
                  {fellowship.title}
                </span>
                <span className="mt-1 block text-xs text-ink-muted">
                  {fellowship.sponsor_name ?? "ThinkAfrica"}
                  {fellowship.deadline ? ` - Due ${formatDate(fellowship.deadline)}` : ""}
                </span>
              </DiscoverTrackedLink>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}

function ForYouSection({
  data,
  signedIn,
}: {
  data: DiscoverData;
  signedIn: boolean;
}) {
  return (
    <>
      <TopicStrip data={data} />
      {sectionTitle(
        signedIn ? "Recommended reads" : "Start with what is active now",
        signedIn
          ? "Posts ranked with your interests, follows, university, and engagement signals."
          : "Popular community work you can read before signing in."
      )}
      <PostList posts={data.forYouPosts} signedIn={signedIn} />
    </>
  );
}

function TrendingSection({
  data,
  signedIn,
}: {
  data: DiscoverData;
  signedIn: boolean;
}) {
  return (
    <>
      {sectionTitle(
        "Trending this week",
        "Recent posts with the strongest engagement and freshness signals."
      )}
      <PostList posts={data.trendingPosts} signedIn={signedIn} />
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
            ? "Follow topics to tune your home feed and Discover recommendations."
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
  data,
  userId,
}: {
  activeTab: DiscoverTab;
  data: DiscoverData;
  userId: string | null;
}) {
  if (activeTab === "trending") {
    return <TrendingSection data={data} signedIn={Boolean(userId)} />;
  }

  if (activeTab === "topics") {
    return <TopicsSection data={data} userId={userId} />;
  }

  if (activeTab === "people") {
    return <PeopleSection data={data} userId={userId} />;
  }

  return <ForYouSection data={data} signedIn={Boolean(userId)} />;
}

export default async function DiscoverPage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const activeTab = getDiscoverTab(tab);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const data = await getDiscoverData(supabase, user?.id ?? null);

  return (
    <div className="mx-auto max-w-6xl">
      <RetentionEventTracker
        event="discover_viewed"
        metadata={{
          tab: activeTab,
          signedIn: Boolean(user),
          interests: data.userInterests.length,
          following: data.followedIds.length,
        }}
      />

      <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Discover
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-normal text-ink">
            Find ideas, people, and opportunities worth your attention
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-muted">
            Explore the strongest work across ThinkAfrica, then follow the
            topics and writers that should shape your feed.
          </p>
        </div>
        <SearchEntry activeTab={activeTab} />
      </div>

      <DiscoverTabs activeTab={activeTab} />

      <div className="grid grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_312px]">
        <main className="min-w-0">
          <ActiveSection
            activeTab={activeTab}
            data={data}
            userId={user?.id ?? null}
          />
        </main>
        <DiscoverAside data={data} />
      </div>
    </div>
  );
}

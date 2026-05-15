import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  getDiscoverData,
  getDiscoverTab,
  type DiscoverConversation,
  type DiscoverData,
  type DiscoverPerson,
  type DiscoverTab,
} from "@/lib/discoverData";
import { formatDate } from "@/lib/utils";
import PostCard, { type PostCardData } from "@/components/post/PostCard";
import UserAvatar from "@/components/ui/UserAvatar";
import FollowButton from "@/components/ui/FollowButton";
import RetentionEventTracker from "@/components/retention/RetentionEventTracker";
import DiscoverTrackedLink from "../discover/DiscoverTrackedLink";
import DiscoverTopicsGrid from "../discover/DiscoverTopicsGrid";

export const revalidate = 60;

interface PageProps {
  searchParams: Promise<{
    tab?: string;
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
    label: "Citable Works",
    mobileLabel: "Citable",
    href: "/explore?tab=citable",
  },
  { value: "topics", label: "Topics", href: "/explore?tab=topics" },
  { value: "people", label: "People", href: "/explore?tab=people" },
];

function sectionTitle(title: string, subtitle: string) {
  return (
    <div className="mb-3 sm:mb-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-1 text-[13px] leading-5 text-ink-muted sm:text-sm">
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
    <section className="min-w-0 max-w-full rounded-xl border border-gray-200 bg-white p-2.5 shadow-sm ring-1 ring-black/[0.01] sm:rounded-2xl sm:p-3">
      <form action="/search" className="relative min-w-0">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-400 sm:pl-4">
          <svg
            className="h-4 w-4 sm:h-5 sm:w-5"
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
          aria-label="Search ThinkAfrica"
          placeholder="Search posts, people, topics, universities..."
          className="h-12 w-full rounded-xl border border-gray-200 bg-canvas pl-10 pr-3 text-[13px] text-ink outline-none transition-colors placeholder:text-gray-400 focus:border-emerald-brand focus:bg-white focus:ring-4 focus:ring-emerald-100 sm:pl-12 sm:pr-4 sm:text-sm"
        />
      </form>

      {quickTopics.length > 0 ? (
        <div className="mt-2.5 flex max-w-full snap-x gap-2 overflow-x-auto pb-1 pr-6 [scrollbar-width:none] sm:mt-3 sm:flex-wrap sm:overflow-visible sm:pr-0 [&::-webkit-scrollbar]:hidden">
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
              className={`shrink-0 snap-start rounded-full border border-gray-200 px-3 py-1.5 text-[12px] font-medium leading-none text-gray-600 transition-colors hover:border-emerald-brand hover:text-emerald-brand ${
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

function DiscoverTabs({ activeTab }: { activeTab: DiscoverTab }) {
  return (
    <div className="sticky top-[60px] z-30 -mx-4 mb-4 max-w-[calc(100%+2rem)] overflow-x-auto border-b border-gray-200 bg-canvas/95 px-4 pt-1 backdrop-blur [scrollbar-width:none] sm:-mx-6 sm:mb-6 sm:max-w-[calc(100%+3rem)] sm:px-6 lg:static lg:mx-0 lg:max-w-full lg:bg-transparent lg:px-0 lg:pt-0 lg:backdrop-blur-none [&::-webkit-scrollbar]:hidden">
      <div className="flex min-w-max gap-0.5 pr-2 sm:gap-1">
        {TABS.map((tab) => {
          const active = activeTab === tab.value;
          return (
            <DiscoverTrackedLink
              key={tab.value}
              href={tab.href}
              event="discover_tab_changed"
              metadata={{ tab: tab.value, surface: "explore" }}
              ariaCurrent={active ? "page" : undefined}
              className={`mb-[-1px] border-b-2 px-3 py-3 text-[13px] font-medium transition-colors sm:px-3.5 sm:text-sm ${
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
            className={`shrink-0 snap-start rounded-full border px-3 py-1.5 text-[13px] leading-none transition-colors sm:text-sm ${
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

function SpotlightCard({
  kicker,
  title,
  body,
  href,
  cta,
  metadata,
  className = "",
}: {
  kicker: string;
  title: string;
  body: string;
  href: string;
  cta: string;
  metadata: Record<string, string | number | boolean | null>;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm shadow-black/[0.02] ${className}`}>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
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

function DiscoveryBrief({
  data,
  activeTab,
}: {
  data: DiscoverData;
  activeTab: DiscoverTab;
}) {
  if (data.personalizedPrompts.length === 0) return null;

  return (
    <section className="mb-5 rounded-xl border border-emerald-100 bg-emerald-50/70 p-4 shadow-sm shadow-emerald-900/[0.03] sm:mb-6 sm:p-5">
      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            Discovery brief
          </p>
          <h2 className="mt-1 text-base font-semibold text-ink">
            Start with the strongest signal
          </h2>
        </div>
        <p className="text-xs text-emerald-800/75">
          Based on interests, writers, and active work.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
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
            className="block rounded-xl border border-emerald-100 bg-white p-3 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40"
          >
            <span className="block text-sm font-semibold text-ink">
              {prompt.label}
            </span>
            <span className="mt-1 line-clamp-2 block text-xs leading-5 text-ink-muted">
              {prompt.description}
            </span>
            <span className="mt-2 inline-flex text-xs font-semibold text-emerald-brand">
              {prompt.cta}
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
  return (
    <DiscoverTrackedLink
      href={`/post/${conversation.slug}`}
      metadata={{
        item: "active_conversation",
        postId: conversation.postId,
        rank: index + 1,
        surface: "explore",
      }}
      className="block rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {conversation.tag ? (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-gray-600">
            #{conversation.tag}
          </span>
        ) : null}
        <span className="text-[11px] font-medium text-ink-muted">
          {conversation.reason}
        </span>
      </div>
      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-ink">
        {conversation.title}
      </h3>
      <p className="mt-2 text-xs text-ink-muted">
        {conversation.responseCount.toLocaleString()} responses /{" "}
        {conversation.commentCount.toLocaleString()} comments /{" "}
        {conversation.referenceCount.toLocaleString()} refs
      </p>
    </DiscoverTrackedLink>
  );
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
            Posts with discussion, responses, or strong quality signals.
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

function DiscoverHighlights({
  data,
  cardClassName = "",
}: {
  data: DiscoverData;
  cardClassName?: string;
}) {
  const hasOpportunitySignal =
    data.opportunitySummary.openProfileCount > 0 ||
    data.opportunitySummary.openFellowshipCount > 0;

  return (
    <>
      {data.debateHighlights.slice(0, 1).map((debate) => (
        <SpotlightCard
          key={debate.id}
          kicker={debate.status === "active" ? "Live debate" : "Open debate"}
          title={debate.title}
          body={`${debate.argumentCount.toLocaleString()} ${
            debate.argumentCount === 1 ? "argument" : "arguments"
          } so far`}
          href={`/debates/${debate.id}`}
          cta="Join the debate"
          metadata={{ item: "active_debate", debateId: debate.id, surface: "explore" }}
          className={cardClassName}
        />
      ))}

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
          metadata={{ item: "webinar", webinarId: data.upcomingWebinar.id, surface: "explore" }}
          className={cardClassName}
        />
      ) : null}

      {hasOpportunitySignal ? (
        <SpotlightCard
          kicker="Opportunities"
          title="Find people and openings connected to serious work"
          body={`${data.opportunitySummary.openProfileCount.toLocaleString()} open profiles${
            data.opportunitySummary.openFellowshipCount > 0
              ? ` and ${data.opportunitySummary.openFellowshipCount} curated opportunities`
              : ""
          }`}
          href="/opportunities"
          cta="Explore opportunities"
          metadata={{ item: "opportunities", surface: "explore" }}
          className={cardClassName}
        />
      ) : (
        <SpotlightCard
          kicker="Opportunities"
          title="Make your academic profile discoverable"
          body="Signal your skills, interests, and availability for collaborations or roles."
          href="/opportunities"
          cta="Open opportunities"
          metadata={{ item: "opportunities_empty", surface: "explore" }}
          className={cardClassName}
        />
      )}
    </>
  );
}

function ActiveNowStrip({ data }: { data: DiscoverData }) {
  return (
    <section className="mt-5 min-w-0 max-w-full lg:hidden">
      <div className="mb-2.5 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
          Live now
        </p>
        <Link
          href="/debates"
          className="text-xs font-semibold text-emerald-brand hover:underline"
        >
          See debates
        </Link>
      </div>
      <div className="flex max-w-full snap-x snap-mandatory gap-3 overflow-x-auto pb-1 pr-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <DiscoverHighlights
          data={data}
          cardClassName="w-[calc(100vw-2rem)] shrink-0 snap-start sm:w-[min(82vw,340px)]"
        />
      </div>
    </section>
  );
}

function DiscoverAside({ data }: { data: DiscoverData }) {
  return (
    <aside className="hidden space-y-4 lg:sticky lg:top-[76px] lg:block">
      <DiscoverHighlights data={data} />

      {data.fellowships.length > 0 ? (
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
              Opportunities
            </p>
            <DiscoverTrackedLink
              href="/fellowships"
              metadata={{ item: "fellowships_all", surface: "explore" }}
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
                metadata={{ item: "fellowship", fellowshipId: fellowship.id, surface: "explore" }}
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
      <ActiveConversations data={data} />
      {sectionTitle(
        signedIn ? "Recommended reads" : "Start with what is active now",
        signedIn
          ? "Ranked with your interests, follows, and engagement signals."
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
        "Archived publications, research, and policy briefs with the strongest academic signal."
      )}
      <PostList posts={data.citablePosts} signedIn={signedIn} />
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

  if (activeTab === "citable") {
    return <CitableSection data={data} signedIn={Boolean(userId)} />;
  }

  if (activeTab === "topics") {
    return <TopicsSection data={data} userId={userId} />;
  }

  if (activeTab === "people") {
    return <PeopleSection data={data} userId={userId} />;
  }

  return <ForYouSection data={data} signedIn={Boolean(userId)} />;
}

export default async function ExplorePage({ searchParams }: PageProps) {
  const { tab } = await searchParams;
  const activeTab = getDiscoverTab(tab);
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

      <div className="mb-4 grid min-w-0 max-w-full gap-3 sm:mb-5 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-brand">
            Explore
          </p>
          <h1 className="mt-1 text-[24px] font-bold leading-[1.12] tracking-normal text-ink sm:mt-2 sm:text-3xl">
            Search, follow, read, and join what matters
          </h1>
          <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-ink-muted sm:mt-2 sm:text-sm sm:leading-6">
            <span className="sm:hidden">
              Find posts, writers, topics, debates, and opportunities across ThinkAfrica.
            </span>
            <span className="hidden sm:inline">
              Find posts, writers, topics, debates, and opportunities across
              ThinkAfrica, then follow the signals that should shape your feed.
            </span>
          </p>
        </div>
        <SearchEntry activeTab={activeTab} topics={data.topics} />
      </div>

      <DiscoverTabs activeTab={activeTab} />

      <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_312px] lg:gap-8">
        <main className="min-w-0">
          <DiscoveryBrief data={data} activeTab={activeTab} />
          <ActiveSection
            activeTab={activeTab}
            data={data}
            userId={user?.id ?? null}
          />
          <ActiveNowStrip data={data} />
        </main>
        <DiscoverAside data={data} />
      </div>
    </div>
  );
}

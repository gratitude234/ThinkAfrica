import type { PostCardData } from "@/components/post/PostCard";
import { getPostMetadataTitle } from "@/lib/postDisplay";
import { unstable_cache } from "next/cache";
import {
  fetchCitableFeed,
  fetchFeedPage,
  type FeedContentFilter,
  type FeedTimeframe,
  type FeedTabKey,
} from "@/lib/feedData";
import {
  getSuggestedPeople,
  type SuggestedPerson,
} from "@/lib/suggestedPeople";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isAuthorSubscriptionsUxV2Enabled,
  isTopicSubscriptionsEnabled,
  RESEARCH_TYPE_QUERY_EXCLUSION,
} from "@/lib/featureFlags";
import { normalizeTagValue } from "@/lib/tags";

export type DiscoverTab = "for-you" | "trending" | "citable" | "topics" | "people";

export interface DiscoverTopic {
  tag: string;
  count: number;
  followed: boolean;
}

export interface DiscoverPerson extends SuggestedPerson {
  followed: boolean;
  subscribed: boolean;
}

export interface DiscoverDebate {
  id: string;
  title: string;
  status: string;
  description: string | null;
  argumentCount: number;
}

export interface DiscoverConversation {
  postId: string;
  title: string;
  slug: string;
  tag: string | null;
  reason: string;
  responseCount: number;
  referenceCount: number;
}

export interface DiscoverFellowship {
  id: string;
  title: string;
  sponsor_name: string | null;
  deadline: string | null;
}

export interface DiscoverOpportunitySummary {
  openProfileCount: number;
  openFellowshipCount: number;
}

/**
 * One page of a paginated Explore shelf. `hasMore`/`nextCursor` come straight
 * from `fetchFeedPage` so the client can continue the same query through
 * `/api/feed` instead of the shelf ending wherever the server render stopped.
 */
export interface DiscoverFeedSlice {
  posts: PostCardData[];
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * The content filter Explore renders under, resolved before any query runs.
 * `primary` is pushed down to the database; `genre` refines Articles in memory
 * because article_format is descriptive metadata rather than a feed axis.
 */
export interface DiscoverFilters {
  primary: FeedContentFilter;
  genre: "all" | "general" | "essay" | "policy_brief";
}

export interface DiscoverData {
  userInterests: string[];
  topicSubscriptionKeys: string[];
  userUniversity: string | null;
  followedIds: string[];
  forYou: DiscoverFeedSlice;
  trending: DiscoverFeedSlice;
  citablePosts: PostCardData[];
  topics: DiscoverTopic[];
  people: DiscoverPerson[];
  peopleReason: string;
  activeConversations: DiscoverConversation[];
  debateHighlights: DiscoverDebate[];
  fellowships: DiscoverFellowship[];
  opportunitySummary: DiscoverOpportunitySummary;
}

interface SupabaseLike {
  from: (table: string) => any;
}

interface ProfileRow {
  interests: string[] | null;
  university: string | null;
  field_of_study: string | null;
}

interface FollowRow {
  following_id: string;
}

interface TopicRow {
  tags: string[] | null;
}

interface RawPerson {
  id: string;
  username: string | null;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  avatar_url: string | null;
  points: number | null;
}

interface RawDebate {
  id: string;
  title: string;
  status: string;
  description: string | null;
  debate_arguments?: { count: number }[] | { count: number } | null;
}

interface RawFellowship {
  id: string;
  title: string;
  sponsor_name: string | null;
  deadline: string | null;
}

export interface TopicCount {
  tag: string;
  count: number;
}

function normalizeInterests(value: string[] | null | undefined) {
  return (value ?? []).filter(Boolean);
}

function normalizeTag(value: string) {
  return normalizeTagValue(value);
}

function getDebateArgumentCount(value: RawDebate["debate_arguments"]) {
  if (!value) return 0;
  if (Array.isArray(value)) return value[0]?.count ?? 0;
  return value.count ?? 0;
}

async function getUserContext(supabase: SupabaseLike, userId: string | null) {
  if (!userId) {
    return {
      interests: [] as string[],
      university: null as string | null,
      fieldOfStudy: null as string | null,
      followedIds: [] as string[],
      blockedIds: [] as string[],
      topicSubscriptionKeys: [] as string[],
      authorSubscriptionIds: [] as string[],
    };
  }

  const topicSubscriptionsPromise = isTopicSubscriptionsEnabled()
    ? supabase
        .from("topic_subscriptions")
        .select("topic_key")
        .eq("subscriber_id", userId)
        .limit(1000)
    : Promise.resolve({ data: [] as Array<{ topic_key: string }> });
  const authorSubscriptionsPromise = isAuthorSubscriptionsUxV2Enabled()
    ? supabase
        .from("author_subscriptions")
        .select("author_id")
        .eq("subscriber_id", userId)
        .limit(1000)
    : Promise.resolve({ data: [] as Array<{ author_id: string }> });

  const [
    { data: profile },
    { data: follows },
    { data: blocks },
    { data: topicSubscriptions },
    { data: authorSubscriptions },
  ] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("interests, university, field_of_study")
        .eq("id", userId)
        .single(),
      supabase
        .from("follows")
        .select("following_id")
        .eq("follower_id", userId)
        .limit(1000),
      supabase
        .from("user_blocks")
        .select("blocked_id")
        .eq("blocker_id", userId)
        .limit(1000),
      topicSubscriptionsPromise,
      authorSubscriptionsPromise,
    ]);

  const profileRow = profile as ProfileRow | null;
  const followRows = (follows ?? []) as FollowRow[];
  const blockRows = (blocks ?? []) as Array<{ blocked_id: string }>;

  return {
    interests: normalizeInterests(profileRow?.interests),
    university: profileRow?.university ?? null,
    fieldOfStudy: profileRow?.field_of_study ?? null,
    followedIds: followRows.map((row) => row.following_id),
    blockedIds: blockRows.map((row) => row.blocked_id),
    topicSubscriptionKeys: (
      (topicSubscriptions ?? []) as Array<{ topic_key: string }>
    ).map((row) => row.topic_key),
    authorSubscriptionIds: (
      (authorSubscriptions ?? []) as Array<{ author_id: string }>
    ).map((row) => row.author_id),
  };
}

async function getFeed(
  supabase: SupabaseLike,
  options: {
    tab: FeedTabKey;
    timeframe: FeedTimeframe;
    userId: string | null;
    userInterests: string[];
    userUniversity: string | null;
    followedIds: string[];
    excludedAuthorIds?: string[];
    pageSize: number;
    type: FeedContentFilter;
  }
): Promise<DiscoverFeedSlice> {
  const result = await fetchFeedPage({
    supabase,
    tab: options.tab,
    page: 1,
    pageSize: options.pageSize,
    // The active filter is pushed down to the query. It used to be hardcoded
    // to null while Explore filtered the returned page in memory, so asking
    // for Research searched only whatever handful of posts the unfiltered
    // ranking happened to return and reported "nothing here" when none of
    // them matched.
    type: options.type === "all" ? null : options.type,
    timeframe: options.timeframe,
    userId: options.userId,
    userInterests: options.userInterests,
    userUniversity: options.userUniversity,
    followedIds: options.followedIds,
    excludedAuthorIds: options.excludedAuthorIds,
  });

  return {
    posts: result.posts,
    hasMore: result.hasMore,
    nextCursor: result.nextCursor ?? null,
  };
}

export async function getPublicTopicCounts(
  supabase: SupabaseLike
): Promise<TopicCount[]> {
  return process.env.SUPABASE_SERVICE_ROLE_KEY
    ? getCachedTopicCounts()
    : getTopicCountsUncached(supabase);
}

async function getTopics(
  supabase: SupabaseLike,
  userInterests: string[]
): Promise<DiscoverTopic[]> {
  const topicCounts = await getPublicTopicCounts(supabase);
  const followed = new Set(userInterests.map(normalizeTag));
  const counts = new Map<string, { tag: string; count: number }>(
    topicCounts.map((topic) => [normalizeTag(topic.tag), topic])
  );

  return Array.from(counts.values())
    .sort((left, right) => {
      const leftFollowed = followed.has(normalizeTag(left.tag)) ? 1 : 0;
      const rightFollowed = followed.has(normalizeTag(right.tag)) ? 1 : 0;
      if (leftFollowed !== rightFollowed) return rightFollowed - leftFollowed;
      return right.count - left.count;
    })
    .slice(0, 32)
    .map((topic) => ({
      ...topic,
      followed: followed.has(normalizeTag(topic.tag)),
    }));
}

async function getTopicCountsUncached(
  supabase: SupabaseLike
): Promise<TopicCount[]> {
  const { data } = await supabase
    .from("posts")
    .select("tags")
    .eq("status", "published")
    .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION)
    .order("published_at", { ascending: false })
    .limit(250);

  const counts = new Map<string, { tag: string; count: number }>();

  for (const row of ((data ?? []) as TopicRow[])) {
    const postTopics = new Map<string, string>();
    for (const rawTag of row.tags ?? []) {
      const tag = rawTag.trim();
      if (!tag) continue;
      const key = normalizeTag(tag);
      postTopics.set(key, postTopics.get(key) ?? tag);
    }
    for (const [key, tag] of postTopics) {
      const current = counts.get(key);
      counts.set(key, {
        tag: current?.tag ?? tag,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return Array.from(counts.values());
}

const getCachedTopicCounts = unstable_cache(
  async () => getTopicCountsUncached(createAdminClient()),
  ["discover-topic-counts"],
  { revalidate: 300, tags: ["discover", "topics"] }
);

async function getPeople(
  supabase: SupabaseLike,
  {
    userId,
    userUniversity,
    fieldOfStudy,
    followedIds,
    blockedIds,
    authorSubscriptionIds,
  }: {
    userId: string | null;
    userUniversity: string | null;
    fieldOfStudy: string | null;
    followedIds: string[];
    blockedIds: string[];
    authorSubscriptionIds: string[];
  }
): Promise<{ people: DiscoverPerson[]; reason: string }> {
  const followed = new Set(followedIds);
  const subscribed = new Set(authorSubscriptionIds);

  if (userId) {
    const result = await getSuggestedPeople(supabase, {
      currentUserId: userId,
      university: userUniversity,
      fieldOfStudy,
      // Both graphs are already loaded by getUserContext. Passing them in
      // stops getSuggestedPeople re-querying follows and user_blocks for rows
      // this request is already holding.
      followedIds,
      excludedUserIds: blockedIds,
      limit: 8,
    });

    return {
      reason: result.reason,
      people: result.suggestions.map((person) => ({
        ...person,
        // Suggestions are drawn from people the viewer does not already
        // follow, so `followed` is false by construction. The academic
        // signal now survives instead of being stubbed to null, which is
        // what made a signed-in person card carry less than a signed-out one.
        followed: followed.has(person.id),
        subscribed: subscribed.has(person.id),
      })),
    };
  }

  const topPeople = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await getCachedTopPeople()
    : null;

  if (topPeople) {
    return {
      reason: "Top contributors",
      people: topPeople.map((person) => ({
        id: person.id,
        username: person.username ?? "",
        full_name: person.full_name,
        university: person.university,
        avatar_url: person.avatar_url,
        points: person.points,
        field_of_study: person.field_of_study,
        followed: followed.has(person.id),
        subscribed: subscribed.has(person.id),
      })),
    };
  }

  const { data } = await supabase
    .from("profiles")
    .select("id, username, full_name, university, field_of_study, avatar_url, points")
    .order("points", { ascending: false })
    .limit(8);

  return {
    reason: "Top contributors",
    people: ((data ?? []) as RawPerson[])
      .filter((person) => Boolean(person.username))
      .map((person) => ({
        id: person.id,
        username: person.username ?? "",
        full_name: person.full_name,
        university: person.university,
        avatar_url: person.avatar_url,
        points: person.points,
        field_of_study: person.field_of_study,
        followed: followed.has(person.id),
        subscribed: subscribed.has(person.id),
      })),
  };
}

const getCachedTopPeople = unstable_cache(
  async (): Promise<RawPerson[]> => {
    const { data } = await createAdminClient()
      .from("profiles")
      .select("id, username, full_name, university, field_of_study, avatar_url, points")
      .order("points", { ascending: false })
      .limit(8);

    return ((data ?? []) as RawPerson[]).filter((person) =>
      Boolean(person.username)
    );
  },
  ["discover-top-people"],
  { revalidate: 300, tags: ["discover", "people"] }
);

async function getDebateHighlights(
  supabase: SupabaseLike
): Promise<DiscoverDebate[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getCachedDebateHighlights();
  }

  return getDebateHighlightsUncached(supabase);
}

async function getDebateHighlightsUncached(
  supabase: SupabaseLike
): Promise<DiscoverDebate[]> {
  const { data } = await supabase
    .from("debates")
    .select("id, title, status, description, debate_arguments(count)")
    .in("status", ["open", "active"])
    .order("created_at", { ascending: false })
    .limit(3);

  return ((data ?? []) as RawDebate[]).map((debate) => ({
    id: debate.id,
    title: debate.title,
    status: debate.status,
    description: debate.description,
    argumentCount: getDebateArgumentCount(debate.debate_arguments),
  }));
}

const getCachedDebateHighlights = unstable_cache(
  async () => getDebateHighlightsUncached(createAdminClient()),
  ["discover-debate-highlights"],
  { revalidate: 120, tags: ["discover", "debates"] }
);

async function getFellowships(
  supabase: SupabaseLike
): Promise<DiscoverFellowship[]> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getCachedFellowships();
  }

  return getFellowshipsUncached(supabase);
}

async function getFellowshipsUncached(
  supabase: SupabaseLike
): Promise<DiscoverFellowship[]> {
  const { data } = await supabase
    .from("fellowships")
    .select("id, title, sponsor_name, deadline")
    .eq("status", "open")
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(2);

  return ((data ?? []) as RawFellowship[]).map((fellowship) => ({
    id: fellowship.id,
    title: fellowship.title,
    sponsor_name: fellowship.sponsor_name,
    deadline: fellowship.deadline,
  }));
}

const getCachedFellowships = unstable_cache(
  async () => getFellowshipsUncached(createAdminClient()),
  ["discover-fellowships"],
  { revalidate: 300, tags: ["discover", "fellowships"] }
);

async function getOpportunitySummary(
  supabase: SupabaseLike
): Promise<DiscoverOpportunitySummary> {
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return getCachedOpportunitySummary();
  }

  return getOpportunitySummaryUncached(supabase);
}

async function getOpportunitySummaryUncached(
  supabase: SupabaseLike
): Promise<DiscoverOpportunitySummary> {
  const [talentResult, fellowshipResult] = await Promise.all([
    supabase
      .from("talent_profiles")
      .select("id", { count: "exact", head: true })
      .eq("open_to_opportunities", true)
      .neq("visibility", "private"),
    supabase
      .from("fellowships")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
  ]);

  return {
    openProfileCount: talentResult.count ?? 0,
    openFellowshipCount: fellowshipResult.count ?? 0,
  };
}

const getCachedOpportunitySummary = unstable_cache(
  async () => getOpportunitySummaryUncached(createAdminClient()),
  ["discover-opportunity-summary"],
  { revalidate: 300, tags: ["discover", "opportunities"] }
);

/**
 * The bar for "worth calling a conversation" on a post with no replies and no
 * bibliography yet.
 *
 * Recalibrated when the second scorer was retired. The old number, 35, was on
 * an unbounded scale where a single citable post cleared it before anyone had
 * read a word. On the shared 0..100 scale, freshness and the exploration lane
 * alone are worth about 25 to a brand new post, so 40 is the first level that
 * takes something more than being recent.
 */
const ACTIVE_CONVERSATION_SCORE = 40;

function buildActiveConversations(posts: PostCardData[]): DiscoverConversation[] {
  const seen = new Set<string>();

  return posts
    .filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return (
        (post.response_count ?? 0) > 0 ||
        (post.reference_count ?? 0) > 0 ||
        (post.quality_score ?? 0) >= ACTIVE_CONVERSATION_SCORE
      );
    })
    // Responses and references are weighted here because this shelf is about
    // conversation specifically, which the general score treats as one signal
    // among several. The score is now the bounded 0..100 one every surface
    // shares, so these weights sit on a comparable scale rather than being
    // swamped by an unbounded total.
    .sort((left, right) => {
      const leftScore =
        (left.response_count ?? 0) * 4 +
        (left.reference_count ?? 0) * 2 +
        (left.quality_score ?? 0);
      const rightScore =
        (right.response_count ?? 0) * 4 +
        (right.reference_count ?? 0) * 2 +
        (right.quality_score ?? 0);
      return rightScore - leftScore;
    })
    .slice(0, 3)
    .map((post) => ({
      postId: post.id,
      title: getPostMetadataTitle(post, post.profiles),
      slug: post.slug,
      tag: post.tags?.[0] ?? null,
      reason:
        post.surface_reason ??
        ((post.response_count ?? 0) > 0
          ? "Active response thread"
          : "Quality signals are rising"),
      responseCount: post.response_count ?? 0,
      referenceCount: post.reference_count ?? 0,
    }));
}


/**
 * A full first page rather than a shelf. Explore used to fetch six posts with
 * no way to ask for a seventh, so the page ended a few seconds after it
 * loaded. This matches the home feed's page size; `/api/feed` continues from
 * here when the reader asks for more.
 */
export const EXPLORE_PAGE_SIZE = 12;

/**
 * The Citable shelf is deliberately finite: fetchCitableFeed is a cached,
 * offset-less query over posts carrying real citation evidence, and there is
 * usually little enough of it that a full page is the whole archive. It gets
 * a bigger shelf and an explicit exit link rather than a load-more path.
 */
const CITABLE_SHELF_SIZE = 12;

export async function getDiscoverData(
  supabase: SupabaseLike,
  userId: string | null,
  filters: DiscoverFilters = { primary: "all", genre: "all" }
): Promise<DiscoverData> {
  const userContext = await getUserContext(supabase, userId);

  const [
    forYou,
    trending,
    citablePosts,
    topics,
    peopleResult,
    debateHighlights,
    fellowships,
    opportunitySummary,
  ] = await Promise.all([
    getFeed(supabase, {
      tab: "home",
      timeframe: "all",
      userId,
      userInterests: userContext.interests,
      userUniversity: userContext.university,
      followedIds: userContext.followedIds,
      excludedAuthorIds: userContext.blockedIds,
      pageSize: EXPLORE_PAGE_SIZE,
      type: filters.primary,
    }),
    getFeed(supabase, {
      tab: "home",
      timeframe: "week",
      userId: null,
      userInterests: [],
      userUniversity: null,
      followedIds: [],
      pageSize: EXPLORE_PAGE_SIZE,
      type: filters.primary,
    }),
    fetchCitableFeed(supabase, CITABLE_SHELF_SIZE),
    getTopics(supabase, userContext.interests),
    getPeople(supabase, {
      userId,
      userUniversity: userContext.university,
      fieldOfStudy: userContext.fieldOfStudy,
      followedIds: userContext.followedIds,
      blockedIds: userContext.blockedIds,
      authorSubscriptionIds: userContext.authorSubscriptionIds,
    }),
    getDebateHighlights(supabase),
    getFellowships(supabase),
    // Previously awaited on its own line after this Promise.all, which added a
    // whole serial round trip to every Explore render for a query that depends
    // on nothing above it.
    getOpportunitySummary(supabase),
  ]);

  const activeConversations = buildActiveConversations([
    ...forYou.posts,
    ...trending.posts,
    ...citablePosts,
  ]);

  return {
    userInterests: userContext.interests,
    topicSubscriptionKeys: userContext.topicSubscriptionKeys,
    userUniversity: userContext.university,
    followedIds: userContext.followedIds,
    forYou,
    trending,
    citablePosts,
    topics,
    people: peopleResult.people,
    peopleReason: peopleResult.reason,
    activeConversations,
    debateHighlights,
    fellowships,
    opportunitySummary,
  };
}

export function getDiscoverTab(value: string | null | undefined): DiscoverTab {
  if (
    value === "for-you" ||
    value === "trending" ||
    value === "citable" ||
    value === "topics" ||
    value === "people"
  ) {
    return value;
  }

  return "for-you";
}

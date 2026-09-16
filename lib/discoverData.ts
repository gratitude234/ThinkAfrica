import type { PostCardData } from "@/components/post/PostCard";
import { unstable_cache } from "next/cache";
import {
  fetchFeedPage,
  type FeedContentFilter,
  type FeedTimeframe,
  type FeedTabKey,
} from "@/lib/feedData";
import {
  getRecentWriters,
  getSuggestedPeople,
  type SuggestedPerson,
} from "@/lib/suggestedPeople";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeTagValue } from "@/lib/tags";

export type DiscoverTab = "for-you" | "trending" | "topics" | "people";

export interface DiscoverTopic {
  tag: string;
  count: number;
  followed: boolean;
}

export interface DiscoverPerson extends SuggestedPerson {
  followed: boolean;
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
 * The content filter Explore renders under, resolved before any query runs and
 * pushed down to the database. The genre axis that used to refine Articles in
 * memory went with `article_format` in Phase 2I.
 */
export interface DiscoverFilters {
  primary: FeedContentFilter;
}

export interface DiscoverData {
  userInterests: string[];
  followedIds: string[];
  forYou: DiscoverFeedSlice;
  trending: DiscoverFeedSlice;
  topics: DiscoverTopic[];
  people: DiscoverPerson[];
  peopleReason: string;
}

interface SupabaseLike {
  from: (table: string) => any;
  rpc?: (functionName: string, args?: Record<string, unknown>) => PromiseLike<{ data: unknown }>;
}

interface ProfileRow {
  interests: string[] | null;
}

interface FollowRow {
  following_id: string;
}

interface TopicRow {
  tags: string[] | null;
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


async function getUserContext(supabase: SupabaseLike, userId: string | null) {
  if (!userId) {
    return {
      interests: [] as string[],
      followedIds: [] as string[],
      blockedIds: [] as string[],
    };
  }

  const [{ data: profile }, { data: follows }, { data: blocks }] = await Promise.all([
    supabase.from("profiles").select("interests").eq("id", userId).single(),
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
  ]);

  const profileRow = profile as ProfileRow | null;
  const followRows = (follows ?? []) as FollowRow[];
  const blockRows = (blocks ?? []) as Array<{ blocked_id: string }>;

  return {
    interests: normalizeInterests(profileRow?.interests),
    followedIds: followRows.map((row) => row.following_id),
    blockedIds: blockRows.map((row) => row.blocked_id),
  };
}

async function getFeed(
  supabase: SupabaseLike,
  options: {
    tab: FeedTabKey;
    timeframe: FeedTimeframe;
    userId: string | null;
    userInterests: string[];
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
    // for one kind searched only whatever handful of posts the unfiltered
    // ranking happened to return and reported "nothing here" when none of
    // them matched.
    type: options.type === "all" ? null : options.type,
    timeframe: options.timeframe,
    userId: options.userId,
    userInterests: options.userInterests,
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
    interests,
    followedIds,
    blockedIds,
  }: {
    userId: string | null;
    interests: string[];
    followedIds: string[];
    blockedIds: string[];
  }
): Promise<{ people: DiscoverPerson[]; reason: string }> {
  const followed = new Set(followedIds);

  const result = userId
    ? await getSuggestedPeople(supabase, {
        currentUserId: userId,
        interests,
        // Both graphs are already loaded by getUserContext. Passing them in
        // stops getSuggestedPeople re-querying follows and user_blocks for rows
        // this request is already holding.
        followedIds,
        excludedUserIds: blockedIds,
        limit: 8,
      })
    : process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await getCachedRecentWriters()
      : await getRecentWriters(supabase, { limit: 8 });

  return {
    reason: result.reason,
    people: result.suggestions.map((person) => ({
      ...person,
      followed: followed.has(person.id),
    })),
  };
}

const getCachedRecentWriters = unstable_cache(
  async () => getRecentWriters(createAdminClient(), { limit: 8 }),
  ["discover-recent-writers"],
  { revalidate: 300, tags: ["discover", "people"] }
);


/**
 * A full first page rather than a shelf. Explore used to fetch six posts with
 * no way to ask for a seventh, so the page ended a few seconds after it
 * loaded. This matches the home feed's page size; `/api/feed` continues from
 * here when the reader asks for more.
 */
export const EXPLORE_PAGE_SIZE = 12;

export async function getDiscoverData(
  supabase: SupabaseLike,
  userId: string | null,
  filters: DiscoverFilters = { primary: "all" }
): Promise<DiscoverData> {
  const userContext = await getUserContext(supabase, userId);

  const [
    forYou,
    trending,
    topics,
    peopleResult,
  ] = await Promise.all([
    getFeed(supabase, {
      tab: "home",
      timeframe: "all",
      userId,
      userInterests: userContext.interests,
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
      followedIds: [],
      pageSize: EXPLORE_PAGE_SIZE,
      type: filters.primary,
    }),
    getTopics(supabase, userContext.interests),
    getPeople(supabase, {
      userId,
      interests: userContext.interests,
      followedIds: userContext.followedIds,
      blockedIds: userContext.blockedIds,
    }),
  ]);

  return {
    userInterests: userContext.interests,
    followedIds: userContext.followedIds,
    forYou,
    trending,
    topics,
    people: peopleResult.people,
    peopleReason: peopleResult.reason,
  };
}

export function getDiscoverTab(value: string | null | undefined): DiscoverTab {
  if (
    value === "for-you" ||
    value === "trending" ||
    value === "topics" ||
    value === "people"
  ) {
    return value;
  }

  return "for-you";
}

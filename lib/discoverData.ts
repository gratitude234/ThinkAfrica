import type { PostCardData } from "@/components/post/PostCard";
import {
  fetchCitableFeed,
  fetchFeedPage,
  type FeedTimeframe,
  type FeedTabKey,
} from "@/lib/feedData";
import {
  getSuggestedPeople,
  type SuggestedPerson,
} from "@/lib/suggestedPeople";

export type DiscoverTab = "for-you" | "trending" | "citable" | "topics" | "people";

export interface DiscoverTopic {
  tag: string;
  count: number;
  followed: boolean;
}

export interface DiscoverPerson extends SuggestedPerson {
  points: number | null;
  field_of_study: string | null;
  followed: boolean;
}

export interface DiscoverDebate {
  id: string;
  title: string;
  status: string;
  description: string | null;
  argumentCount: number;
}

export interface DiscoverWebinar {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  attendee_count: number | null;
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

export interface DiscoverData {
  userInterests: string[];
  userUniversity: string | null;
  followedIds: string[];
  forYouPosts: PostCardData[];
  trendingPosts: PostCardData[];
  citablePosts: PostCardData[];
  topics: DiscoverTopic[];
  people: DiscoverPerson[];
  peopleReason: string;
  activeDebate: DiscoverDebate | null;
  upcomingWebinar: DiscoverWebinar | null;
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

interface RawWebinar {
  id: string;
  title: string;
  status: string;
  scheduled_at: string;
  attendee_count: number | null;
}

interface RawFellowship {
  id: string;
  title: string;
  sponsor_name: string | null;
  deadline: string | null;
}

function normalizeInterests(value: string[] | null | undefined) {
  return (value ?? []).filter(Boolean);
}

function normalizeTag(value: string) {
  return value.trim().toLowerCase();
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
    };
  }

  const [{ data: profile }, { data: follows }] = await Promise.all([
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
  ]);

  const profileRow = profile as ProfileRow | null;
  const followRows = (follows ?? []) as FollowRow[];

  return {
    interests: normalizeInterests(profileRow?.interests),
    university: profileRow?.university ?? null,
    fieldOfStudy: profileRow?.field_of_study ?? null,
    followedIds: followRows.map((row) => row.following_id),
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
    pageSize: number;
  }
) {
  const result = await fetchFeedPage({
    supabase,
    tab: options.tab,
    page: 1,
    pageSize: options.pageSize,
    type: null,
    timeframe: options.timeframe,
    userId: options.userId,
    userInterests: options.userInterests,
    userUniversity: options.userUniversity,
    followedIds: options.followedIds,
  });

  return result.posts;
}

async function getTopics(
  supabase: SupabaseLike,
  userInterests: string[]
): Promise<DiscoverTopic[]> {
  const { data } = await supabase
    .from("posts")
    .select("tags")
    .eq("status", "published")
    .limit(700);

  const followed = new Set(userInterests.map(normalizeTag));
  const counts = new Map<string, { tag: string; count: number }>();

  for (const row of ((data ?? []) as TopicRow[])) {
    for (const rawTag of row.tags ?? []) {
      const tag = rawTag.trim();
      if (!tag) continue;
      const key = normalizeTag(tag);
      const current = counts.get(key);
      counts.set(key, {
        tag: current?.tag ?? tag,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

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

async function getPeople(
  supabase: SupabaseLike,
  {
    userId,
    userUniversity,
    fieldOfStudy,
    followedIds,
  }: {
    userId: string | null;
    userUniversity: string | null;
    fieldOfStudy: string | null;
    followedIds: string[];
  }
): Promise<{ people: DiscoverPerson[]; reason: string }> {
  const followed = new Set(followedIds);

  if (userId) {
    const result = await getSuggestedPeople(supabase, {
      currentUserId: userId,
      university: userUniversity,
      fieldOfStudy,
      limit: 8,
    });

    return {
      reason: result.reason,
      people: result.suggestions.map((person) => ({
        ...person,
        points: null,
        field_of_study: null,
        followed: false,
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
      })),
  };
}

async function getActiveDebate(
  supabase: SupabaseLike
): Promise<DiscoverDebate | null> {
  const { data } = await supabase
    .from("debates")
    .select("id, title, status, description, debate_arguments(count)")
    .in("status", ["open", "active"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const debate = data as RawDebate | null;
  if (!debate) return null;

  return {
    id: debate.id,
    title: debate.title,
    status: debate.status,
    description: debate.description,
    argumentCount: getDebateArgumentCount(debate.debate_arguments),
  };
}

async function getUpcomingWebinar(
  supabase: SupabaseLike
): Promise<DiscoverWebinar | null> {
  const { data } = await supabase
    .from("webinars")
    .select("id, title, status, scheduled_at, attendee_count")
    .in("status", ["scheduled", "live"])
    .gte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as RawWebinar | null) ?? null;
}

async function getFellowships(
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

async function getOpportunitySummary(
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

export async function getDiscoverData(
  supabase: SupabaseLike,
  userId: string | null
): Promise<DiscoverData> {
  const userContext = await getUserContext(supabase, userId);

  const [
    forYouPosts,
    trendingPosts,
    citablePosts,
    topics,
    peopleResult,
    activeDebate,
    upcomingWebinar,
    fellowships,
  ] = await Promise.all([
    getFeed(supabase, {
      tab: "home",
      timeframe: "all",
      userId,
      userInterests: userContext.interests,
      userUniversity: userContext.university,
      followedIds: userContext.followedIds,
      pageSize: 6,
    }),
    getFeed(supabase, {
      tab: "home",
      timeframe: "week",
      userId: null,
      userInterests: [],
      userUniversity: null,
      followedIds: [],
      pageSize: 8,
    }),
    fetchCitableFeed(supabase, 8),
    getTopics(supabase, userContext.interests),
    getPeople(supabase, {
      userId,
      userUniversity: userContext.university,
      fieldOfStudy: userContext.fieldOfStudy,
      followedIds: userContext.followedIds,
    }),
    getActiveDebate(supabase),
    getUpcomingWebinar(supabase),
    getFellowships(supabase),
  ]);

  const opportunitySummary = await getOpportunitySummary(supabase);

  return {
    userInterests: userContext.interests,
    userUniversity: userContext.university,
    followedIds: userContext.followedIds,
    forYouPosts,
    trendingPosts,
    citablePosts,
    topics,
    people: peopleResult.people,
    peopleReason: peopleResult.reason,
    activeDebate,
    upcomingWebinar,
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

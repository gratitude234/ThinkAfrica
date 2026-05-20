import type { PostCardData } from "@/components/post/PostCard";
import { unstable_cache } from "next/cache";
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
import { createAdminClient } from "@/lib/supabase/admin";

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

export interface DiscoverPrompt {
  key: string;
  label: string;
  description: string;
  href: string;
  cta: string;
  source: "interest" | "follow" | "conversation" | "debate" | "opportunity" | "trending";
}

export interface DiscoverConversation {
  postId: string;
  title: string;
  slug: string;
  tag: string | null;
  reason: string;
  responseCount: number;
  commentCount: number;
  referenceCount: number;
}

export interface DiscoverOpportunityHighlight {
  key: string;
  title: string;
  body: string;
  href: string;
  kind: "fellowship" | "profiles" | "setup";
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
  personalizedPrompts: DiscoverPrompt[];
  activeConversations: DiscoverConversation[];
  activeDebate: DiscoverDebate | null;
  debateHighlights: DiscoverDebate[];
  fellowships: DiscoverFellowship[];
  opportunityHighlights: DiscoverOpportunityHighlight[];
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

interface TopicCount {
  tag: string;
  count: number;
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
  const topicCounts = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? await getCachedTopicCounts()
    : await getTopicCountsUncached(supabase);
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

async function getActiveDebate(
  supabase: SupabaseLike
): Promise<DiscoverDebate | null> {
  const debates = await getDebateHighlights(supabase);
  return debates[0] ?? null;
}

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

function buildActiveConversations(posts: PostCardData[]): DiscoverConversation[] {
  const seen = new Set<string>();

  return posts
    .filter((post) => {
      if (seen.has(post.id)) return false;
      seen.add(post.id);
      return (
        (post.response_count ?? 0) > 0 ||
        (post.comment_count ?? 0) > 0 ||
        (post.reference_count ?? 0) > 0 ||
        (post.quality_score ?? 0) >= 35
      );
    })
    .sort((left, right) => {
      const leftScore =
        (left.response_count ?? 0) * 4 +
        (left.comment_count ?? 0) * 3 +
        (left.reference_count ?? 0) * 2 +
        (left.quality_score ?? 0);
      const rightScore =
        (right.response_count ?? 0) * 4 +
        (right.comment_count ?? 0) * 3 +
        (right.reference_count ?? 0) * 2 +
        (right.quality_score ?? 0);
      return rightScore - leftScore;
    })
    .slice(0, 3)
    .map((post) => ({
      postId: post.id,
      title: post.title,
      slug: post.slug,
      tag: post.tags?.[0] ?? null,
      reason:
        post.surface_reason ??
        ((post.response_count ?? 0) > 0
          ? "Active response thread"
          : (post.comment_count ?? 0) > 0
            ? "Readers are discussing this"
            : "Quality signals are rising"),
      responseCount: post.response_count ?? 0,
      commentCount: post.comment_count ?? 0,
      referenceCount: post.reference_count ?? 0,
    }));
}

function buildOpportunityHighlights(
  fellowships: DiscoverFellowship[],
  summary: DiscoverOpportunitySummary
): DiscoverOpportunityHighlight[] {
  const fellowshipHighlights = fellowships.slice(0, 2).map((fellowship) => ({
    key: `fellowship-${fellowship.id}`,
    title: fellowship.title,
    body: fellowship.sponsor_name ?? "Curated opportunity",
    href: `/fellowships/${fellowship.id}`,
    kind: "fellowship" as const,
  }));

  if (fellowshipHighlights.length > 0) return fellowshipHighlights;

  if (summary.openProfileCount > 0) {
    return [
      {
        key: "open-profiles",
        title: "Find open academic profiles",
        body: `${summary.openProfileCount.toLocaleString()} people are open to collaborations or roles.`,
        href: "/opportunities",
        kind: "profiles",
      },
    ];
  }

  return [
    {
      key: "setup-profile",
      title: "Make your profile discoverable",
      body: "Signal your skills, interests, and availability for collaboration.",
      href: "/opportunities",
      kind: "setup",
    },
  ];
}

function buildPersonalizedPrompts({
  userId,
  interests,
  followedIds,
  topics,
  people,
  activeConversations,
  debateHighlights,
  opportunityHighlights,
}: {
  userId: string | null;
  interests: string[];
  followedIds: string[];
  topics: DiscoverTopic[];
  people: DiscoverPerson[];
  activeConversations: DiscoverConversation[];
  debateHighlights: DiscoverDebate[];
  opportunityHighlights: DiscoverOpportunityHighlight[];
}): DiscoverPrompt[] {
  const prompts: DiscoverPrompt[] = [];
  const firstInterest = interests[0] ?? topics[0]?.tag;

  if (firstInterest) {
    prompts.push({
      key: "interest-topic",
      label: `Read ${firstInterest}`,
      description: userId
        ? "Start with work connected to your saved interests."
        : "Start with a topic the community is writing about.",
      href: `/topics/${encodeURIComponent(firstInterest)}`,
      cta: "Open topic",
      source: interests.length > 0 ? "interest" : "trending",
    });
  }

  if (userId && followedIds.length < 3 && people.length > 0) {
    prompts.push({
      key: "follow-writers",
      label: "Follow useful writers",
      description: "Following a few writers makes Explore and Home sharper.",
      href: "/explore?tab=people",
      cta: "Find writers",
      source: "follow",
    });
  }

  if (activeConversations.length > 0) {
    prompts.push({
      key: "active-conversation",
      label: "Join an active conversation",
      description: activeConversations[0].reason,
      href: `/post/${activeConversations[0].slug}`,
      cta: "Read and respond",
      source: "conversation",
    });
  }

  if (debateHighlights.length > 0) {
    prompts.push({
      key: "debate",
      label: "Join a debate",
      description: `${debateHighlights[0].argumentCount.toLocaleString()} arguments so far.`,
      href: `/debates/${debateHighlights[0].id}`,
      cta: "Open debate",
      source: "debate",
    });
  }

  if (opportunityHighlights.length > 0) {
    prompts.push({
      key: "opportunity",
      label: "Explore opportunities",
      description: opportunityHighlights[0].body,
      href: opportunityHighlights[0].href,
      cta: "View opportunity",
      source: "opportunity",
    });
  }

  return prompts.slice(0, 3);
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
    debateHighlights,
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
    getDebateHighlights(supabase),
    getFellowships(supabase),
  ]);

  const opportunitySummary = await getOpportunitySummary(supabase);
  const activeConversations = buildActiveConversations([
    ...forYouPosts,
    ...trendingPosts,
    ...citablePosts,
  ]);
  const opportunityHighlights = buildOpportunityHighlights(
    fellowships,
    opportunitySummary
  );
  const personalizedPrompts = buildPersonalizedPrompts({
    userId,
    interests: userContext.interests,
    followedIds: userContext.followedIds,
    topics,
    people: peopleResult.people,
    activeConversations,
    debateHighlights,
    opportunityHighlights,
  });

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
    personalizedPrompts,
    activeConversations,
    activeDebate: debateHighlights[0] ?? null,
    debateHighlights,
    fellowships,
    opportunityHighlights,
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

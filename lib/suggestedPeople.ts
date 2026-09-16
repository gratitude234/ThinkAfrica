
export interface SuggestedPerson {
  id: string;
  username: string;
  full_name: string | null;
  avatar_url: string | null;
  /** One of the viewer's chosen topics that this writer chose too. */
  sharedTopic: string | null;
  /** Their newest publication among the recent ones, when they have one. */
  lastPublishedAt: string | null;
}

export interface SuggestedPeopleResult {
  suggestions: SuggestedPerson[];
  reason: string;
}

const PROFILE_SELECT = "id, username, full_name, avatar_url, interests";

/** How many of the newest publications count as recent activity. */
const RECENT_PUBLICATION_WINDOW = 120;

interface ProfileRow {
  id: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  interests: string[] | null;
}

interface QueryBuilder {
  eq: (column: string, value: string) => QueryBuilder;
  neq: (column: string, value: string) => QueryBuilder;
  in: (column: string, values: string[]) => QueryBuilder;
  overlaps: (column: string, values: string[]) => QueryBuilder;
  order: (column: string, options: { ascending: boolean }) => QueryBuilder;
  not: (column: string, operator: string, value: string) => QueryBuilder;
  limit: (value: number) => PromiseLike<{ data: unknown[] | null }>;
}

/**
 * PostgREST sends filters in the query string, so the old one-`neq`-per-id
 * chain grew the URL linearly with the viewer's follow graph: someone
 * following 300 people produced 300 separate `id=neq.<uuid>` params, which
 * overruns the request line long before it reaches the database. A single
 * `not.in` is one param regardless of how many ids it holds, and the list is
 * chunked so even an implausibly large graph stays inside the limit.
 */
const MAX_EXCLUSIONS_PER_CLAUSE = 100;

function applyExclusions(query: QueryBuilder, excludeIds: string[]) {
  const unique = Array.from(new Set(excludeIds.filter(Boolean)));
  let next = query;
  for (
    let index = 0;
    index < unique.length;
    index += MAX_EXCLUSIONS_PER_CLAUSE
  ) {
    const chunk = unique.slice(index, index + MAX_EXCLUSIONS_PER_CLAUSE);
    next = next.not("id", "in", `(${chunk.join(",")})`);
  }
  return next;
}

function normalizeTopic(value: string) {
  return value.trim().toLocaleLowerCase("en");
}

/**
 * Who published among the newest publications, newest first, with the time
 * of each writer's latest one. Ids in `excludeIds` are left out.
 */
async function recentPublishers(supabase: any, excludeIds: Set<string>) {
  const { data } = await (supabase
    .from("posts")
    .select("author_id, published_at")
    .eq("status", "published")
    .order("published_at", { ascending: false }) as QueryBuilder).limit(
    RECENT_PUBLICATION_WINDOW
  );

  const latest = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ author_id: string | null; published_at: string | null }>) {
    if (!row.author_id || !row.published_at || excludeIds.has(row.author_id)) continue;
    if (!latest.has(row.author_id)) latest.set(row.author_id, row.published_at);
  }
  return latest;
}

async function profilesById(supabase: any, ids: string[]) {
  if (ids.length === 0) return [] as ProfileRow[];
  const { data } = await (supabase
    .from("profiles")
    .select(PROFILE_SELECT)
    .in("id", ids) as QueryBuilder).limit(ids.length);
  return (data ?? []) as ProfileRow[];
}

function byRecentPublication(
  latest: Map<string, string>,
  left: SuggestedPerson,
  right: SuggestedPerson
) {
  const leftAt = latest.get(left.id) ?? "";
  const rightAt = latest.get(right.id) ?? "";
  return rightAt.localeCompare(leftAt) || left.username.localeCompare(right.username);
}

/**
 * Writers who published recently, newest first. What a signed-out reader is
 * shown, since there is nothing of theirs to match against.
 */
export async function getRecentWriters(
  supabase: any,
  { limit = 8 }: { limit?: number } = {}
): Promise<SuggestedPeopleResult> {
  const latest = await recentPublishers(supabase, new Set());
  const rows = await profilesById(supabase, [...latest.keys()].slice(0, Math.max(24, limit * 3)));
  const suggestions = rows
    .filter((row) => Boolean(row.username))
    .map((row) => toSuggestion(row, null, latest))
    .sort((left, right) => byRecentPublication(latest, left, right))
    .slice(0, limit);
  return { suggestions, reason: "Published recently" };
}

function toSuggestion(
  row: ProfileRow,
  sharedTopic: string | null,
  latest: Map<string, string>
): SuggestedPerson {
  return {
    id: row.id,
    username: row.username ?? "",
    full_name: row.full_name,
    avatar_url: row.avatar_url,
    sharedTopic,
    lastPublishedAt: latest.get(row.id) ?? null,
  };
}

/**
 * Writers to suggest on Explore, for a signed-in reader.
 *
 * Three plain signals, in order, with no score behind them: how many of the
 * reader's topics a writer shares, then how recently they published, then
 * their username so the order is stable. The publishing reset removed what
 * came before. Phase 2G took out the persona matching and Phase 2H took out
 * points and the university and field matches: a suggestion is about what
 * someone writes, not where they study or how many points they collected.
 */
export async function getSuggestedPeople(
  supabase: any,
  {
    currentUserId,
    excludedUserIds,
    followedIds,
    interests = [],
    limit = 3,
  }: {
    currentUserId: string;
    interests?: string[];
    excludedUserIds?: string[];
    /**
     * Supplied by callers that already loaded the viewer's follow graph, so
     * this function does not re-query `follows` for data the caller is holding.
     */
    followedIds?: string[];
    limit?: number;
  }
): Promise<SuggestedPeopleResult> {
  const [{ data: alreadyFollowing }, { data: blockedRows }] = await Promise.all([
    followedIds
      ? Promise.resolve({
          data: followedIds.map((following_id) => ({ following_id })),
        })
      : supabase
          .from("follows")
          .select("following_id")
          .eq("follower_id", currentUserId)
          .limit(1000),
    excludedUserIds
      ? Promise.resolve({
          data: excludedUserIds.map((blocked_id) => ({ blocked_id })),
        })
      : supabase
          .from("user_blocks")
          .select("blocked_id")
          .eq("blocker_id", currentUserId)
          .limit(1000),
  ]);

  const excludeIds = [
    currentUserId,
    ...((alreadyFollowing as Array<{ following_id: string }> | null) ?? []).map(
      (row) => row.following_id
    ),
    ...((blockedRows as Array<{ blocked_id: string }> | null) ?? []).map(
      (row) => row.blocked_id
    ),
  ];
  const excluded = new Set(excludeIds);
  const candidateLimit = Math.max(24, limit * 6);

  const [topicRows, latest] = await Promise.all([
    interests.length > 0
      ? (applyExclusions(
          supabase
            .from("profiles")
            .select(PROFILE_SELECT)
            .overlaps("interests", interests)
            .order("username", { ascending: true }) as QueryBuilder,
          excludeIds
        ).limit(candidateLimit) as PromiseLike<{ data: unknown[] | null }>)
      : Promise.resolve({ data: [] as unknown[] }),
    recentPublishers(supabase, excluded),
  ]);

  const rowsById = new Map<string, ProfileRow>();
  for (const row of (topicRows.data ?? []) as ProfileRow[]) {
    if (!excluded.has(row.id)) rowsById.set(row.id, row);
  }
  const missingRecent = [...latest.keys()]
    .filter((id) => !rowsById.has(id))
    .slice(0, candidateLimit);
  for (const row of await profilesById(supabase, missingRecent)) {
    if (!excluded.has(row.id)) rowsById.set(row.id, row);
  }

  // The stable fallback, for a community too quiet to fill the list.
  if (rowsById.size < limit) {
    const { data } = await applyExclusions(
      supabase
        .from("profiles")
        .select(PROFILE_SELECT)
        .order("username", { ascending: true }) as QueryBuilder,
      excludeIds
    ).limit(candidateLimit);
    for (const row of (data ?? []) as ProfileRow[]) {
      if (!excluded.has(row.id) && !rowsById.has(row.id)) rowsById.set(row.id, row);
    }
  }

  const viewerTopics = new Set(interests.map(normalizeTopic));
  const sharedTopics = (row: ProfileRow) =>
    (row.interests ?? []).filter((topic) => viewerTopics.has(normalizeTopic(topic)));

  const ranked = [...rowsById.values()]
    .filter((row) => Boolean(row.username))
    .map((row) => ({ row, shared: sharedTopics(row) }))
    .sort(
      (left, right) =>
        right.shared.length - left.shared.length ||
        byRecentPublication(
          latest,
          toSuggestion(left.row, null, latest),
          toSuggestion(right.row, null, latest)
        )
    )
    .slice(0, limit);

  const suggestions = ranked.map(({ row, shared }) =>
    toSuggestion(row, shared[0] ?? null, latest)
  );

  const first = suggestions[0];
  const reason = first?.sharedTopic
    ? "Writing about your topics"
    : first?.lastPublishedAt
      ? "Published recently"
      : "Writers on Indegenius";

  return { suggestions, reason };
}

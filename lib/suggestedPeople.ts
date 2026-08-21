export interface SuggestedPerson {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
  /**
   * Carried alongside the identity fields because every surface that renders a
   * suggestion needs a reason to follow, and these two are the only ones the
   * profile row can supply. They were previously dropped here and re-stubbed as
   * `null` by callers, which meant a signed-in viewer saw *less* about a person
   * than a signed-out one.
   */
  field_of_study: string | null;
  points: number | null;
}

export interface SuggestedPeopleResult {
  suggestions: SuggestedPerson[];
  reason: string;
}

const PROFILE_SELECT =
  "id, username, full_name, university, field_of_study, avatar_url, points";

interface QueryBuilder {
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

export async function getSuggestedPeople(
  supabase: any,
  {
    currentUserId,
    university,
    fieldOfStudy,
    excludedUserIds,
    followedIds,
    limit = 3,
  }: {
    currentUserId: string;
    university: string | null;
    fieldOfStudy: string | null;
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

  let suggestions: SuggestedPerson[] = [];
  let reason = "Top contributors";

  if (university && fieldOfStudy && suggestions.length === 0) {
    let query = supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("university", university)
      .eq("field_of_study", fieldOfStudy)
      .order("points", { ascending: false });
    query = applyExclusions(query as unknown as QueryBuilder, excludeIds);
    const { data } = await (query as unknown as QueryBuilder).limit(limit);
    if (data && data.length > 0) {
      suggestions = data as SuggestedPerson[];
      reason = "From your university and field";
    }
  }

  if (suggestions.length === 0 && university) {
    let query = supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("university", university)
      .order("points", { ascending: false });
    query = applyExclusions(query as unknown as QueryBuilder, excludeIds);
    const { data } = await (query as unknown as QueryBuilder).limit(limit);
    if (data && data.length > 0) {
      suggestions = data as SuggestedPerson[];
      reason = "From your university";
    }
  }

  if (suggestions.length === 0) {
    let query = supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .order("points", { ascending: false });
    query = applyExclusions(query as unknown as QueryBuilder, excludeIds);
    const { data } = await (query as unknown as QueryBuilder).limit(limit);
    suggestions = (data as SuggestedPerson[] | null) ?? [];
  }

  return { suggestions, reason };
}

import {
  getCategoryProfileTypes,
  type OnboardingPath,
  type WorkCategory,
} from "@/lib/onboarding";

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
  interests?: string[] | null;
  profile_type?: string | null;
}

export interface SuggestedPeopleResult {
  suggestions: SuggestedPerson[];
  reason: string;
}

const PROFILE_SELECT =
  "id, username, full_name, university, field_of_study, avatar_url, points, interests, profile_type";

interface QueryBuilder {
  eq: (column: string, value: string) => QueryBuilder;
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

export async function getSuggestedPeople(
  supabase: any,
  {
    currentUserId,
    university,
    fieldOfStudy,
    excludedUserIds,
    followedIds,
    interests = [],
    currentPath = null,
    workCategory = null,
    limit = 3,
  }: {
    currentUserId: string;
    university: string | null;
    fieldOfStudy: string | null;
    interests?: string[];
    currentPath?: OnboardingPath | null;
    workCategory?: WorkCategory | null;
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

  const categoryProfileTypes = getCategoryProfileTypes(workCategory);
  const candidateLimit = Math.max(24, limit * 6);

  function createCandidateQuery() {
    let query = supabase
      .from("profiles")
      .select(PROFILE_SELECT)
      .order("points", { ascending: false });
    return applyExclusions(query as unknown as QueryBuilder, excludeIds);
  }

  const candidateQueries: Array<PromiseLike<{ data: unknown[] | null }>> = [];
  if (currentPath === "student" && university) {
    candidateQueries.push(
      createCandidateQuery().eq("university", university).limit(candidateLimit)
    );
  }
  if (interests.length > 0) {
    candidateQueries.push(
      createCandidateQuery().overlaps("interests", interests).limit(candidateLimit)
    );
  }
  if (currentPath === "non_student" && categoryProfileTypes.length > 0) {
    candidateQueries.push(
      createCandidateQuery()
        .in("profile_type", categoryProfileTypes)
        .limit(candidateLimit)
    );
  }
  candidateQueries.push(createCandidateQuery().limit(candidateLimit));

  const candidateResults = await Promise.all(candidateQueries);
  const candidatesById = new Map<string, SuggestedPerson>();
  for (const result of candidateResults) {
    for (const candidate of (result.data ?? []) as SuggestedPerson[]) {
      if (candidate.username) candidatesById.set(candidate.id, candidate);
    }
  }

  const normalizedInterests = new Set(
    interests.map((interest) => interest.trim().toLocaleLowerCase("en"))
  );
  const normalizedUniversity = university?.trim().toLocaleLowerCase("en") ?? "";
  const normalizedField = fieldOfStudy?.trim().toLocaleLowerCase("en") ?? "";

  function topicMatches(candidate: SuggestedPerson) {
    return (candidate.interests ?? []).filter((interest) =>
      normalizedInterests.has(interest.trim().toLocaleLowerCase("en"))
    ).length;
  }

  function sameUniversity(candidate: SuggestedPerson) {
    return Boolean(
      normalizedUniversity &&
        candidate.university?.trim().toLocaleLowerCase("en") === normalizedUniversity
    );
  }

  function sameField(candidate: SuggestedPerson) {
    return Boolean(
      normalizedField &&
        candidate.field_of_study?.trim().toLocaleLowerCase("en") === normalizedField
    );
  }

  function categoryMatches(candidate: SuggestedPerson) {
    return Boolean(
      candidate.profile_type &&
        categoryProfileTypes.some((profileType) => profileType === candidate.profile_type)
    );
  }

  function score(candidate: SuggestedPerson) {
    let value = topicMatches(candidate) * 100;
    if (currentPath === "student" && sameUniversity(candidate)) value += 80;
    if (currentPath === "student" && sameField(candidate)) value += 20;
    if (currentPath === "non_student" && categoryMatches(candidate)) value += 25;
    return value;
  }

  const suggestions = Array.from(candidatesById.values())
    .sort(
      (left, right) =>
        score(right) - score(left) ||
        (right.points ?? 0) - (left.points ?? 0) ||
        left.username.localeCompare(right.username)
    )
    .slice(0, limit);

  const first = suggestions[0];
  let reason = "Top contributors";
  if (first && topicMatches(first) > 0 && sameUniversity(first)) {
    reason = "From your school and topics";
  } else if (first && topicMatches(first) > 0) {
    reason = "Writing about your topics";
  } else if (first && currentPath === "non_student" && categoryMatches(first)) {
    reason = "Connected to your work";
  } else if (first && sameUniversity(first) && sameField(first)) {
    reason = "From your university and field";
  } else if (first && sameUniversity(first)) {
    reason = "From your university";
  }

  return { suggestions, reason };
}

export interface SuggestedPerson {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  avatar_url: string | null;
}

export interface SuggestedPeopleResult {
  suggestions: SuggestedPerson[];
  reason: string;
}

interface QueryBuilder {
  neq: (column: string, value: string) => QueryBuilder;
  limit: (value: number) => PromiseLike<{ data: unknown[] | null }>;
}

function applyExclusions(query: QueryBuilder, excludeIds: string[]) {
  return excludeIds.reduce((current, id) => current.neq("id", id), query);
}

export async function getSuggestedPeople(
  supabase: any,
  {
    currentUserId,
    university,
    fieldOfStudy,
    limit = 3,
  }: {
    currentUserId: string;
    university: string | null;
    fieldOfStudy: string | null;
    limit?: number;
  }
): Promise<SuggestedPeopleResult> {
  const [{ data: alreadyFollowing }, { data: blockedRows }] = await Promise.all([
    supabase
      .from("follows")
      .select("following_id")
      .eq("follower_id", currentUserId)
      .limit(1000),
    supabase
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
      .select("id, username, full_name, university, avatar_url")
      .eq("university", university)
      .eq("field_of_study", fieldOfStudy)
      .order("points", { ascending: false });
    query = applyExclusions(query as unknown as QueryBuilder, excludeIds);
    const { data } = await (query as unknown as QueryBuilder).limit(limit);
    if (data && data.length > 0) {
      suggestions = data as SuggestedPerson[];
      reason = "From your university & field";
    }
  }

  if (suggestions.length === 0 && university) {
    let query = supabase
      .from("profiles")
      .select("id, username, full_name, university, avatar_url")
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
      .select("id, username, full_name, university, avatar_url")
      .order("points", { ascending: false });
    query = applyExclusions(query as unknown as QueryBuilder, excludeIds);
    const { data } = await (query as unknown as QueryBuilder).limit(limit);
    suggestions = (data as SuggestedPerson[] | null) ?? [];
  }

  return { suggestions, reason };
}

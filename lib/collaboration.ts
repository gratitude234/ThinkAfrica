export interface CollaborationSummary {
  postId: string;
  postSlug: string;
  authorId: string | null;
  viewerId: string | null;
  responseCount: number;
  coauthorCount: number;
  isOwnPost: boolean;
  isFollowingAuthor: boolean;
  canFollow: boolean;
  canMessage: boolean;
  messageReason: string | null;
  signInHref: string;
  responseHref: string;
  responsesHref: string;
}

export interface CollaborationSuggestion {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  avatar_url: string | null;
  reason: string;
}

interface ProfileSuggestionRow {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  field_of_study: string | null;
  avatar_url: string | null;
}

interface TaggedPostRow {
  author_id: string;
  profiles: ProfileSuggestionRow | ProfileSuggestionRow[] | null;
}

export function getCollaborationSummary({
  postId,
  postSlug,
  authorId,
  viewerId,
  responseCount,
  coauthorCount,
  isFollowingAuthor,
  messageEligible,
  messageReason,
}: {
  postId: string;
  postSlug: string;
  authorId: string | null;
  viewerId: string | null;
  responseCount: number;
  coauthorCount: number;
  isFollowingAuthor: boolean;
  messageEligible: boolean;
  messageReason: string | null;
}): CollaborationSummary {
  const isOwnPost = Boolean(viewerId && authorId && viewerId === authorId);
  const signInHref = `/login?redirectTo=/post/${postSlug}`;

  return {
    postId,
    postSlug,
    authorId,
    viewerId,
    responseCount,
    coauthorCount,
    isOwnPost,
    isFollowingAuthor,
    canFollow: Boolean(viewerId && authorId && viewerId !== authorId),
    canMessage: Boolean(viewerId && authorId && viewerId !== authorId && messageEligible),
    messageReason,
    signInHref,
    responseHref: `/write?inResponseTo=${postId}&type=essay`,
    responsesHref: "#responses",
  };
}

function normalize(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function pushUnique(
  suggestions: CollaborationSuggestion[],
  seen: Set<string>,
  row: ProfileSuggestionRow | null,
  reason: string,
  currentUserId: string,
  limit: number
) {
  if (!row || row.id === currentUserId || seen.has(row.id) || suggestions.length >= limit) {
    return;
  }

  seen.add(row.id);
  suggestions.push({
    id: row.id,
    username: row.username,
    full_name: row.full_name,
    university: row.university,
    field_of_study: row.field_of_study,
    avatar_url: row.avatar_url,
    reason,
  });
}

export async function getCollaborationSuggestions(
  supabase: any,
  {
    currentUserId,
    university,
    fieldOfStudy,
    tags,
    limit = 3,
  }: {
    currentUserId: string;
    university: string | null;
    fieldOfStudy: string | null;
    tags: string[];
    limit?: number;
  }
): Promise<CollaborationSuggestion[]> {
  const { data: alreadyFollowing } = await supabase
    .from("follows")
    .select("following_id")
    .eq("follower_id", currentUserId)
    .limit(1000);

  const excluded = new Set<string>([
    currentUserId,
    ...((alreadyFollowing as Array<{ following_id: string }> | null) ?? []).map(
      (row) => row.following_id
    ),
  ]);
  const suggestions: CollaborationSuggestion[] = [];
  const seen = new Set<string>();
  const normalizedTags = Array.from(new Set(tags.map(normalize).filter(Boolean))).slice(0, 6);

  if (normalizedTags.length > 0) {
    const { data: taggedPosts } = await supabase
      .from("posts")
      .select(
        "author_id, profiles!posts_author_id_fkey(id, username, full_name, university, field_of_study, avatar_url)"
      )
      .eq("status", "published")
      .overlaps("tags", normalizedTags)
      .limit(50);

    const ranked = new Map<string, { count: number; profile: ProfileSuggestionRow | null }>();
    for (const row of ((taggedPosts ?? []) as TaggedPostRow[])) {
      if (excluded.has(row.author_id)) continue;
      const profile = Array.isArray(row.profiles) ? row.profiles[0] ?? null : row.profiles;
      const existing = ranked.get(row.author_id);
      ranked.set(row.author_id, {
        count: (existing?.count ?? 0) + 1,
        profile,
      });
    }

    for (const item of Array.from(ranked.values()).sort((a, b) => b.count - a.count)) {
      pushUnique(
        suggestions,
        seen,
        item.profile,
        `Wrote about ${normalizedTags[0]}`,
        currentUserId,
        limit
      );
    }
  }

  if (suggestions.length < limit && university && fieldOfStudy) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, field_of_study, avatar_url")
      .eq("university", university)
      .eq("field_of_study", fieldOfStudy)
      .order("points", { ascending: false })
      .limit(20);

    for (const row of ((data ?? []) as ProfileSuggestionRow[])) {
      if (excluded.has(row.id)) continue;
      pushUnique(
        suggestions,
        seen,
        row,
        "Same university and field",
        currentUserId,
        limit
      );
    }
  }

  if (suggestions.length < limit && university) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, field_of_study, avatar_url")
      .eq("university", university)
      .order("points", { ascending: false })
      .limit(20);

    for (const row of ((data ?? []) as ProfileSuggestionRow[])) {
      if (excluded.has(row.id)) continue;
      pushUnique(suggestions, seen, row, "Same university", currentUserId, limit);
    }
  }

  if (suggestions.length < limit) {
    const { data } = await supabase
      .from("profiles")
      .select("id, username, full_name, university, field_of_study, avatar_url")
      .order("points", { ascending: false })
      .limit(20);

    for (const row of ((data ?? []) as ProfileSuggestionRow[])) {
      if (excluded.has(row.id)) continue;
      pushUnique(suggestions, seen, row, "Frequent contributor", currentUserId, limit);
    }
  }

  return suggestions;
}

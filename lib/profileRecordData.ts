import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_PROFILE_RECORD_SUMMARY,
  PROFILE_RECORD_PAGE_SIZE,
  normalizeProfileRecordSummary,
  type ProfileRecordEntryKind,
  type ProfileRecordFilter,
  type ProfileRecordQuality,
  type ProfileRecordSummary,
} from "@/lib/profileRecord";
import { deriveProfileTopics, profileTopicKey } from "@/lib/profileTopics";

export interface ProfileRecordPublication {
  id: string;
  title: string | null;
  slug: string;
  inResponseTo: string | null;
  excerpt: string | null;
  type: string;
  contentKind: string | null;
  articleFormat: string | null;
  citationId: string | null;
  publishedVersionId: string | null;
  createdAt: string;
  publishedAt: string | null;
  coverImageUrl: string | null;
  tags: string[];
  isCoAuthor: boolean;
  referenceCount: number;
  coAuthors: Array<{ userId: string; name: string }>;
}

export interface ProfileRecordDebate {
  id: string;
  content: string;
  stance: string | null;
  createdAt: string;
  debate: { id: string; title: string } | null;
}

export type ProfileRecordItem =
  | {
      id: string;
      kind: Exclude<ProfileRecordEntryKind, "debate">;
      occurredAt: string;
      publication: ProfileRecordPublication;
    }
  | {
      id: string;
      kind: "debate";
      occurredAt: string;
      debate: ProfileRecordDebate;
    };

interface RecordEntryRow {
  profile_id: string;
  entry_id: string;
  entry_kind: ProfileRecordEntryKind;
  occurred_at: string;
  is_coauthor: boolean;
  source_backed: boolean;
  citable: boolean;
}

interface PostRow {
  id: string;
  author_id: string;
  title: string | null;
  slug: string;
  in_response_to: string | null;
  excerpt: string | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  created_at: string;
  published_at: string | null;
  cover_image_url: string | null;
  tags: string[] | null;
  post_authors?: Array<{
    user_id: string;
    accepted_at: string | null;
    profile:
      | { username: string; full_name: string | null }
      | Array<{ username: string; full_name: string | null }>
      | null;
  }>;
}

interface DebateRow {
  id: string;
  content: string;
  stance: string | null;
  created_at: string;
  debates:
    | { id: string; title: string }
    | Array<{ id: string; title: string }>
    | null;
}

export async function loadProfileRecordSummary(
  supabase: SupabaseClient,
  profileId: string,
  includeResearch: boolean
): Promise<ProfileRecordSummary> {
  const { data, error } = await supabase.rpc(
    "get_public_profile_record_summary",
    {
      p_profile_id: profileId,
      p_include_research: includeResearch,
    }
  );

  if (error) throw new Error(error.message);
  return data
    ? normalizeProfileRecordSummary(data)
    : EMPTY_PROFILE_RECORD_SUMMARY;
}

function normalizePost(
  post: PostRow,
  entry: RecordEntryRow
): ProfileRecordPublication {
  const coAuthors = (post.post_authors ?? []).flatMap((author) => {
    if (!author.accepted_at || author.user_id === post.author_id) return [];
    const profile = Array.isArray(author.profile)
      ? author.profile[0]
      : author.profile;
    if (!profile) return [];
    return [
      {
        userId: author.user_id,
        name: profile.full_name ?? profile.username,
      },
    ];
  });

  return {
    id: post.id,
    title: post.title,
    slug: post.slug,
    inResponseTo: post.in_response_to,
    excerpt: post.excerpt,
    type: post.type,
    contentKind: post.content_kind,
    articleFormat: post.article_format,
    citationId: post.citation_id,
    publishedVersionId: post.published_version_id,
    createdAt: post.created_at,
    publishedAt: post.published_at,
    coverImageUrl: post.cover_image_url,
    tags: post.tags ?? [],
    isCoAuthor: entry.is_coauthor,
    referenceCount: entry.source_backed ? 1 : 0,
    coAuthors,
  };
}

async function hydrateRecordEntries(
  supabase: SupabaseClient,
  entries: RecordEntryRow[]
): Promise<ProfileRecordItem[]> {
  const publicationIds = entries
    .filter((entry) => entry.entry_kind !== "debate")
    .map((entry) => entry.entry_id);
  const debateIds = entries
    .filter((entry) => entry.entry_kind === "debate")
    .map((entry) => entry.entry_id);

  const [publicationResult, debateResult] = await Promise.all([
    publicationIds.length > 0
      ? supabase
          .from("posts")
          .select(
            "id, author_id, title, slug, in_response_to, excerpt, type, content_kind, article_format, citation_id, published_version_id, created_at, published_at, cover_image_url, tags, post_authors(user_id, accepted_at, profile:profiles!post_authors_user_id_fkey(username, full_name))"
          )
          .in("id", publicationIds)
      : Promise.resolve({ data: [], error: null }),
    debateIds.length > 0
      ? supabase
          .from("debate_arguments")
          .select(
            "id, content, stance, created_at, debates!debate_arguments_debate_id_fkey(id, title)"
          )
          .in("id", debateIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (publicationResult.error) throw new Error(publicationResult.error.message);
  if (debateResult.error) throw new Error(debateResult.error.message);

  const postsById = new Map(
    ((publicationResult.data ?? []) as unknown as PostRow[]).map((post) => [
      post.id,
      post,
    ])
  );
  const debatesById = new Map(
    ((debateResult.data ?? []) as unknown as DebateRow[]).map((debate) => [
      debate.id,
      debate,
    ])
  );

  return entries.flatMap((entry): ProfileRecordItem[] => {
    if (entry.entry_kind === "debate") {
      const row = debatesById.get(entry.entry_id);
      if (!row) return [];
      const debate = Array.isArray(row.debates) ? row.debates[0] : row.debates;
      return [
        {
          id: entry.entry_id,
          kind: "debate",
          occurredAt: entry.occurred_at,
          debate: {
            id: row.id,
            content: row.content,
            stance: row.stance,
            createdAt: row.created_at,
            debate,
          },
        },
      ];
    }

    const post = postsById.get(entry.entry_id);
    if (!post) return [];
    return [
      {
        id: entry.entry_id,
        kind: entry.entry_kind,
        occurredAt: entry.occurred_at,
        publication: normalizePost(post, entry),
      },
    ];
  });
}

export async function loadProfileRecordPage({
  supabase,
  profileId,
  filter,
  quality,
  page,
  includeResearch,
  pageSize = PROFILE_RECORD_PAGE_SIZE,
  entryIds,
}: {
  supabase: SupabaseClient;
  profileId: string;
  filter: ProfileRecordFilter;
  quality: ProfileRecordQuality;
  page: number;
  includeResearch: boolean;
  /**
   * Restricts the page to these entry ids, for filters the record view cannot
   * express itself. `null` means no restriction; an empty array means nothing
   * matched, which is not the same thing.
   */
  entryIds?: string[] | null;
  pageSize?: number;
}) {
  // An empty restriction means "nothing matched". Falling through would build
  // `.in("entry_id", [])`, which returns everything rather than nothing.
  if (entryIds && entryIds.length === 0) {
    return {
      items: [],
      totalCount: 0,
      page,
      pageSize,
      hasPreviousPage: page > 1,
      hasNextPage: false,
    };
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  let query = supabase
    .from("profile_record_entries")
    .select(
      "profile_id, entry_id, entry_kind, occurred_at, is_coauthor, source_backed, citable",
      { count: "exact" }
    )
    .eq("profile_id", profileId);

  if (!includeResearch) query = query.neq("entry_kind", "research");

  if (filter === "publications") {
    query = includeResearch
      ? query.in("entry_kind", ["publication", "research"])
      : query.eq("entry_kind", "publication");
  } else if (filter === "responses") {
    query = query.eq("entry_kind", "response");
  } else if (filter === "debates") {
    query = query.eq("entry_kind", "debate");
  } else if (filter === "research") {
    query = query.eq("entry_kind", "research");
  }

  if (quality === "source_backed") {
    query = query.eq("source_backed", true);
  } else if (quality === "citable") {
    query = query.eq("citable", true);
  }

  if (entryIds) query = query.in("entry_id", entryIds);

  query = query
    .order("occurred_at", { ascending: false })
    .order("entry_id", { ascending: false })
    .range(start, end);

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);

  const entries = (data ?? []) as unknown as RecordEntryRow[];
  return {
    items: await hydrateRecordEntries(supabase, entries),
    totalCount: count ?? 0,
    page,
    pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: start + entries.length < (count ?? 0),
  };
}

interface TopicPostRow {
  id: string;
  author_id: string;
  in_response_to: string | null;
  tags: string[] | null;
  type: string;
  status?: string;
}

interface CoAuthoredTopicRow {
  posts: TopicPostRow | TopicPostRow[] | null;
}

export interface ProfileTopicIndex {
  /** Ordered topic labels, as the profile and the record both display them. */
  topics: string[];
  /** Post ids per `profileTopicKey`, for restricting a record page. */
  postIdsByTopic: Map<string, string[]>;
}

const TOPIC_POST_SELECT = "id, author_id, in_response_to, tags, type";

/**
 * Guards the URL length of the `entry_id` restriction below: the ids travel to
 * PostgREST as a query parameter, and an author with hundreds of posts under
 * one tag would build a request too long to send. Well above any realistic
 * single-topic count. The structural fix is carrying tags on
 * `profile_record_entries` so the filter happens in the view, which is a
 * migration rather than a change here.
 */
const TOPIC_POST_ID_CAP = 300;

/**
 * Builds an author's topic list and the post ids behind each topic.
 *
 * `profile_record_entries` carries identifiers and evidence flags only, with
 * no tags, and it is a view, so there is no relationship for PostgREST to
 * filter across. Topics are therefore resolved to ids here and handed back to
 * `loadProfileRecordPage` as an `entryIds` restriction.
 */
export async function loadProfileTopicIndex({
  supabase,
  profileId,
  declaredInterests,
  includeResearch,
}: {
  supabase: SupabaseClient;
  profileId: string;
  declaredInterests?: string[] | null;
  includeResearch: boolean;
}): Promise<ProfileTopicIndex> {
  const [ownedResult, coauthoredResult] = await Promise.all([
    supabase
      .from("posts")
      .select(TOPIC_POST_SELECT)
      .eq("author_id", profileId)
      .eq("status", "published"),
    supabase
      .from("post_authors")
      .select(`posts!post_authors_post_id_fkey(${TOPIC_POST_SELECT}, status)`)
      .eq("user_id", profileId)
      .not("accepted_at", "is", null),
  ]);

  if (ownedResult.error) throw new Error(ownedResult.error.message);
  if (coauthoredResult.error) throw new Error(coauthoredResult.error.message);

  const byId = new Map<string, TopicPostRow>();
  for (const post of (ownedResult.data ?? []) as unknown as TopicPostRow[]) {
    byId.set(post.id, post);
  }
  for (const row of (coauthoredResult.data ?? []) as unknown as CoAuthoredTopicRow[]) {
    const post = Array.isArray(row.posts) ? row.posts[0] : row.posts;
    if (!post || post.status !== "published" || post.author_id === profileId) continue;
    if (!byId.has(post.id)) byId.set(post.id, post);
  }

  const posts = [...byId.values()].filter(
    (post) => includeResearch || post.type !== "research"
  );

  const postIdsByTopic = new Map<string, string[]>();
  for (const post of posts) {
    // Ranking skips responses, because a reply carries the tags of the
    // conversation it joined. Filtering does not: a tagged response is still
    // work on that topic, and a reader who asked for it should see it.
    for (const rawTag of post.tags ?? []) {
      const key = profileTopicKey(rawTag);
      if (!key) continue;
      const ids = postIdsByTopic.get(key);
      if (!ids) {
        postIdsByTopic.set(key, [post.id]);
      } else if (ids.length < TOPIC_POST_ID_CAP && !ids.includes(post.id)) {
        ids.push(post.id);
      }
    }
  }

  return {
    topics: deriveProfileTopics(posts, declaredInterests),
    postIdsByTopic,
  };
}

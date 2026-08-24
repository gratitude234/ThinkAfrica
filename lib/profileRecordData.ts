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
}: {
  supabase: SupabaseClient;
  profileId: string;
  filter: ProfileRecordFilter;
  quality: ProfileRecordQuality;
  page: number;
  includeResearch: boolean;
  pageSize?: number;
}) {
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

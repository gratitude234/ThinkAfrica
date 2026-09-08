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
import {
  deriveDeclaredInterests,
  deriveDemonstratedTopics,
  profileTopicKey,
  type DemonstratedTopic,
} from "@/lib/profileTopics";
import { profileRecordRepository } from "@/lib/db/readAdapter";
import { getCurrentUser } from "@/lib/serverAuth";
import { sanitizePostExcerpt } from "@/lib/utils";

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

export type ProfileRecordItem = {
  id: string;
  kind: ProfileRecordEntryKind;
  occurredAt: string;
  publication: ProfileRecordPublication;
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


/**
 * The record counts, including the Article / Post split when the database
 * can supply it.
 *
 * Two functions are tried in order, which is the deployment seam rather than
 * indecision. v2 arrives with 20260907000001 and carries the split; v1 is
 * what every environment already has. Asking for v2 first and falling back
 * means this can ship before the migration without turning a profile into an
 * error page, and the fallback removes itself the day v1 is dropped rather
 * than surviving as a flag nobody dares flip.
 *
 * A real query failure is not caught here. It throws, and the profile route's
 * error boundary handles it: counts are identity-critical, and a profile that
 * silently reports zero publications during an outage is worse than one that
 * admits it could not load.
 */
export async function loadProfileRecordSummary(
  supabase: SupabaseClient,
  profileId: string,
  includeResearch: boolean
): Promise<ProfileRecordSummary> {
  // The v2-then-v1 fallback moved into the repository, which reproduces it on
  // both backends. It is still two attempts, still matched on the code for
  // "no such function" rather than on its prose, and a real failure still
  // throws rather than reporting a profile with nothing on it.
  const payload = await profileRecordRepository(supabase).recordSummary(
    profileId,
    includeResearch
  );

  return payload
    ? normalizeProfileRecordSummary(payload)
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
    // Normalized here rather than in each row component, so every record
    // surface (and anything that reads a record item later) gets prose
    // instead of the editor HTML the excerpt was cut from.
    excerpt: sanitizePostExcerpt(post.excerpt),
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
  const publicationIds = entries.map((entry) => entry.entry_id);

  // The co-author names on each record entry are governed by the profiles
  // policy. Memoised for the render, so this is not an extra round trip.
  const viewer = await getCurrentUser();
  const posts = await profileRecordRepository(supabase).hydratePublications(
    publicationIds,
    viewer?.id ?? null
  );

  const postsById = new Map(
    (posts as unknown as PostRow[]).map((post) => [
      post.id,
      post,
    ])
  );

  return entries.flatMap((entry): ProfileRecordItem[] => {
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

  // The filter name maps to a set of entry kinds here rather than in the
  // repository, because the mapping depends on whether research is being
  // shown and that is this function's question, not the transport's.
  const kinds =
    filter === "publications"
      ? includeResearch
        ? ["publication", "research"]
        : ["publication"]
      : filter === "responses"
        ? ["response"]
        : filter === "research"
          ? ["research"]
          : null;

  const { entries, totalCount } = await profileRecordRepository(supabase).entries({
    profileId,
    kinds,
    includeResearch,
    // null, not false: these mean "do not filter on this at all", and an
    // `= false` would exclude every entry the unfiltered view shows.
    sourceBacked: quality === "source_backed" ? true : null,
    citable: quality === "citable" ? true : null,
    entryIds: entryIds ?? null,
    start,
    pageSize,
  });

  return {
    items: await hydrateRecordEntries(supabase, entries as RecordEntryRow[]),
    totalCount,
    page,
    pageSize,
    hasPreviousPage: page > 1,
    hasNextPage: start + entries.length < totalCount,
  };
}

interface TopicPostRow {
  id: string;
  author_id: string;
  in_response_to: string | null;
  tags: string[] | null;
  type: string;
  published_at?: string | null;
  created_at?: string | null;
  status?: string;
}

export interface ProfileTopicIndex {
  /**
   * Topics with published work behind them, ordered as the profile and the
   * record both display them. Declared interests are deliberately absent:
   * every entry here resolves to at least one record entry, which is what
   * makes the record's topic filter row safe to render.
   */
  demonstratedTopics: DemonstratedTopic[];
  /** What the author declared, minus anything their work already covers. */
  interests: string[];
  /** Post ids per `profileTopicKey`, for restricting a record page. */
  postIdsByTopic: Map<string, string[]>;
}

const TOPIC_POST_SELECT =
  "id, author_id, in_response_to, tags, type, published_at, created_at";

/**
 * How much of an author's history the topic ranking reads.
 *
 * This used to be unbounded: every published post the author owned or
 * co-authored, all columns needed to rank tags, fetched on every profile
 * view. For a prolific author that is thousands of rows travelling across
 * the wire to draw three words.
 *
 * 200 most recent works is a deliberate compromise rather than a round
 * number. It covers every author on the platform today with room to spare,
 * so nothing visible changes now, and it caps the cost for the authors who
 * eventually pass it. Where it does bind, it biases the list toward what
 * someone is writing about lately, which is the more useful answer to
 * "what does this person write about" than an all-time frequency count.
 *
 * The structural fix is aggregation in SQL: a topics function grouping
 * tags over profile_record_entries and returning a dozen rows rather than a
 * page of posts. That belongs with Phase 4's Intellectual Footprint, which
 * needs the same aggregate, and is deliberately not smuggled into the
 * content-split migration.
 */
export const TOPIC_SCAN_LIMIT = 200;

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
  // Co-authorship rows carry no date of their own, so that branch is bounded
  // on acceptance order rather than on publication. Same purpose as the owned
  // branch's bound: a cap on how much history one profile view reads.
  const scan = await profileRecordRepository(supabase).topicPosts(
    profileId,
    TOPIC_SCAN_LIMIT
  );

  const byId = new Map<string, TopicPostRow>();
  for (const post of scan.owned as unknown as TopicPostRow[]) {
    byId.set(post.id, post);
  }
  for (const post of scan.coauthored as unknown as TopicPostRow[]) {
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

  const demonstratedTopics = deriveDemonstratedTopics(posts);

  return {
    demonstratedTopics,
    interests: deriveDeclaredInterests(declaredInterests, demonstratedTopics),
    postIdsByTopic,
  };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { FEATURE_FLAGS, RESEARCH_TYPE_QUERY_EXCLUSION } from "@/lib/featureFlags";
import { formatTagLabel, normalizeTagValue } from "@/lib/tags";

/**
 * Every search query the application runs, on the server.
 *
 * These used to run in the browser, against the anon key, from three separate
 * client components. That worked because the rows are public and RLS said so.
 * It stops working the moment the database is Neon: there is no anon key to
 * give a browser, and there is no version of this migration where one exists.
 * A connection string is not a public credential.
 *
 * So the queries move here, behind `/api/search` and `/api/tags`, and the
 * browser asks the application instead of asking the database. Nothing about
 * what a visitor can see changes: the same rows, the same filters, the same
 * limits. What changes is who holds the credential.
 *
 * ## The injection these queries had
 *
 * The old code interpolated the raw query string into a PostgREST filter:
 *
 *     .or(`title.ilike.%${q}%,excerpt.ilike.%${q}%`)
 *
 * `or=` takes a comma-separated list of filters, so a search for `a,b` did not
 * search for "a,b". It sent a third filter, `b%`, which PostgREST rejected as
 * malformed, and the whole search returned nothing. A search containing `)`
 * did the same. Nobody reported it because a search that quietly finds nothing
 * looks like a search that found nothing.
 *
 * It was never a data-exposure hole: PostgREST's grammar cannot express a join
 * or a subquery, and RLS still applied to whatever it did parse. It was a
 * correctness hole with an injection's shape, which is worth fixing the way an
 * injection is fixed rather than by stripping punctuation out of what people
 * type. `orIlikeFilter` below quotes and escapes instead.
 */

/** Longer than any real search, short enough that a pathological pattern is
 *  not worth the database's time. Trimmed to this rather than rejected: a
 *  paste of a paragraph should search for the paragraph's start. */
export const MAX_SEARCH_QUERY_LENGTH = 100;

export const OVERLAY_RESULT_LIMIT = 6;
export const POST_RESULT_LIMIT = 15;
export const PEOPLE_RESULT_LIMIT = 8;
export const OPPORTUNITY_RESULT_LIMIT = 6;

/** How many published posts the tag list is derived from. The same 500 the
 *  browser used to read; the number is what the trending counts mean. */
export const TAG_SAMPLE_SIZE = 500;

export interface SearchPostResult {
  id: string;
  title: string | null;
  slug: string;
  excerpt: string | null;
  type: string;
  content_kind: string | null;
  article_format: string | null;
  citation_id: string | null;
  published_version_id: string | null;
  published_at: string | null;
  profiles: {
    username: string;
    full_name: string | null;
    university: string | null;
  } | null;
}

export interface SearchPersonResult {
  id: string;
  username: string;
  full_name: string | null;
  university: string | null;
  points: number | null;
  avatar_url: string | null;
}

export interface SearchOpportunityResult {
  id: string;
  title: string;
  sponsor_name: string | null;
  deadline: string | null;
}

export interface TopicCount {
  tag: string;
  count: number;
}

/**
 * A user's text, as a LIKE pattern that matches it literally.
 *
 * `%` and `_` are LIKE wildcards. Unescaped, a search for `100%` matches every
 * row, and a search for `a_b` matches `axb`. The backslash goes first, because
 * escaping it after the others would escape the escapes.
 */
export function escapeLikeFragment(raw: string): string {
  return raw
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_");
}

/**
 * One or more columns, ILIKE the same pattern, as a PostgREST `or` filter.
 *
 * The value is double-quoted, which is how PostgREST is told that a comma, a
 * parenthesis or a dot inside it is data rather than grammar. Inside those
 * quotes a backslash or a double quote is escaped with a backslash, which is
 * why the LIKE escaping above is applied first and then escaped again here:
 * PostgREST removes one layer, and Postgres sees the layer that was meant for
 * it.
 */
export function orIlikeFilter(columns: readonly string[], raw: string): string {
  const pattern = `%${escapeLikeFragment(raw)}%`;
  const quoted = pattern.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return columns.map((column) => `${column}.ilike."${quoted}"`).join(",");
}

/** Trimmed, capped, and rejected outright when empty. Every entry point uses
 *  this, so none of them can disagree about what an empty search is. */
export function normalizeSearchQuery(raw: string | null): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, MAX_SEARCH_QUERY_LENGTH);
}

const OVERLAY_SELECT =
  "id, title, slug, type, content_kind, article_format, citation_id, published_version_id, profiles!posts_author_id_fkey(full_name, username)";

const POST_SELECT =
  "id, title, slug, excerpt, type, content_kind, article_format, citation_id, published_version_id, published_at, profiles!posts_author_id_fkey(username, full_name, university)";

/** PostgREST returns a one-to-one embed as an object or a one-element array
 *  depending on how it resolved the relationship. Both callers want the object. */
function firstAuthor<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * The command-palette typeahead: titles only, six results.
 *
 * The research filter is applied here rather than in the caller. It used to be
 * a `.filter()` over the six rows the database returned, which meant a search
 * matching six research posts showed nothing at all while claiming to have
 * searched. Excluding them in the query gets six results a reader can see.
 */
export async function searchOverlayPosts(
  supabase: SupabaseClient,
  query: string
): Promise<SearchPostResult[]> {
  // RESEARCH_TYPE_QUERY_EXCLUSION is a sentinel that matches nothing when
  // research is enabled, so this is unconditional. The content_kind half is
  // not, because there is no sentinel for it and `is null` has to be allowed
  // through: most posts have no content_kind at all.
  let request = supabase
    .from("posts")
    .select(OVERLAY_SELECT)
    .eq("status", "published")
    .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION)
    .ilike("title", `%${escapeLikeFragment(query)}%`);

  if (!FEATURE_FLAGS.research) {
    request = request.or("content_kind.is.null,content_kind.neq.research");
  }

  const { data, error } = await request.limit(OVERLAY_RESULT_LIMIT);
  if (error) throw new Error(`overlay search failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...(row as unknown as SearchPostResult),
    profiles: firstAuthor((row as { profiles?: unknown }).profiles) as
      | SearchPostResult["profiles"],
  }));
}

export async function searchPosts(
  supabase: SupabaseClient,
  query: string
): Promise<SearchPostResult[]> {
  const { data, error } = await supabase
    .from("posts")
    .select(POST_SELECT)
    .eq("status", "published")
    .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION)
    .or(orIlikeFilter(["title", "excerpt"], query))
    .order("published_at", { ascending: false })
    .limit(POST_RESULT_LIMIT);

  if (error) throw new Error(`post search failed: ${error.message}`);

  return (data ?? []).map((row) => ({
    ...(row as unknown as SearchPostResult),
    profiles: firstAuthor((row as { profiles?: unknown }).profiles) as
      | SearchPostResult["profiles"],
  }));
}

export async function searchPeople(
  supabase: SupabaseClient,
  query: string
): Promise<SearchPersonResult[]> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, username, full_name, university, points, avatar_url")
    .or(orIlikeFilter(["username", "full_name", "university"], query))
    .limit(PEOPLE_RESULT_LIMIT);

  if (error) throw new Error(`people search failed: ${error.message}`);
  return (data ?? []) as SearchPersonResult[];
}

export async function searchOpportunities(
  supabase: SupabaseClient,
  query: string
): Promise<SearchOpportunityResult[]> {
  const { data, error } = await supabase
    .from("fellowships")
    .select("id, title, sponsor_name, deadline")
    .eq("status", "open")
    .or(orIlikeFilter(["title", "sponsor_name"], query))
    .order("deadline", { ascending: true, nullsFirst: false })
    .limit(OPPORTUNITY_RESULT_LIMIT);

  if (error) throw new Error(`opportunity search failed: ${error.message}`);
  return (data ?? []) as SearchOpportunityResult[];
}

/**
 * Every topic in use, most used first.
 *
 * Counted on the hash-stripped label rather than the raw tag. Keying on the
 * raw value counted "#africa" and "africa" as two topics, so a topic split
 * across both spellings ranked as two half-sized entries and could miss the
 * trending list entirely.
 *
 * The suggestion list and the trending list are the same query, so they cannot
 * disagree about what a topic is. They differ only in which field they read:
 * one wants the normalised key to insert, the other the label to show.
 */
export async function loadTopicCounts(
  supabase: SupabaseClient
): Promise<TopicCount[]> {
  const { data, error } = await supabase
    .from("posts")
    .select("tags")
    .eq("status", "published")
    .limit(TAG_SAMPLE_SIZE);

  if (error) throw new Error(`topic list failed: ${error.message}`);

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ tags: string[] | null }>) {
    for (const tag of row.tags ?? []) {
      const label = formatTagLabel(tag);
      if (!label) continue;
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/** The same topics, as the normalised keys a tag field inserts, alphabetically.
 *  Derived from the counts so one query serves both surfaces. */
export function topicKeysFromCounts(topics: readonly TopicCount[]): string[] {
  const keys = new Set<string>();
  for (const topic of topics) {
    const normalized = normalizeTagValue(topic.tag);
    if (normalized) keys.add(normalized);
  }
  return [...keys].sort((a, b) => a.localeCompare(b));
}

/** Everything the search page asks for, in one round trip. */
export async function runSiteSearch(supabase: SupabaseClient, query: string) {
  const [posts, people, opportunities] = await Promise.all([
    searchPosts(supabase, query),
    searchPeople(supabase, query),
    searchOpportunities(supabase, query),
  ]);
  return { posts, people, opportunities };
}

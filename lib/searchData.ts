import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { searchRepository } from "@/lib/db/readAdapter";
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
 * type. `orIlikeFilter` quotes and escapes instead.
 *
 * ## What this module does now
 *
 * The queries themselves live in `lib/db/search.ts`, in both transports. What
 * stays here is the part that is not a query: the limits, the topic counting,
 * and the one place that decides what an empty search is.
 *
 * Every entry point takes a viewer id the *server* resolved. It is not
 * decoration. The people search and both author projections are governed by
 * the `profiles` policy, which PostgREST was applying from the session and
 * which a direct connection has to carry itself.
 */

export {
  MAX_SEARCH_QUERY_LENGTH,
  escapeLikeFragment,
  likeContainsPattern,
  normalizeSearchQuery,
  orIlikeFilter,
} from "@/lib/searchFilters";

export { firstAuthor } from "@/lib/db/search";

export type {
  SearchOpportunityResult,
  SearchOverlayResult,
  SearchPersonResult,
  SearchPostResult,
} from "@/lib/db/search";

export const OVERLAY_RESULT_LIMIT = 6;
export const POST_RESULT_LIMIT = 15;
export const PEOPLE_RESULT_LIMIT = 8;
export const OPPORTUNITY_RESULT_LIMIT = 6;

/** How many published posts the tag list is derived from. The same 500 the
 *  browser used to read; the number is what the trending counts mean. */
export const TAG_SAMPLE_SIZE = 500;

export interface TopicCount {
  tag: string;
  count: number;
}

/** The viewer, as the server resolved them. Null is a logged-out reader, which
 *  is an answer rather than a missing argument. */
export interface SearchViewer {
  viewerId: string | null;
}

/**
 * The command-palette typeahead: titles only, six results.
 *
 * The research filter is applied in the query rather than in the caller. It
 * used to be a `.filter()` over the six rows the database returned, which
 * meant a search matching six research posts showed nothing at all while
 * claiming to have searched. Excluding them in the query gets six results a
 * reader can see.
 */
export async function searchOverlayPosts(
  supabase: SupabaseClient,
  query: string,
  { viewerId }: SearchViewer
) {
  return searchRepository(supabase).overlayPosts(query, {
    viewerId,
    limit: OVERLAY_RESULT_LIMIT,
  });
}

export async function searchPosts(
  supabase: SupabaseClient,
  query: string,
  { viewerId }: SearchViewer
) {
  return searchRepository(supabase).posts(query, {
    viewerId,
    limit: POST_RESULT_LIMIT,
  });
}

export async function searchPeople(
  supabase: SupabaseClient,
  query: string,
  { viewerId }: SearchViewer
) {
  return searchRepository(supabase).people(query, {
    viewerId,
    limit: PEOPLE_RESULT_LIMIT,
  });
}

export async function searchOpportunities(
  supabase: SupabaseClient,
  query: string
) {
  return searchRepository(supabase).opportunities(query, {
    limit: OPPORTUNITY_RESULT_LIMIT,
  });
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
 *
 * The counting stays here rather than moving into SQL, because the key is
 * `formatTagLabel` and reimplementing it in two languages is how the two
 * spellings got counted separately in the first place.
 */
export async function loadTopicCounts(
  supabase: SupabaseClient
): Promise<TopicCount[]> {
  const sample = await searchRepository(supabase).publishedTagSample(
    TAG_SAMPLE_SIZE
  );

  const counts = new Map<string, number>();
  for (const row of sample) {
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

/** Everything the search page asks for. Three bounded statements rather than
 *  one combined query: they return three unrelated shapes, and a single
 *  statement producing all three would be harder to audit than the thing it
 *  replaced. On the migrated path they share one pooled connection. */
export async function runSiteSearch(
  supabase: SupabaseClient,
  query: string,
  viewer: SearchViewer
) {
  const [posts, people, opportunities] = await Promise.all([
    searchPosts(supabase, query, viewer),
    searchPeople(supabase, query, viewer),
    searchOpportunities(supabase, query),
  ]);
  return { posts, people, opportunities };
}

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePostgresExecutor } from "@/lib/db/postgres/connection";
import {
  createPostgresFeedRepository,
  createSupabaseFeedRepository,
  type FeedRepository,
} from "@/lib/db/feed";
import {
  createPostgresViewerStateRepository,
  createSupabaseViewerStateRepository,
  type ViewerStateRepository,
} from "@/lib/db/viewerState";
import {
  createPostgresCommentsRepository,
  createSupabaseCommentsRepository,
  type CommentsRepository,
} from "@/lib/db/comments";
import {
  createPostgresSearchRepository,
  createSupabaseSearchRepository,
  type SearchRepository,
} from "@/lib/db/search";
import {
  createPostgresProfileRecordRepository,
  createSupabaseProfileRecordRepository,
  type ProfileRecordRepository,
} from "@/lib/db/profileRecord";
import {
  createPostgresProfilePageRepository,
  createSupabaseProfilePageRepository,
  type ProfilePageRepository,
} from "@/lib/db/profilePage";
import {
  createPostgresPostPageRepository,
  createSupabasePostPageRepository,
  type PostPageRepository,
} from "@/lib/db/postPage";

/**
 * Which backend a *migrated* read uses, per domain.
 *
 * ## Why this is not `DATABASE_ADAPTER`
 *
 * `DATABASE_ADAPTER` is a single switch over everything behind `lib/db`, and
 * flipping it is only correct once every read a page makes has moved. This
 * migration is incremental by design: a domain moves when its repository has
 * been proven against live production data, and until then the page must keep
 * using PostgREST for it. One global flag cannot express "posts have moved and
 * the feed has not".
 *
 * So `READ_MIGRATED_DOMAINS` is a list. Unset means nothing has moved, which is
 * what production is. `post-page` means the post page's secondary reads use
 * PostgreSQL. An unrecognised name throws, because a typo that silently left a
 * domain on PostgREST would look exactly like the migration working.
 *
 * ## What this connects to
 *
 * At this stage the connection string points at **production Supabase's own
 * Postgres**, not at Neon. Same database, same rows, no staleness, no split
 * brain. What changes is that the read stops travelling through PostgREST, so
 * a gateway failure stops taking the page with it.
 *
 * The SQL is ordinary PostgreSQL. Pointing `DATABASE_URL` at Neon later is a
 * connection-string change, not a rewrite, which is the whole reason for
 * doing it this way round.
 */

export const MIGRATABLE_READ_DOMAINS = [
  "post-page",
  "feed",
  "profile-page",
  "search",
  "comments",
  "viewer-state",
] as const;

export type ReadDomain = (typeof MIGRATABLE_READ_DOMAINS)[number];

export function resolveMigratedReadDomains(
  raw: string | undefined = process.env.READ_MIGRATED_DOMAINS
): ReadonlySet<ReadDomain> {
  const value = (raw ?? "").trim();
  if (value === "") return new Set();

  const known = new Set<string>(MIGRATABLE_READ_DOMAINS);
  const chosen = new Set<ReadDomain>();

  for (const entry of value.split(",")) {
    const name = entry.trim();
    if (name === "") continue;
    if (!known.has(name)) {
      throw new Error(
        `READ_MIGRATED_DOMAINS contains an unknown domain "${name}". ` +
          `Known domains: ${MIGRATABLE_READ_DOMAINS.join(", ")}.`
      );
    }
    chosen.add(name as ReadDomain);
  }

  return chosen;
}

export function isReadDomainMigrated(domain: ReadDomain): boolean {
  return resolveMigratedReadDomains().has(domain);
}

/**
 * The post page's secondary reads.
 *
 * Takes the request's Supabase client because the un-migrated path still needs
 * it, and because every call site already has one. When the domain has moved
 * the client is unused.
 */
export function postPageRepository(
  supabase: SupabaseClient
): PostPageRepository {
  return isReadDomainMigrated("post-page")
    ? createPostgresPostPageRepository(resolvePostgresExecutor())
    : createSupabasePostPageRepository(supabase);
}

/**
 * The feed's shared hydration.
 *
 * Takes both clients because the un-migrated path needs them and because every
 * call site already has them: the reader may be the admin client for a public
 * list, while the viewer's own client is what makes the comment count obey
 * RLS. When the domain has moved neither is used, and that visibility rule
 * becomes a parameter the server resolves instead. See lib/db/feed.ts.
 */
export function feedRepository(
  reader: SupabaseClient,
  viewerClient: SupabaseClient | null
): FeedRepository {
  return isReadDomainMigrated("feed")
    ? createPostgresFeedRepository(resolvePostgresExecutor())
    : createSupabaseFeedRepository(viewerClient ?? reader);
}

/** The public profile page. Its identity row already moved; this is the rest. */
export function profilePageRepository(
  supabase: SupabaseClient
): ProfilePageRepository {
  return isReadDomainMigrated("profile-page")
    ? createPostgresProfilePageRepository(resolvePostgresExecutor())
    : createSupabaseProfilePageRepository(supabase);
}

/**
 * The public profile record: its counts, entry pages and topic index.
 *
 * Shares the `profile-page` domain with the header rather than taking one of
 * its own, because the same public page loads both. Two switches would let one
 * profile be served half from each transport, which is the state this
 * migration is arranged to avoid.
 */
export function profileRecordRepository(
  supabase: SupabaseClient
): ProfileRecordRepository {
  return isReadDomainMigrated("profile-page")
    ? createPostgresProfileRecordRepository(resolvePostgresExecutor())
    : createSupabaseProfileRecordRepository(supabase);
}

/**
 * Search: the typeahead, the search page, and the tag sample.
 *
 * Every method takes the viewer id the server resolved, because the people
 * search and both author projections are governed by the `profiles` policy
 * that PostgREST was applying from the session. See lib/db/search.ts.
 */
export function searchRepository(supabase: SupabaseClient): SearchRepository {
  return isReadDomainMigrated("search")
    ? createPostgresSearchRepository(resolvePostgresExecutor())
    : createSupabaseSearchRepository(supabase);
}

/**
 * The comment thread.
 *
 * Takes the viewer because two policies govern what a thread contains: the
 * comments rule hides moderated rows from everyone but their author and an
 * admin, and the profiles rule hides suspended and private commenters' names.
 * PostgREST applied both from the session; a direct connection carries them
 * itself. See lib/db/comments.ts.
 */
export function commentsRepository(
  supabase: SupabaseClient
): CommentsRepository {
  return isReadDomainMigrated("comments")
    ? createPostgresCommentsRepository(resolvePostgresExecutor())
    : createSupabaseCommentsRepository(supabase);
}

/**
 * The viewer's own state: blocks, and whether two people may message.
 *
 * Takes a client because the un-migrated path needs one. Every call site here
 * reads through the admin client or a SECURITY DEFINER function, so no policy
 * is being reproduced; see lib/db/viewerState.ts for why that is stated rather
 * than assumed.
 */
export function viewerStateRepository(
  supabase: SupabaseClient
): ViewerStateRepository {
  return isReadDomainMigrated("viewer-state")
    ? createPostgresViewerStateRepository(resolvePostgresExecutor())
    : createSupabaseViewerStateRepository(supabase);
}

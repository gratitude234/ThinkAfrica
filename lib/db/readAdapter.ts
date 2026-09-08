import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolvePostgresExecutor } from "@/lib/db/postgres/connection";
import {
  createPostgresFeedRepository,
  createSupabaseFeedRepository,
  type FeedRepository,
} from "@/lib/db/feed";
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

export const MIGRATABLE_READ_DOMAINS = ["post-page", "feed"] as const;

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

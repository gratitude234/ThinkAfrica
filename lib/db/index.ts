import "server-only";

import { supabasePostsRepository } from "@/lib/db/supabase/posts";
import { createPostgresPostsRepository } from "@/lib/db/postgres/posts";
import { resolvePostgresExecutor } from "@/lib/db/postgres/connection";
import type { Database } from "@/lib/db/types";

/**
 * The one place the application decides which database implementation answers.
 *
 * The selection is a process-wide environment variable rather than anything
 * per-request, on purpose. A per-request switch would mean two providers
 * serving one page, and a page composed of rows from two databases is not a
 * thing anyone can reason about during an incident.
 *
 * `supabase` is the default and remains the default until a domain has been
 * migrated, verified and cut over deliberately. An unset variable therefore
 * behaves exactly as the application did before lib/db existed.
 */
export type AdapterName = Database["adapter"];

const ADAPTER_NAMES: readonly AdapterName[] = ["supabase", "postgres"];

export function resolveAdapterName(
  raw: string | undefined = process.env.DATABASE_ADAPTER
): AdapterName {
  const value = raw?.trim();
  if (!value) return "supabase";
  if ((ADAPTER_NAMES as readonly string[]).includes(value)) {
    return value as AdapterName;
  }
  // Not a silent fallback to the default: a typo in this variable during a
  // cutover must not look like a successful decision to stay on Supabase.
  throw new Error(
    `DATABASE_ADAPTER must be one of ${ADAPTER_NAMES.join(", ")}. Received "${value}".`
  );
}

export function createDatabase(adapter: AdapterName): Database {
  if (adapter === "supabase") {
    return { adapter, posts: supabasePostsRepository };
  }
  return { adapter, posts: createPostgresPostsRepository(resolvePostgresExecutor()) };
}

/**
 * Resolved per call rather than memoised at module scope, so a deployment can
 * change `DATABASE_ADAPTER` and have the next request obey it. The Supabase
 * repository is a frozen object literal and the Postgres one is a closure over
 * an executor the connection module is expected to pool, so there is nothing
 * expensive here to cache.
 */
export function getDatabase(): Database {
  return createDatabase(resolveAdapterName());
}

export type { Database, PostsRepository, PostRecord, AuthorProfile } from "@/lib/db/types";
export { VISIBLE_POST_STATUSES, getPostAuthor } from "@/lib/db/types";

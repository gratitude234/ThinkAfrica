import "server-only";

import { cache } from "react";
import { getDatabase } from "@/lib/db";
import { getCurrentUser } from "@/lib/serverAuth";

/**
 * The one place a public post page reads its core row from the database.
 *
 * `/post/[slug]` used to look the same post up twice per request: once in
 * `generateMetadata()` for the title and OG tags, once in the page component
 * for the body. Next.js renders `generateMetadata` inside the same React
 * server render as the page (app-render composes the Metadata element into the
 * same flight tree), so both ran against the same connection pool microseconds
 * apart, and every degradation logged the pair
 * `[post/<slug>] metadata query failed` and `[post/<slug>] page query failed`.
 *
 * `cache()` from React is the right mechanism here, not `unstable_cache` and
 * not `"use cache"`. Both of those persist a value ACROSS requests, and this
 * row is not safe to share across requests: it includes drafts and in-review
 * posts, which the caller then gates on the viewer's own id. React's `cache()`
 * memoises only for the lifetime of one server render, which is exactly the
 * window in which the duplicate happened.
 *
 * What lives here is public/core post data only. Viewer state (likes,
 * bookmarks, follows, permissions, session) is deliberately kept out and stays
 * in the page's own viewer loader, so nothing user-specific is ever shared by
 * this memo.
 *
 * The query itself no longer lives here. It moved behind lib/db so the post
 * domain can be pointed at Neon without the route changing; this module keeps
 * what it was always actually for, which is the memo and the route's contract
 * with it. See docs/database-access-inventory.md.
 */

export {
  VISIBLE_POST_STATUSES,
  getPostAuthor,
  type AuthorProfile,
  type PostRecord,
} from "@/lib/db/types";

import type { PostRecord } from "@/lib/db/types";

async function loadPostBySlug(slug: string): Promise<PostRecord | null> {
  // The author embed is governed by the profiles policy, which PostgREST
  // applied from the session and a direct connection has to carry. Both this
  // and getCurrentUser are memoised for the render, so asking here costs
  // nothing the page was not already paying.
  const viewer = await getCurrentUser();
  const post = await getDatabase().posts.findBySlug(slug, viewer?.id ?? null);

  // Off by default. Set POST_QUERY_DEBUG=1 to prove in production logs that a
  // single request produces exactly one of these lines per slug: two would
  // mean the memo is not holding and the duplicate has come back.
  if (process.env.POST_QUERY_DEBUG === "1") {
    console.info(`[post/${slug}] core post query executed`);
  }

  return post;
}

/**
 * Memoised for the lifetime of one server render. `generateMetadata()` and the
 * page component both call this with the same slug, and the second call is
 * served from the first call's promise rather than the database.
 */
export const getPostBySlug = cache(loadPostBySlug);

/** The uncached implementation, for tests that need to observe the query
 *  itself rather than the memo around it. */
export { loadPostBySlug as loadPostBySlugUncached };

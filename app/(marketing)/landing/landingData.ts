import "server-only";

import { unstable_cache } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPublicTopicCounts, type TopicCount } from "@/lib/discoverData";
import { RESEARCH_TYPE_QUERY_EXCLUSION } from "@/lib/featureFlags";

/**
 * The public landing page's data, and the rule that it can never take the site
 * down with it.
 *
 * Extracted from `page.tsx` after a Vercel build failed three times over on
 * this fetch. The page was statically generated, so `next build` ran these
 * four queries against production Supabase; Supabase was slow that minute, the
 * admin client had no deadline, and Next killed the page build at 60 seconds,
 * three attempts, then failed the whole deployment. An identical redeploy two
 * minutes later succeeded, which is the tell: nothing was wrong with the code,
 * and a deployment that only works when the database is fast is not a
 * deployment process.
 *
 * Three things now stand between that and a failed build:
 *
 *   1. **The page is rendered at request time**, not at build time. See the
 *      `dynamic` export in `page.tsx`. A build no longer touches the database.
 *   2. **The admin client carries the same 8-second deadline** the
 *      request-scoped client has always had (`lib/supabase/admin.ts`). Nothing
 *      here can wait longer than that, whatever the database is doing.
 *   3. **Failure is an empty page, not an error.** `loadLandingData()` never
 *      rejects.
 *
 * The caching is unchanged and is load-bearing: this is the front door, and
 * four uncached queries per visit is not an acceptable price for a page whose
 * content changes hourly at most.
 */

// ── Types ────────────────────────────────────────────────────────────

export type LandingPost = {
  id: string;
  title: string | null;
  slug: string;
  type: string;
  content_kind?: string | null;
  article_format?: string | null;
  excerpt: string | null;
  cover_image_url: string | null;
  view_count: number | null;
  published_at: string | null;
  featured?: boolean | null;
  profiles: {
    username: string | null;
    full_name: string | null;
    university: string | null;
  } | null;
};

export type LandingPostRaw = Omit<LandingPost, "profiles"> & {
  profiles: LandingPost["profiles"] | LandingPost["profiles"][];
};

export type LandingData = {
  postsRaw: LandingPostRaw[];
  postCount: number;
  userCount: number;
  topics: TopicCount[];
};

export const TOPICS_DISPLAY_LIMIT = 12;

/**
 * What a visitor sees when the database cannot be reached.
 *
 * Every field is empty rather than absent, so the page renders its full
 * structure: the headline, the value propositions, the calls to action, the
 * footer. Only the three data-driven strips come back empty. A visitor arriving
 * during an outage gets a landing page that works and a signup button that
 * works, which is most of what a landing page is for.
 *
 * Frozen because it is shared by every request that hits the fallback, and a
 * caller that mutated it would corrupt every subsequent one.
 */
export const EMPTY_LANDING_DATA: LandingData = Object.freeze({
  postsRaw: [],
  postCount: 0,
  userCount: 0,
  topics: [],
});

// ── Fetching ─────────────────────────────────────────────────────────

type LandingSupabase =
  | Awaited<ReturnType<typeof createClient>>
  | ReturnType<typeof createAdminClient>;

export async function fetchLandingData(
  supabase: LandingSupabase
): Promise<LandingData> {
  const [{ data: postsRaw }, { count: postCount }, { count: userCount }, topicCounts] =
    await Promise.all([
      supabase
        .from("posts")
        .select(
          `id, title, slug, type, content_kind, article_format, excerpt, cover_image_url, view_count, published_at, featured,
           profiles!posts_author_id_fkey (username, full_name, university)`
        )
        .eq("status", "published")
        .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION)
        .order("featured", { ascending: false })
        .order("view_count", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(7),
      supabase
        .from("posts")
        .select("id", { count: "exact", head: true })
        .eq("status", "published")
        .neq("type", RESEARCH_TYPE_QUERY_EXCLUSION),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      getPublicTopicCounts(supabase),
    ]);

  return {
    postsRaw: (postsRaw ?? []) as LandingPostRaw[],
    postCount: postCount ?? 0,
    userCount: userCount ?? 0,
    topics: topicCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, TOPICS_DISPLAY_LIMIT),
  };
}

/**
 * Five minutes, unchanged.
 *
 * The page is dynamic now, so this is the only cache left, and it is what stops
 * a dynamic page from meaning four Supabase round trips per visitor. A failed
 * fetch is deliberately not cached: `unstable_cache` stores a resolved value,
 * so a throw propagates and the next request tries again. Caching the fallback
 * would freeze an empty landing page for five minutes after a one-second blip.
 */
const getCachedLandingData = unstable_cache(
  async () => fetchLandingData(createAdminClient()),
  ["marketing-landing-data"],
  { revalidate: 300, tags: ["landing", "public"] }
);

/** Postgres says a sentence; a gateway in front of it says a whole HTML error
 *  page. An unbounded message puts kilobytes of Cloudflare markup into the log
 *  on every request during an outage, which is when the log is least readable
 *  and most needed. */
export function describeLandingFailure(error: unknown): string {
  const raw =
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const collapsed = raw.replace(/\s+/g, " ").trim();
  return collapsed.length > 200
    ? `${collapsed.slice(0, 200)}... (truncated)`
    : collapsed;
}

/**
 * The landing page's data, or an empty version of it. Never rejects.
 *
 * The visitor is never shown any of this: the page renders its structure with
 * empty strips, and the reason goes to the server log. A database error message
 * on a public marketing page tells a stranger what our database is and how it
 * failed, and tells the visitor nothing they can act on.
 */
export async function loadLandingData(): Promise<LandingData> {
  try {
    return process.env.SUPABASE_SERVICE_ROLE_KEY
      ? await getCachedLandingData()
      : await fetchLandingData(await createClient());
  } catch (error) {
    console.error(
      `[landing] public data unavailable, rendering the page without it: ${describeLandingFailure(error)}`
    );
    return EMPTY_LANDING_DATA;
  }
}

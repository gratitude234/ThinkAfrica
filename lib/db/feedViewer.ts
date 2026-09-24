import "server-only";

/**
 * The feed's signed-in reader context.
 *
 * This repository exists because Home must not have one hidden PostgREST-only
 * dependency after the rest of the feed has moved to direct PostgreSQL. The
 * same `feed` read domain now owns candidate selection, card hydration, ranking
 * counters, and the viewer context that makes those reads safe.
 *
 * The PostgreSQL statement deliberately reproduces `get_feed_viewer_context`:
 * interests and follows are optional personalization, while both directions of
 * the block graph are always resolved. That last part is trust-and-safety data,
 * so callers must fail closed if neither transport can produce it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

export interface FeedViewerRecord {
  userInterests: string[];
  followedIds: string[];
  excludedAuthorIds: string[];
}

export interface FeedViewerRepository {
  load(input: { userId: string; personalized: boolean }): Promise<FeedViewerRecord>;
  readonly backend: "supabase" | "postgres";
}

/**
 * JSON rather than PostgreSQL array columns is intentional. The runtime driver
 * uses `fetch_types: false`, so jsonb gives this repository one stable wire
 * shape regardless of which PostgreSQL endpoint backs `DATABASE_URL`.
 */
const FEED_VIEWER_SQL = `
  select
    case
      when $2::boolean then coalesce(
        (select to_jsonb(p.interests) from public.profiles p where p.id = $1::uuid),
        '[]'::jsonb
      )
      else '[]'::jsonb
    end as user_interests,
    case
      when $2::boolean then coalesce(
        (
          select jsonb_agg(f.following_id order by f.following_id)
          from public.follows f
          where f.follower_id = $1::uuid
        ),
        '[]'::jsonb
      )
      else '[]'::jsonb
    end as followed_ids,
    coalesce(
      (
        select jsonb_agg(other_id order by other_id)
        from (
          select distinct
            case
              when b.blocker_id = $1::uuid then b.blocked_id
              else b.blocker_id
            end as other_id
          from public.user_blocks b
          where (b.blocker_id = $1::uuid or b.blocked_id = $1::uuid)
            and case
                  when b.blocker_id = $1::uuid then b.blocked_id
                  else b.blocker_id
                end is distinct from $1::uuid
        ) blocked
      ),
      '[]'::jsonb
    ) as excluded_author_ids
`;

function codedError(error: unknown, fallback: string): Error & { code?: string; status?: number } {
  const source = error as {
    message?: unknown;
    code?: unknown;
    status?: unknown;
  } | null;
  return Object.assign(
    new Error(
      typeof source?.message === "string" && source.message.trim()
        ? source.message
        : fallback
    ),
    {
      code: typeof source?.code === "string" ? source.code : undefined,
      status: typeof source?.status === "number" ? source.status : undefined,
    }
  );
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
      .map(String);
  }
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      return stringArray(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeRecord(row: Record<string, unknown> | null | undefined): FeedViewerRecord {
  return {
    userInterests: stringArray(row?.user_interests),
    followedIds: stringArray(row?.followed_ids),
    excludedAuthorIds: stringArray(row?.excluded_author_ids),
  };
}

export function createSupabaseFeedViewerRepository(
  supabase: SupabaseClient
): FeedViewerRepository {
  return {
    backend: "supabase",

    async load({ userId, personalized }) {
      const { data, error } = await supabase.rpc("get_feed_viewer_context", {
        p_user_id: userId,
        p_personalized: personalized,
      });

      if (error) throw codedError(error, "feed viewer context failed");

      if (!Array.isArray(data) || data.length === 0) {
        throw Object.assign(new Error("feed viewer context returned no row"), {
          code: "FEED_VIEWER_EMPTY",
        });
      }

      return normalizeRecord(data[0] as Record<string, unknown>);
    },
  };
}

export function createPostgresFeedViewerRepository(
  executor: SqlExecutor
): FeedViewerRepository {
  return {
    backend: "postgres",

    async load({ userId, personalized }) {
      const [row] = await executor.query<Record<string, unknown>>(FEED_VIEWER_SQL, [
        userId,
        personalized,
      ]);

      if (!row) {
        throw Object.assign(new Error("feed viewer context returned no row"), {
          code: "FEED_VIEWER_EMPTY",
        });
      }

      return normalizeRecord(row);
    },
  };
}

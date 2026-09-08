import "server-only";

/**
 * The notification inbox's reads, as PostgreSQL.
 *
 * Two operations, and they have to agree with each other exactly: the list the
 * inbox shows, and the number on the bell. A filter applied to one and not the
 * other is the bug this module's predecessor was written to fix, where the
 * badge counted notifications the inbox would not display.
 *
 * Same production database, not Neon. What changes is the transport.
 *
 * ## The policy
 *
 * `notifications` is `USING (auth.uid() = user_id)`, so the whole table is
 * private per member. Both queries already filter `user_id = <viewer>`, which
 * satisfies it: the direct read sees the same rows because the WHERE clause is
 * the same restriction the policy expressed. What does need carrying is the
 * `profiles` rule on the actor embed, where a suspended member's name would
 * otherwise appear.
 *
 * ## Muting is a parameter, not a fragment
 *
 * PostgREST rendered the mute list as `type=not.in.(like,follow)`, built by
 * joining the values with commas. The comment there notes that notification
 * types are `[a-z0-9_]+` so nothing needs escaping, which is true and is also
 * exactly the argument that stopped being true for search. Here the list is a
 * bound parameter and the question does not arise.
 *
 * ## Writes stay where they are
 *
 * Marking read and dismissing still go through the existing write path. This
 * is a read migration.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { visibleProfileJoin } from "@/lib/db/profileVisibility";

import type { SqlExecutor } from "@/lib/db/postgres/executor";

// ── Shapes ───────────────────────────────────────────────────────────

export interface NotificationActor {
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
}

export interface NotificationRow {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  actor_id: string | null;
  post_id: string | null;
  message: string | null;
  link: string | null;
  dismissed_at: string | null;
  actor: NotificationActor | NotificationActor[] | null;
  post:
    | { title: string; slug: string; type: string; content_kind: string | null }
    | Array<{
        title: string;
        slug: string;
        type: string;
        content_kind: string | null;
      }>
    | null;
}

export interface NotificationsRepository {
  /** The inbox, newest first, dismissed rows excluded. */
  list(
    userId: string,
    limit: number,
    mutedTypes: readonly string[]
  ): Promise<NotificationRow[]>;
  /**
   * The unread badge.
   *
   * A count rather than the length of a page: the bell used to derive its
   * badge from the ten rows it had, so someone with forty unread items saw
   * "3". Must apply the same filters as `list`, or the badge counts things the
   * inbox will not show.
   */
  unreadCount(userId: string, mutedTypes: readonly string[]): Promise<number>;
  readonly backend: "supabase" | "postgres";
}

// ── SQL ──────────────────────────────────────────────────────────────

/**
 * `$3` is the muted-type list as JSON text, or null for "mute nothing".
 *
 * Null rather than an empty array, because an empty `in` list is the one that
 * quietly matches everything and would mute the entire inbox.
 */
const MUTE_PREDICATE = `
    and (
      $3::text is null
      or n.type not in (select jsonb_array_elements_text($3::text::jsonb))
    )`;

const LIST_SQL = `
  select
    n.id, n.type, n.read, n.created_at, n.actor_id, n.post_id,
    n.message, n.link, n.dismissed_at,
    case when actor.id is null then null else jsonb_build_object(
      'full_name', actor.full_name,
      'username', actor.username,
      'avatar_url', actor.avatar_url
    ) end as actor,
    case when p.id is null then null else jsonb_build_object(
      'title', p.title,
      'slug', p.slug,
      'type', p.type,
      'content_kind', p.content_kind
    ) end as post
  from public.notifications n
  ${visibleProfileJoin("actor", "n.actor_id", "$1")}
  left join public.posts p on p.id = n.post_id
  where n.user_id = $1::uuid
    -- Dismissed notifications are soft-deleted, so they have to be filtered
    -- rather than being gone.
    and n.dismissed_at is null${MUTE_PREDICATE}
  order by n.created_at desc
  limit $2::int
`;

const UNREAD_COUNT_SQL = `
  select count(*) as total
  from public.notifications n
  where n.user_id = $1::uuid
    and n.read = false
    and n.dismissed_at is null${MUTE_PREDICATE.split("$3").join("$2")}
`;

// ── Shared ───────────────────────────────────────────────────────────

const NOTIFICATIONS_SELECT = `
  id, type, read, created_at, actor_id, post_id, message, link, dismissed_at,
  actor:profiles!notifications_actor_id_fkey(full_name, username, avatar_url),
  post:posts!notifications_post_id_fkey(title, slug, type, content_kind)
`;

/**
 * PostgREST renders this as `type=not.in.(like,follow)`. Notification types are
 * `[a-z0-9_]+` throughout the catalog, so no value here needs quoting.
 */
function applyMutedTypes<T extends { not: (...args: unknown[]) => T }>(
  query: T,
  mutedTypes: readonly string[]
): T {
  if (mutedTypes.length === 0) return query;
  return query.not("type", "in", `(${mutedTypes.join(",")})`);
}

// ── Supabase ─────────────────────────────────────────────────────────

export function createSupabaseNotificationsRepository(
  supabase: SupabaseClient
): NotificationsRepository {
  return {
    backend: "supabase",

    async list(userId, limit, mutedTypes) {
      let query = supabase
        .from("notifications")
        .select(NOTIFICATIONS_SELECT)
        .eq("user_id", userId)
        .is("dismissed_at", null);

      query = applyMutedTypes(query as never, mutedTypes);

      const { data, error } = await query
        .order("created_at", { ascending: false })
        .limit(limit);

      if (error) throw new Error(`notifications failed: ${error.message}`);
      return (data ?? []) as unknown as NotificationRow[];
    },

    async unreadCount(userId, mutedTypes) {
      let query = supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("read", false)
        .is("dismissed_at", null);

      query = applyMutedTypes(query as never, mutedTypes);

      const { count, error } = await query;
      if (error) throw new Error(`unread count failed: ${error.message}`);
      return count ?? 0;
    },
  };
}

// ── PostgreSQL ───────────────────────────────────────────────────────

function mutedParam(mutedTypes: readonly string[]): string | null {
  return mutedTypes.length === 0 ? null : JSON.stringify([...mutedTypes]);
}

export function createPostgresNotificationsRepository(
  executor: SqlExecutor
): NotificationsRepository {
  return {
    backend: "postgres",

    async list(userId, limit, mutedTypes) {
      return executor.query<NotificationRow>(LIST_SQL, [
        userId,
        limit,
        mutedParam(mutedTypes),
      ]);
    },

    async unreadCount(userId, mutedTypes) {
      const [row] = await executor.query<{ total: string | number }>(
        UNREAD_COUNT_SQL,
        [userId, mutedParam(mutedTypes)]
      );
      // count(*) is a bigint, which arrives as a string.
      return row ? Number(row.total) : 0;
    },
  };
}

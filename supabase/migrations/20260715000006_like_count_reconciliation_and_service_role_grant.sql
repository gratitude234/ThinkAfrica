-- 20260715000004 already ran without an explicit lock on `likes` for its duration,
-- so a like/unlike landing between its backfill step and its trigger-function
-- redefinition could have left a post_like_counts row one off from reality. Rather
-- than editing an already-applied migration, self-heal by recomputing every post's
-- count directly from the authoritative `likes` table -- safe and idempotent to run
-- regardless of whether any drift actually occurred.
--
-- SHARE MODE blocks concurrent writers (INSERT/DELETE need ROW EXCLUSIVE, which
-- conflicts with SHARE) while still permitting reads, and since increment/decrement_
-- post_like_count only ever fire from a `likes` INSERT/DELETE, blocking writes to
-- `likes` for this transaction's duration also blocks any concurrent mutation of
-- post_like_counts -- there is no other write path to it. Explicit BEGIN/COMMIT
-- makes this atomic regardless of whether the migration runner already wraps the
-- file in a transaction (a nested BEGIN inside an open transaction is a harmless
-- no-op warning in Postgres, not an error).
BEGIN;

LOCK TABLE public.likes IN SHARE MODE;

WITH authoritative_counts AS (
  SELECT p.id AS post_id, COALESCE(l.cnt, 0) AS like_count
  FROM public.posts p
  LEFT JOIN (
    SELECT post_id, count(*) AS cnt FROM public.likes GROUP BY post_id
  ) l ON l.post_id = p.id
)
INSERT INTO public.post_like_counts (post_id, like_count)
SELECT post_id, like_count FROM authoritative_counts
ON CONFLICT (post_id) DO UPDATE SET like_count = excluded.like_count;

-- 20260715000004 revoked ALL on post_like_counts from PUBLIC/anon/authenticated and
-- granted SELECT back only to anon/authenticated, relying on service_role's default
-- privileges for the cached-feed admin client (lib/feedData.ts) to keep working.
-- Grant it explicitly instead of depending on Supabase project-level defaults.
GRANT SELECT ON public.post_like_counts TO service_role;

COMMIT;

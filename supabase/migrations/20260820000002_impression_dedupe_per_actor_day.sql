-- Feed accuracy: count "this person saw it" the same way we count
-- "this person read it".
--
-- The ranker judges a post by a rate: of the people who were shown this card,
-- how many opened it, read it, saved it. The two halves of that fraction were
-- counted under different rules.
--
--   impressions  unique per (post, actor, SURFACE, day)   -- 20260521000002
--   views/reads  unique per (post, actor, day)
--
-- So one reader who met a post on their home feed, again on Latest, and again
-- in Explore on the same day produced three impressions and, if they opened it,
-- one view. The post scored 1/3 for what was really 1/1. The penalty lands
-- hardest on posts that surface in several places at once, which are usually
-- the strongest ones: the ranker was marking work down for being well
-- distributed.
--
-- Impressions now dedupe per actor per day, matching views and reads. Existing
-- rows are collapsed first, then the counter on posts is rebuilt from the event
-- log, which has been the complete record of impressions since the counter was
-- introduced and is never pruned.
--
-- Direction of the correction: impression counts can only fall. Impressions
-- appear only in denominators (lib/feedRanking.ts) and in the exploration term,
-- so this restores rank to posts that were being punished for breadth. Nothing
-- gains rank from exposure it did not earn.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- Collapse existing cross-surface duplicates, keeping the first impression of
-- the day. `ctid` breaks ties for rows sharing a created_at to the microsecond,
-- so exactly one row survives per group whatever the data looks like.
WITH ranked_impressions AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        post_id,
        COALESCE('user:' || user_id::text, 'anon:' || anonymous_id),
        event_date
      ORDER BY created_at, ctid
    ) AS occurrence
  FROM public.post_engagement_events
  WHERE event_type = 'impression'
)
DELETE FROM public.post_engagement_events AS events
USING ranked_impressions
WHERE events.id = ranked_impressions.id
  AND ranked_impressions.occurrence > 1;

DROP INDEX IF EXISTS public.post_engagement_impression_daily_actor_surface_idx;

CREATE UNIQUE INDEX IF NOT EXISTS post_engagement_impression_daily_actor_idx
  ON public.post_engagement_events(
    post_id,
    COALESCE('user:' || user_id::text, 'anon:' || anonymous_id),
    event_date
  )
  WHERE event_type = 'impression';

-- Rebuild the counter from the surviving events. Posts with no impressions at
-- all are included so a stale non-zero counter cannot outlive its rows.
UPDATE public.posts AS p
SET impression_count = COALESCE(counted.total, 0)
FROM (
  SELECT
    p_inner.id AS post_id,
    count(events.id) AS total
  FROM public.posts AS p_inner
  LEFT JOIN public.post_engagement_events AS events
    ON events.post_id = p_inner.id
   AND events.event_type = 'impression'
  GROUP BY p_inner.id
) AS counted
WHERE p.id = counted.post_id
  AND p.impression_count IS DISTINCT FROM COALESCE(counted.total, 0);

-- `surface` is still recorded on every event and is still worth querying by
-- when asking where a post is being discovered. It just no longer participates
-- in uniqueness, so it needs an ordinary index of its own.
CREATE INDEX IF NOT EXISTS post_engagement_events_surface_created_idx
  ON public.post_engagement_events(surface, created_at DESC)
  WHERE surface IS NOT NULL;

COMMIT;

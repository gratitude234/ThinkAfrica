BEGIN;

-- Engagement counters are operational metrics, not editorial edits. The
-- original generic trigger touched updated_at for every UPDATE, so recording
-- an impression/read/view changed the visible "last edited" timestamp.
--
-- Preserve the incoming counter values, temporarily normalize only those
-- fields plus updated_at to OLD, then compare the native posts row. This keeps
-- the contract forward-compatible with future columns and avoids converting
-- long-form content (and every other column) to JSONB on the engagement hot
-- path. posts.like_count is intentionally absent: it was moved to the
-- dedicated post_like_counts table in 20260715000004.
CREATE OR REPLACE FUNCTION public.touch_posts_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_view_count integer := NEW.view_count;
  v_impression_count integer := NEW.impression_count;
  v_read_count integer := NEW.read_count;
BEGIN
  NEW.view_count := OLD.view_count;
  NEW.impression_count := OLD.impression_count;
  NEW.read_count := OLD.read_count;
  NEW.updated_at := OLD.updated_at;

  IF NEW IS DISTINCT FROM OLD THEN
    NEW.updated_at := now();
  END IF;

  NEW.view_count := v_view_count;
  NEW.impression_count := v_impression_count;
  NEW.read_count := v_read_count;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.touch_posts_updated_at() IS
  'Touches posts.updated_at only when a non-engagement field changes; compares native rows without JSON serialization.';

COMMIT;

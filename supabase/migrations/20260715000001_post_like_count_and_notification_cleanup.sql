-- Add a trigger-maintained like_count on posts, add likes.created_at,
-- and drop the leftover phase2 notification triggers that duplicate the
-- in-app notifications already created by the like/comment/follow server actions.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS like_count integer NOT NULL DEFAULT 0;

UPDATE public.posts p
SET like_count = (SELECT count(*) FROM public.likes l WHERE l.post_id = p.id);

-- No historical timestamp exists for likes created before this migration;
-- existing rows backfill to the migration run time rather than their true like time.
ALTER TABLE public.likes ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF to_regprocedure('public.increment_post_like_count()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.increment_post_like_count()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      BEGIN
        UPDATE public.posts SET like_count = like_count + 1 WHERE id = new.post_id;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.decrement_post_like_count()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.decrement_post_like_count()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      BEGIN
        UPDATE public.posts SET like_count = GREATEST(like_count - 1, 0) WHERE id = old.post_id;
        RETURN old;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_like_insert_count ON public.likes;
CREATE TRIGGER on_like_insert_count
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.increment_post_like_count();

DROP TRIGGER IF EXISTS on_like_delete_count ON public.likes;
CREATE TRIGGER on_like_delete_count
  AFTER DELETE ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.decrement_post_like_count();

-- These phase2 triggers (20260402000000_phase2_schema.sql) still fire an in-app
-- notification on every like/comment/follow insert, duplicating the notification
-- already created by likeActions.ts / commentActions.ts / followActions.ts.
-- Their phase5 counterparts (on_like_insert, on_comment_insert, on_follow_insert)
-- were already dropped by 20260523000001 and 20260520000003 respectively.
DROP TRIGGER IF EXISTS on_post_liked ON public.likes;
DROP TRIGGER IF EXISTS on_post_commented ON public.comments;
DROP TRIGGER IF EXISTS on_new_follower ON public.follows;

DROP FUNCTION IF EXISTS public.notify_post_liked();
DROP FUNCTION IF EXISTS public.notify_post_commented();
DROP FUNCTION IF EXISTS public.notify_new_follower();

-- Orphaned phase5 functions left behind when their triggers were dropped earlier.
DROP FUNCTION IF EXISTS public.notify_on_like();
DROP FUNCTION IF EXISTS public.notify_on_comment();
DROP FUNCTION IF EXISTS public.notify_on_follow();

-- award_points_on_like() (20260402000000_phase2_schema.sql) awards 2 points to a
-- post's author on every like insert but has no delete-side counterpart, letting a
-- user farm points via repeated like/unlike/like cycles. Mirror the award symmetrically.

DO $$
BEGIN
  IF to_regprocedure('public.reverse_points_on_unlike()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.reverse_points_on_unlike()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_post_author uuid;
      BEGIN
        SELECT author_id INTO v_post_author FROM public.posts WHERE id = old.post_id;

        IF v_post_author IS NOT NULL AND v_post_author <> old.user_id THEN
          UPDATE public.profiles
          SET points = GREATEST(points - 2, 0)
          WHERE id = v_post_author;
        END IF;
        RETURN old;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_like_delete_points ON public.likes;
CREATE TRIGGER on_like_delete_points
  AFTER DELETE ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.reverse_points_on_unlike();

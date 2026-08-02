-- Score a Response as a response, not as an original post.
--
-- award_points_on_publish() awards by `type` alone, so an Article that answers
-- another post has been earning the same 20 points as an Article that started
-- something. RESPONSE_POINTS in lib/utils.ts is the display-side counterpart of
-- this rule -- change both together or stored and shown points will disagree.
--
-- Only affects posts published from here on: the trigger fires on the
-- draft -> published transition, so nothing recomputes history.
--
-- Note this trigger is AFTER UPDATE only, so a lightweight Post inserted
-- directly as published (the Quick response path in create/post/actions.ts)
-- never reached it and still doesn't. That gap predates this migration and is
-- left alone deliberately -- closing it would start awarding points to short
-- posts that have never earned any, which is a product decision, not a bug fix.
CREATE OR REPLACE FUNCTION public.award_points_on_publish()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_points int;
BEGIN
  IF old.status <> 'published' AND new.status = 'published' THEN
    IF new.in_response_to IS NOT NULL THEN
      v_points := 3;
    ELSE
      v_points := CASE new.type
        WHEN 'blog' THEN 10
        WHEN 'essay' THEN 20
        WHEN 'research' THEN 50
        WHEN 'policy_brief' THEN 30
        ELSE 10
      END;
    END IF;

    UPDATE public.profiles
    SET points = points + v_points
    WHERE id = new.author_id;
  END IF;
  RETURN new;
END;
$$;

-- Function to flip is_alumni and award badge for graduated users
CREATE OR REPLACE FUNCTION public.promote_alumni()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_year integer := extract(year from now())::integer;
  alumni_badge_id uuid := '00000000-0000-0000-0000-000000000010';
BEGIN
  -- Update is_alumni flag for users whose graduation year has passed
  UPDATE public.profiles
  SET is_alumni = true
  WHERE graduation_year IS NOT NULL
    AND graduation_year < current_year
    AND is_alumni = false;

  -- Award Alumni badge to newly promoted alumni who don't have it yet
  INSERT INTO public.user_badges (user_id, badge_id, awarded_at)
  SELECT p.id, alumni_badge_id, now()
  FROM public.profiles p
  WHERE p.is_alumni = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_badges ub
      WHERE ub.user_id = p.id AND ub.badge_id = alumni_badge_id
    );
END;
$$;

-- Schedule via pg_cron (enable pg_cron extension in Supabase dashboard first)
-- SELECT cron.schedule('promote-alumni', '0 1 * * *', 'SELECT public.promote_alumni()');
-- Leave as a comment — the developer enables cron manually in Supabase dashboard

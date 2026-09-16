-- Stop the gamification triggers and the publication capture trigger.
--
-- The publishing reset, Phase 2H, removed points, contribution tiers, badges
-- and the leaderboard from the application, and removed author subscriptions
-- with the publication delivery they fed. Seven triggers still did that work
-- in the database. A read-only inspection of production on 2026-09-15 found
-- exactly these, and no other trigger in any schema calling their functions:
--
--   public.likes         on_like_points                         award_points_on_like
--                        (+2 to the post author on every like)
--   public.likes         on_like_delete_points                  reverse_points_on_unlike
--                        (-2 on every unlike)
--   public.posts         on_post_published_points               award_points_on_publish
--                        (10, 30 or 50 on first publication; 3 for a legacy Response)
--   public.posts         on_post_published_badges               check_and_award_badges
--                        (First Post, Researcher and Policy Maker badges)
--   public.profiles      on_points_updated                      check_points_badges
--                        (Rising Star and Thought Leader badges)
--   public.post_reviews  on_review_submitted_points             award_points_on_review_submission
--                        (+5 to a reviewer)
--   public.posts         posts_capture_first_publication_event  capture_first_publication_event
--                        (one publication_events row per first publication, for delivery)
--
-- None of them inserts a notification. No comment trigger awards points.
--
-- ## What this file does
--
-- It drops those seven triggers and nothing else. The Response 3-point branch
-- in award_points_on_publish() goes with its trigger; nothing else calls it.
--
-- It does not change a row. profiles.points keeps every historic total,
-- user_badges keeps every badge anyone earned, badges keeps its definitions,
-- and publication_events keeps its rows. It drops no function, table or
-- column: the seven functions stay defined, and nothing calls them. Dropping
-- those, and the tables and columns only they wrote, is the database cleanup
-- phase's job.
--
-- Likes, unlikes, comments, replies, publishing and review submission keep
-- working exactly as before, minus the side effect. The like count triggers
-- (on_like_insert_count, on_like_delete_count) and every other trigger on
-- these four tables are untouched.
--
-- ## Order
--
-- Safe on either side of the application deploy: the application no longer
-- reads points, tiers or badges, and a deployment still running the old
-- application only shows totals that stop moving. The deployment order puts it
-- after the three scheduler removals and before the deploy:
--   node scripts/migration/apply-retired-trigger-stop.mjs --dry-run
--   node scripts/migration/apply-retired-trigger-stop.mjs --apply
--
-- ## Guards
--
-- Step 0 refuses to drop a trigger with one of these names that runs some
-- other function, because that would be a trigger this file was not written
-- for. Step 2 refuses to finish while any trigger, under any name, still runs
-- one of the seven functions, so a copy nobody inventoried cannot survive
-- silently.

begin;

-- 0. Refuse a trigger of the same name that runs something else.
do $$
declare
  v_trigger record;
begin
  for v_trigger in
    select expected.table_name, expected.trigger_name, expected.function_name, p.proname as actual_function
      from (values
        ('likes', 'on_like_points', 'award_points_on_like'),
        ('likes', 'on_like_delete_points', 'reverse_points_on_unlike'),
        ('posts', 'on_post_published_points', 'award_points_on_publish'),
        ('posts', 'on_post_published_badges', 'check_and_award_badges'),
        ('profiles', 'on_points_updated', 'check_points_badges'),
        ('post_reviews', 'on_review_submitted_points', 'award_points_on_review_submission'),
        ('posts', 'posts_capture_first_publication_event', 'capture_first_publication_event')
      ) as expected(table_name, trigger_name, function_name)
      join pg_catalog.pg_namespace as n on n.nspname = 'public'
      join pg_catalog.pg_class as c on c.relnamespace = n.oid and c.relname = expected.table_name
      join pg_catalog.pg_trigger as t on t.tgrelid = c.oid and t.tgname = expected.trigger_name and not t.tgisinternal
      join pg_catalog.pg_proc as p on p.oid = t.tgfoid
     where p.proname <> expected.function_name
  loop
    raise exception
      'public.%.% runs %, not %. 20260915000004 was not written for that trigger.',
      v_trigger.table_name, v_trigger.trigger_name, v_trigger.actual_function, v_trigger.function_name;
  end loop;
end;
$$;

-- 1. Drop the seven triggers. Their functions stay defined.
drop trigger if exists on_like_points on public.likes;
drop trigger if exists on_like_delete_points on public.likes;
drop trigger if exists on_post_published_points on public.posts;
drop trigger if exists on_post_published_badges on public.posts;
drop trigger if exists on_points_updated on public.profiles;
drop trigger if exists on_review_submitted_points on public.post_reviews;
drop trigger if exists posts_capture_first_publication_event on public.posts;

-- 2. Refuse to finish while anything still runs one of the seven functions.
do $$
declare
  v_remaining text;
begin
  select pg_catalog.string_agg(tn.nspname || '.' || c.relname || '.' || t.tgname, ', ')
    into v_remaining
    from pg_catalog.pg_trigger as t
    join pg_catalog.pg_class as c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace as tn on tn.oid = c.relnamespace
    join pg_catalog.pg_proc as p on p.oid = t.tgfoid
    join pg_catalog.pg_namespace as pn on pn.oid = p.pronamespace
   where not t.tgisinternal
     and pn.nspname = 'public'
     and p.proname in (
       'award_points_on_like',
       'reverse_points_on_unlike',
       'award_points_on_publish',
       'check_and_award_badges',
       'check_points_badges',
       'award_points_on_review_submission',
       'capture_first_publication_event'
     );

  if v_remaining is not null then
    raise exception
      'Triggers still run a retired gamification or publication capture function: %', v_remaining;
  end if;
end;
$$;

commit;

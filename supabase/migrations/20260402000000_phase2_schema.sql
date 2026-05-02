-- ThinkAfrica phase 2 baseline: debates, notifications, and early gamification.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.debates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  moderator_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'active', 'closed')),
  round_duration_minutes int NOT NULL DEFAULT 5,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.debate_arguments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  debate_id uuid NOT NULL REFERENCES public.debates(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL,
  round_number int NOT NULL DEFAULT 1,
  upvotes int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.debate_votes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  argument_id uuid NOT NULL REFERENCES public.debate_arguments(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, argument_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  link text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS debates_status_idx ON public.debates(status);
CREATE INDEX IF NOT EXISTS debates_created_at_idx ON public.debates(created_at DESC);
CREATE INDEX IF NOT EXISTS debate_arguments_debate_id_idx ON public.debate_arguments(debate_id);
CREATE INDEX IF NOT EXISTS debate_arguments_upvotes_idx ON public.debate_arguments(upvotes DESC);
CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_read_idx ON public.notifications(user_id, read);

ALTER TABLE public.debates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_arguments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debate_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION pg_temp.create_policy_if_missing(
  target_schema text,
  target_table text,
  target_policy text,
  statement text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = target_schema
      AND tablename = target_table
      AND policyname = target_policy
  ) THEN
    EXECUTE statement;
  END IF;
END;
$$;

SELECT pg_temp.create_policy_if_missing('public', 'debates', 'Debates are viewable by everyone',
  $$CREATE POLICY "Debates are viewable by everyone" ON public.debates FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'debates', 'Authenticated users can create debates',
  $$CREATE POLICY "Authenticated users can create debates" ON public.debates FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = moderator_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'debates', 'Moderators can update their debates',
  $$CREATE POLICY "Moderators can update their debates" ON public.debates FOR UPDATE USING (auth.uid() = moderator_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'debate_arguments', 'Debate arguments are viewable by everyone',
  $$CREATE POLICY "Debate arguments are viewable by everyone" ON public.debate_arguments FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'debate_arguments', 'Authenticated users can submit arguments',
  $$CREATE POLICY "Authenticated users can submit arguments" ON public.debate_arguments FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'debate_votes', 'Debate votes are viewable by everyone',
  $$CREATE POLICY "Debate votes are viewable by everyone" ON public.debate_votes FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'debate_votes', 'Authenticated users can vote',
  $$CREATE POLICY "Authenticated users can vote" ON public.debate_votes FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'debate_votes', 'Users can remove their own votes',
  $$CREATE POLICY "Users can remove their own votes" ON public.debate_votes FOR DELETE USING (auth.uid() = user_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'notifications', 'Users can read their own notifications',
  $$CREATE POLICY "Users can read their own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'notifications', 'Users can update their own notifications',
  $$CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'notifications', 'System can insert notifications',
  $$CREATE POLICY "System can insert notifications" ON public.notifications FOR INSERT WITH CHECK (true)$$);

DO $$
BEGIN
  IF to_regprocedure('public.toggle_debate_vote(uuid)') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.toggle_debate_vote(p_argument_id uuid)
      RETURNS json
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_user_id uuid := auth.uid();
        v_voted boolean;
      BEGIN
        IF v_user_id IS NULL THEN
          RETURN json_build_object('error', 'Not authenticated');
        END IF;

        SELECT exists(
          SELECT 1 FROM public.debate_votes
          WHERE user_id = v_user_id AND argument_id = p_argument_id
        ) INTO v_voted;

        IF v_voted THEN
          DELETE FROM public.debate_votes
          WHERE user_id = v_user_id AND argument_id = p_argument_id;

          UPDATE public.debate_arguments
          SET upvotes = greatest(upvotes - 1, 0)
          WHERE id = p_argument_id;

          RETURN json_build_object('voted', false);
        END IF;

        INSERT INTO public.debate_votes (user_id, argument_id)
        VALUES (v_user_id, p_argument_id);

        UPDATE public.debate_arguments
        SET upvotes = upvotes + 1
        WHERE id = p_argument_id;

        RETURN json_build_object('voted', true);
      END;
      $body$;
    $function$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.notify_post_approved()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_post_approved()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      BEGIN
        IF old.status <> 'published' AND new.status = 'published' THEN
          INSERT INTO public.notifications (user_id, type, message, link)
          VALUES (
            new.author_id,
            'post_approved',
            'Your post "' || new.title || '" has been approved and published!',
            '/post/' || new.slug
          );
        END IF;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_post_approved ON public.posts;
CREATE TRIGGER on_post_approved
  AFTER UPDATE ON public.posts
  FOR EACH ROW EXECUTE PROCEDURE public.notify_post_approved();

DO $$
BEGIN
  IF to_regprocedure('public.notify_post_liked()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_post_liked()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_post public.posts%rowtype;
        v_liker_name text;
      BEGIN
        SELECT * INTO v_post FROM public.posts WHERE id = new.post_id;
        SELECT coalesce(full_name, username) INTO v_liker_name
          FROM public.profiles WHERE id = new.user_id;

        IF v_post.author_id <> new.user_id THEN
          INSERT INTO public.notifications (user_id, type, message, link)
          VALUES (
            v_post.author_id,
            'like',
            v_liker_name || ' liked your post "' || v_post.title || '"',
            '/post/' || v_post.slug
          );
        END IF;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_post_liked ON public.likes;
CREATE TRIGGER on_post_liked
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.notify_post_liked();

DO $$
BEGIN
  IF to_regprocedure('public.notify_post_commented()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_post_commented()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_post public.posts%rowtype;
        v_commenter_name text;
      BEGIN
        IF new.parent_id IS NULL THEN
          SELECT * INTO v_post FROM public.posts WHERE id = new.post_id;
          SELECT coalesce(full_name, username) INTO v_commenter_name
            FROM public.profiles WHERE id = new.author_id;

          IF v_post.author_id <> new.author_id THEN
            INSERT INTO public.notifications (user_id, type, message, link)
            VALUES (
              v_post.author_id,
              'comment',
              v_commenter_name || ' commented on your post "' || v_post.title || '"',
              '/post/' || v_post.slug
            );
          END IF;
        END IF;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_post_commented ON public.comments;
CREATE TRIGGER on_post_commented
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE PROCEDURE public.notify_post_commented();

DO $$
BEGIN
  IF to_regprocedure('public.notify_new_follower()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_new_follower()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_follower_name text;
        v_follower_username text;
      BEGIN
        SELECT coalesce(full_name, username), username
          INTO v_follower_name, v_follower_username
          FROM public.profiles WHERE id = new.follower_id;

        INSERT INTO public.notifications (user_id, type, message, link)
        VALUES (
          new.following_id,
          'follow',
          v_follower_name || ' started following you',
          '/' || v_follower_username
        );
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_new_follower ON public.follows;
CREATE TRIGGER on_new_follower
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE PROCEDURE public.notify_new_follower();

DO $$
BEGIN
  IF to_regprocedure('public.notify_debate_reply()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_debate_reply()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_debate_title text;
        v_author_name text;
        v_participant record;
      BEGIN
        SELECT title INTO v_debate_title FROM public.debates WHERE id = new.debate_id;
        SELECT coalesce(full_name, username) INTO v_author_name
          FROM public.profiles WHERE id = new.author_id;

        FOR v_participant IN
          SELECT DISTINCT author_id
          FROM public.debate_arguments
          WHERE debate_id = new.debate_id
            AND author_id <> new.author_id
        LOOP
          INSERT INTO public.notifications (user_id, type, message, link)
          VALUES (
            v_participant.author_id,
            'debate_reply',
            v_author_name || ' posted an argument in "' || v_debate_title || '"',
            '/debates/' || new.debate_id
          );
        END LOOP;

        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_debate_argument_inserted ON public.debate_arguments;
CREATE TRIGGER on_debate_argument_inserted
  AFTER INSERT ON public.debate_arguments
  FOR EACH ROW EXECUTE PROCEDURE public.notify_debate_reply();

DO $$
BEGIN
  IF to_regprocedure('public.award_points_on_publish()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.award_points_on_publish()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_points int;
      BEGIN
        IF old.status <> 'published' AND new.status = 'published' THEN
          v_points := CASE new.type
            WHEN 'blog' THEN 10
            WHEN 'essay' THEN 20
            WHEN 'research' THEN 50
            WHEN 'policy_brief' THEN 30
            ELSE 10
          END;

          UPDATE public.profiles
          SET points = points + v_points
          WHERE id = new.author_id;
        END IF;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_post_published_points ON public.posts;
CREATE TRIGGER on_post_published_points
  AFTER UPDATE ON public.posts
  FOR EACH ROW EXECUTE PROCEDURE public.award_points_on_publish();

DO $$
BEGIN
  IF to_regprocedure('public.award_points_on_like()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.award_points_on_like()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_post_author uuid;
      BEGIN
        SELECT author_id INTO v_post_author FROM public.posts WHERE id = new.post_id;

        IF v_post_author IS NOT NULL AND v_post_author <> new.user_id THEN
          UPDATE public.profiles
          SET points = points + 2
          WHERE id = v_post_author;
        END IF;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_like_points ON public.likes;
CREATE TRIGGER on_like_points
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE PROCEDURE public.award_points_on_like();

DO $$
BEGIN
  IF to_regprocedure('public.award_points_on_comment()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.award_points_on_comment()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      BEGIN
        UPDATE public.profiles
        SET points = points + 3
        WHERE id = new.author_id;
        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_comment_points ON public.comments;
CREATE TRIGGER on_comment_points
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE PROCEDURE public.award_points_on_comment();

DO $$
BEGIN
  IF to_regprocedure('public.check_and_award_badges()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.check_and_award_badges()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_post_count int;
        v_badge_id uuid;
      BEGIN
        IF old.status = 'published' OR new.status <> 'published' THEN
          RETURN new;
        END IF;

        SELECT count(*) INTO v_post_count
        FROM public.posts
        WHERE author_id = new.author_id AND status = 'published';

        IF v_post_count = 1 THEN
          SELECT id INTO v_badge_id FROM public.badges WHERE name = 'First Post' LIMIT 1;
          IF v_badge_id IS NOT NULL THEN
            INSERT INTO public.user_badges (user_id, badge_id)
            VALUES (new.author_id, v_badge_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;

        IF new.type = 'research' THEN
          SELECT id INTO v_badge_id FROM public.badges WHERE name = 'Researcher' LIMIT 1;
          IF v_badge_id IS NOT NULL THEN
            INSERT INTO public.user_badges (user_id, badge_id)
            VALUES (new.author_id, v_badge_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;

        IF new.type = 'policy_brief' THEN
          SELECT id INTO v_badge_id FROM public.badges WHERE name = 'Policy Maker' LIMIT 1;
          IF v_badge_id IS NOT NULL THEN
            INSERT INTO public.user_badges (user_id, badge_id)
            VALUES (new.author_id, v_badge_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;

        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_post_published_badges ON public.posts;
CREATE TRIGGER on_post_published_badges
  AFTER UPDATE ON public.posts
  FOR EACH ROW EXECUTE PROCEDURE public.check_and_award_badges();

DO $$
BEGIN
  IF to_regprocedure('public.check_points_badges()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.check_points_badges()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        v_badge_id uuid;
      BEGIN
        IF new.points >= 100 AND old.points < 100 THEN
          SELECT id INTO v_badge_id FROM public.badges WHERE name = 'Rising Star' LIMIT 1;
          IF v_badge_id IS NOT NULL THEN
            INSERT INTO public.user_badges (user_id, badge_id)
            VALUES (new.id, v_badge_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;

        IF new.points >= 500 AND old.points < 500 THEN
          SELECT id INTO v_badge_id FROM public.badges WHERE name = 'Thought Leader' LIMIT 1;
          IF v_badge_id IS NOT NULL THEN
            INSERT INTO public.user_badges (user_id, badge_id)
            VALUES (new.id, v_badge_id)
            ON CONFLICT DO NOTHING;
          END IF;
        END IF;

        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_points_updated ON public.profiles;
CREATE TRIGGER on_points_updated
  AFTER UPDATE OF points ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.check_points_badges();

INSERT INTO public.badges (name, description, icon)
SELECT 'Debate Champion', 'Won a debate with the most upvotes', 'trophy'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Debate Champion');
INSERT INTO public.badges (name, description, icon)
SELECT 'Rising Star', 'Reached 100 points', 'star'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Rising Star');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'debate_arguments'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.debate_arguments;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = 'notifications'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
    END IF;
  END IF;
END $$;

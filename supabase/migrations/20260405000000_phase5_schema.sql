-- ThinkAfrica phase 5 baseline: cover images, bookmarks, notification triggers.

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_image_url text;

CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON public.bookmarks(user_id);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

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

SELECT pg_temp.create_policy_if_missing('public', 'bookmarks', 'Users manage own bookmarks',
  $$CREATE POLICY "Users manage own bookmarks" ON public.bookmarks FOR ALL USING (auth.uid() = user_id)$$);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('like', 'comment', 'follow', 'debate_reply', 'post_published', 'post_rejected')),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS notifications_user_unread_idx ON public.notifications(user_id, read) WHERE read = false;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

SELECT pg_temp.create_policy_if_missing('public', 'notifications', 'Users see own notifications',
  $$CREATE POLICY "Users see own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id)$$);

DO $$
BEGIN
  IF to_regprocedure('public.notify_on_like()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_on_like()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        author_id uuid;
      BEGIN
        SELECT p.author_id INTO author_id FROM public.posts p WHERE p.id = NEW.post_id;
        IF author_id IS NOT NULL AND author_id <> NEW.user_id THEN
          INSERT INTO public.notifications (user_id, type, actor_id, post_id)
          VALUES (author_id, 'like', NEW.user_id, NEW.post_id)
          ON CONFLICT DO NOTHING;
        END IF;
        RETURN NEW;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_like_insert ON public.likes;
CREATE TRIGGER on_like_insert
  AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_like();

DO $$
BEGIN
  IF to_regprocedure('public.notify_on_follow()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_on_follow()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      BEGIN
        INSERT INTO public.notifications (user_id, type, actor_id)
        VALUES (NEW.following_id, 'follow', NEW.follower_id)
        ON CONFLICT DO NOTHING;
        RETURN NEW;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_follow_insert ON public.follows;
CREATE TRIGGER on_follow_insert
  AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_follow();

DO $$
BEGIN
  IF to_regprocedure('public.notify_on_comment()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.notify_on_comment()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $body$
      DECLARE
        author_id uuid;
      BEGIN
        SELECT p.author_id INTO author_id FROM public.posts p WHERE p.id = NEW.post_id;
        IF author_id IS NOT NULL AND author_id <> NEW.author_id THEN
          INSERT INTO public.notifications (user_id, type, actor_id, post_id, comment_id)
          VALUES (author_id, 'comment', NEW.author_id, NEW.post_id, NEW.id);
        END IF;
        RETURN NEW;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_comment_insert ON public.comments;
CREATE TRIGGER on_comment_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_comment();

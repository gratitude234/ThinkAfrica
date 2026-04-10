-- Phase 5 schema additions for ThinkAfrica

-- =========================================
-- SYSTEM 5: Cover Image on Posts
-- =========================================
ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS cover_image_url text;

-- =========================================
-- SYSTEM 8: Bookmarks
-- =========================================
CREATE TABLE IF NOT EXISTS public.bookmarks (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, post_id)
);

CREATE INDEX IF NOT EXISTS bookmarks_user_id_idx ON public.bookmarks(user_id);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bookmarks" ON public.bookmarks
  FOR ALL USING (auth.uid() = user_id);

-- =========================================
-- SYSTEM 9: Notifications
-- =========================================
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
CREATE POLICY "Users see own notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id);

-- =========================================
-- SYSTEM 9: Notification Triggers
-- =========================================

-- Trigger: create notification when a post is liked
CREATE OR REPLACE FUNCTION notify_on_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE author_id uuid;
BEGIN
  SELECT p.author_id INTO author_id FROM public.posts p WHERE p.id = NEW.post_id;
  IF author_id IS NOT NULL AND author_id != NEW.user_id THEN
    INSERT INTO public.notifications (user_id, type, actor_id, post_id)
    VALUES (author_id, 'like', NEW.user_id, NEW.post_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_like_insert ON public.likes;
CREATE TRIGGER on_like_insert AFTER INSERT ON public.likes
  FOR EACH ROW EXECUTE FUNCTION notify_on_like();

-- Trigger: create notification when someone follows a user
CREATE OR REPLACE FUNCTION notify_on_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, actor_id)
  VALUES (NEW.following_id, 'follow', NEW.follower_id)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_follow_insert ON public.follows;
CREATE TRIGGER on_follow_insert AFTER INSERT ON public.follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_follow();

-- Trigger: create notification when a comment is posted
CREATE OR REPLACE FUNCTION notify_on_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE author_id uuid;
BEGIN
  SELECT p.author_id INTO author_id FROM public.posts p WHERE p.id = NEW.post_id;
  IF author_id IS NOT NULL AND author_id != NEW.author_id THEN
    INSERT INTO public.notifications (user_id, type, actor_id, post_id, comment_id)
    VALUES (author_id, 'comment', NEW.author_id, NEW.post_id, NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_comment_insert ON public.comments;
CREATE TRIGGER on_comment_insert AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_comment();

-- ThinkAfrica baseline schema. Kept idempotent so migrations can become the
-- source of truth without clobbering policies/functions on an existing DB.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE,
  full_name text,
  university text,
  field_of_study text,
  bio text,
  avatar_url text,
  points integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text UNIQUE NOT NULL,
  content text,
  excerpt text,
  type text NOT NULL CHECK (type IN ('blog', 'essay', 'research', 'policy_brief')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending', 'published', 'rejected')),
  tags text[] DEFAULT '{}',
  pdf_url text,
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.comments(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.likes (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE IF NOT EXISTS public.follows (
  follower_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

CREATE TABLE IF NOT EXISTS public.badges (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  description text,
  icon text
);

CREATE TABLE IF NOT EXISTS public.user_badges (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_id uuid NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  awarded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, badge_id)
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'student';

CREATE INDEX IF NOT EXISTS posts_author_id_idx ON public.posts(author_id);
CREATE INDEX IF NOT EXISTS posts_status_idx ON public.posts(status);
CREATE INDEX IF NOT EXISTS posts_slug_idx ON public.posts(slug);
CREATE INDEX IF NOT EXISTS comments_post_id_idx ON public.comments(post_id);
CREATE INDEX IF NOT EXISTS likes_post_id_idx ON public.likes(post_id);

DO $$
BEGIN
  IF to_regprocedure('public.handle_new_user()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.handle_new_user()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER SET search_path = public
      AS $body$
      DECLARE
        base_username text;
        final_username text;
        counter integer := 0;
      BEGIN
        base_username := lower(split_part(new.email, '@', 1));
        base_username := regexp_replace(base_username, '[^a-z0-9_]', '', 'g');
        final_username := base_username;

        WHILE exists (SELECT 1 FROM public.profiles WHERE username = final_username) LOOP
          counter := counter + 1;
          final_username := base_username || counter::text;
        END LOOP;

        INSERT INTO public.profiles (id, username, full_name, university)
        VALUES (
          new.id,
          final_username,
          coalesce(new.raw_user_meta_data->>'full_name', ''),
          coalesce(new.raw_user_meta_data->>'university', '')
        )
        ON CONFLICT (id) DO NOTHING;

        RETURN new;
      END;
      $body$;
    $function$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DO $$
BEGIN
  IF to_regprocedure('public.increment_view_count(text)') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.increment_view_count(post_slug text)
      RETURNS void
      LANGUAGE sql
      SECURITY DEFINER
      AS $body$
        UPDATE public.posts
        SET view_count = view_count + 1
        WHERE slug = post_slug;
      $body$;
    $function$;
  END IF;
END $$;

DO $$
BEGIN
  IF to_regprocedure('public.is_admin()') IS NULL THEN
    EXECUTE $function$
      CREATE FUNCTION public.is_admin()
      RETURNS boolean
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = public
      AS $body$
        SELECT EXISTS (
          SELECT 1
          FROM public.profiles
          WHERE id = auth.uid()
            AND role = 'admin'
        );
      $body$;
    $function$;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

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
    SELECT 1
    FROM pg_policies
    WHERE schemaname = target_schema
      AND tablename = target_table
      AND policyname = target_policy
  ) THEN
    EXECUTE statement;
  END IF;
END;
$$;

SELECT pg_temp.create_policy_if_missing('public', 'profiles', 'Public profiles are viewable by everyone',
  $$CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'profiles', 'Users can insert their own profile',
  $$CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'profiles', 'Users can update their own profile',
  $$CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'posts', 'Published posts are viewable by everyone',
  $$CREATE POLICY "Published posts are viewable by everyone" ON public.posts FOR SELECT USING (status = 'published' OR auth.uid() = author_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'posts', 'Authenticated users can insert posts',
  $$CREATE POLICY "Authenticated users can insert posts" ON public.posts FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'posts', 'Authors can update their own posts',
  $$CREATE POLICY "Authors can update their own posts" ON public.posts FOR UPDATE USING (auth.uid() = author_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'posts', 'Authors can delete their own posts',
  $$CREATE POLICY "Authors can delete their own posts" ON public.posts FOR DELETE USING (auth.uid() = author_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'comments', 'Comments on published posts are viewable by everyone',
  $$CREATE POLICY "Comments on published posts are viewable by everyone" ON public.comments FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'comments', 'Authenticated users can insert comments',
  $$CREATE POLICY "Authenticated users can insert comments" ON public.comments FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'comments', 'Authors can update their own comments',
  $$CREATE POLICY "Authors can update their own comments" ON public.comments FOR UPDATE USING (auth.uid() = author_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'comments', 'Authors can delete their own comments',
  $$CREATE POLICY "Authors can delete their own comments" ON public.comments FOR DELETE USING (auth.uid() = author_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'likes', 'Likes are viewable by everyone',
  $$CREATE POLICY "Likes are viewable by everyone" ON public.likes FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'likes', 'Authenticated users can like posts',
  $$CREATE POLICY "Authenticated users can like posts" ON public.likes FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'likes', 'Users can remove their own likes',
  $$CREATE POLICY "Users can remove their own likes" ON public.likes FOR DELETE USING (auth.uid() = user_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'follows', 'Follows are viewable by everyone',
  $$CREATE POLICY "Follows are viewable by everyone" ON public.follows FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'follows', 'Authenticated users can follow',
  $$CREATE POLICY "Authenticated users can follow" ON public.follows FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = follower_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'follows', 'Users can unfollow',
  $$CREATE POLICY "Users can unfollow" ON public.follows FOR DELETE USING (auth.uid() = follower_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'badges', 'Badges are viewable by everyone',
  $$CREATE POLICY "Badges are viewable by everyone" ON public.badges FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'user_badges', 'User badges are viewable by everyone',
  $$CREATE POLICY "User badges are viewable by everyone" ON public.user_badges FOR SELECT USING (true)$$);

INSERT INTO public.badges (name, description, icon)
SELECT 'First Post', 'Published your first piece', 'pen'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'First Post');
INSERT INTO public.badges (name, description, icon)
SELECT 'Researcher', 'Published a research paper', 'microscope'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Researcher');
INSERT INTO public.badges (name, description, icon)
SELECT 'Policy Maker', 'Published a policy brief', 'clipboard'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Policy Maker');
INSERT INTO public.badges (name, description, icon)
SELECT 'Essayist', 'Published an essay', 'note'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Essayist');
INSERT INTO public.badges (name, description, icon)
SELECT 'Thought Leader', 'Received 50+ likes', 'bulb'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Thought Leader');
INSERT INTO public.badges (name, description, icon)
SELECT 'Community Builder', 'Gained 10+ followers', 'globe'
WHERE NOT EXISTS (SELECT 1 FROM public.badges WHERE name = 'Community Builder');

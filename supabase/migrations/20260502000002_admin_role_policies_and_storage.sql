-- Repair admin authorization so RLS depends on profiles.role instead of an
-- app-specific current_setting, and provision public storage buckets safely.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

DROP POLICY IF EXISTS "Admins can update ambassador status" ON public.campus_ambassadors;
CREATE POLICY "Admins can update ambassador status"
  ON public.campus_ambassadors FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can feature policy briefs" ON public.policy_briefs_featured;
DROP POLICY IF EXISTS "Admins can manage featured policy briefs" ON public.policy_briefs_featured;
CREATE POLICY "Admins can manage featured policy briefs"
  ON public.policy_briefs_featured FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can insert fellowships" ON public.fellowships;
DROP POLICY IF EXISTS "Admins can update fellowships" ON public.fellowships;
DROP POLICY IF EXISTS "Admins can manage fellowships" ON public.fellowships;
CREATE POLICY "Admins can manage fellowships"
  ON public.fellowships FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can read all applications" ON public.fellowship_applications;
DROP POLICY IF EXISTS "Admins can update application status" ON public.fellowship_applications;
DROP POLICY IF EXISTS "Admins can manage fellowship applications" ON public.fellowship_applications;
CREATE POLICY "Admins can manage fellowship applications"
  ON public.fellowship_applications FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage partners" ON public.institutional_partners;
CREATE POLICY "Admins can manage partners"
  ON public.institutional_partners FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can manage sponsor placements" ON public.sponsor_placements;
CREATE POLICY "Admins can manage sponsor placements"
  ON public.sponsor_placements FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins can read contact requests" ON public.contact_requests;
CREATE POLICY "Admins can read contact requests"
  ON public.contact_requests FOR SELECT
  USING (public.is_admin());

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('post-images', 'post-images', true),
  ('avatars', 'avatars', true),
  ('audio-summaries', 'audio-summaries', true)
ON CONFLICT (id) DO UPDATE
SET public = excluded.public;

DROP POLICY IF EXISTS "Public read for ThinkAfrica media" ON storage.objects;
CREATE POLICY "Public read for ThinkAfrica media"
  ON storage.objects FOR SELECT
  USING (bucket_id IN ('post-images', 'avatars', 'audio-summaries'));

DROP POLICY IF EXISTS "Users upload own post images" ON storage.objects;
CREATE POLICY "Users upload own post images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN ('posts', 'covers')
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own post images" ON storage.objects;
CREATE POLICY "Users update own post images"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN ('posts', 'covers')
    AND (storage.foldername(name))[2] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN ('posts', 'covers')
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own post images" ON storage.objects;
CREATE POLICY "Users delete own post images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'post-images'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] IN ('posts', 'covers')
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users upload own avatars" ON storage.objects;
CREATE POLICY "Users upload own avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own avatars" ON storage.objects;
CREATE POLICY "Users update own avatars"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own avatars" ON storage.objects;
CREATE POLICY "Users delete own avatars"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

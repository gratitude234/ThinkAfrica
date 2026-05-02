-- ThinkAfrica phase 4 baseline: opportunity, talent, partner, sponsor tables.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.fellowships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  sponsor_name text,
  sponsor_logo_url text,
  amount text,
  eligibility text,
  deadline timestamptz,
  application_url text,
  opportunity_type text NOT NULL DEFAULT 'fellowship' CHECK (opportunity_type IN ('internship', 'research', 'fellowship', 'job')),
  skills text[] DEFAULT '{}',
  location text,
  featured boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fellowship_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fellowship_id uuid NOT NULL REFERENCES public.fellowships(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cover_letter text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'shortlisted', 'accepted', 'rejected')),
  applied_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fellowship_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.institutional_partners (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text CHECK (type IN ('university', 'ngo', 'government', 'thinktank', 'media')),
  country text,
  logo_url text,
  description text,
  website_url text,
  partnership_since timestamptz NOT NULL DEFAULT now(),
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS public.talent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  open_to_opportunities boolean NOT NULL DEFAULT false,
  opportunity_types text[] DEFAULT '{}',
  cv_url text,
  linkedin_url text,
  skills text[] DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'partners_only', 'private')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.talent_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_id uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  sender_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  organization_name text,
  contact_email text,
  opportunity_type text CHECK (opportunity_type IN ('internship', 'research', 'fellowship', 'job')),
  role_title text,
  message text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sponsor_placements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sponsor_name text NOT NULL,
  placement_type text NOT NULL CHECK (placement_type IN ('fellowship', 'webinar', 'leaderboard', 'policy_hub')),
  content text,
  link_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  organization text NOT NULL,
  email text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS verified_type text CHECK (verified_type IN ('student', 'researcher', 'faculty', 'institution'));

CREATE INDEX IF NOT EXISTS fellowships_status_idx ON public.fellowships(status);
CREATE INDEX IF NOT EXISTS fellowships_deadline_idx ON public.fellowships(deadline ASC);
CREATE INDEX IF NOT EXISTS fellowships_status_type_deadline_idx ON public.fellowships(status, opportunity_type, deadline ASC);
CREATE INDEX IF NOT EXISTS fellowships_featured_idx ON public.fellowships(featured, status) WHERE featured = true;
CREATE INDEX IF NOT EXISTS fellowships_skills_gin_idx ON public.fellowships USING gin(skills);
CREATE INDEX IF NOT EXISTS fellowship_applications_fellowship_id_idx ON public.fellowship_applications(fellowship_id);
CREATE INDEX IF NOT EXISTS fellowship_applications_user_id_idx ON public.fellowship_applications(user_id);
CREATE INDEX IF NOT EXISTS institutional_partners_active_idx ON public.institutional_partners(active);
CREATE INDEX IF NOT EXISTS talent_profiles_visibility_idx ON public.talent_profiles(visibility);
CREATE INDEX IF NOT EXISTS talent_inquiries_talent_status_created_idx ON public.talent_inquiries(talent_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS talent_inquiries_sender_idx ON public.talent_inquiries(sender_id, created_at DESC) WHERE sender_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS sponsor_placements_type_active_idx ON public.sponsor_placements(placement_type, active);

ALTER TABLE public.fellowships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fellowship_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.institutional_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.talent_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sponsor_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_requests ENABLE ROW LEVEL SECURITY;

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

SELECT pg_temp.create_policy_if_missing('public', 'fellowships', 'Fellowships are viewable by everyone',
  $$CREATE POLICY "Fellowships are viewable by everyone" ON public.fellowships FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'fellowships', 'Admins can insert fellowships',
  $$CREATE POLICY "Admins can insert fellowships" ON public.fellowships FOR INSERT WITH CHECK (public.is_admin())$$);
SELECT pg_temp.create_policy_if_missing('public', 'fellowships', 'Admins can update fellowships',
  $$CREATE POLICY "Admins can update fellowships" ON public.fellowships FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin())$$);

SELECT pg_temp.create_policy_if_missing('public', 'fellowship_applications', 'Users can read their own applications',
  $$CREATE POLICY "Users can read their own applications" ON public.fellowship_applications FOR SELECT USING (auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'fellowship_applications', 'Admins can read all applications',
  $$CREATE POLICY "Admins can read all applications" ON public.fellowship_applications FOR SELECT USING (public.is_admin())$$);
SELECT pg_temp.create_policy_if_missing('public', 'fellowship_applications', 'Authenticated users can apply',
  $$CREATE POLICY "Authenticated users can apply" ON public.fellowship_applications FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'fellowship_applications', 'Admins can update application status',
  $$CREATE POLICY "Admins can update application status" ON public.fellowship_applications FOR UPDATE USING (public.is_admin()) WITH CHECK (public.is_admin())$$);

SELECT pg_temp.create_policy_if_missing('public', 'institutional_partners', 'Partners are viewable by everyone',
  $$CREATE POLICY "Partners are viewable by everyone" ON public.institutional_partners FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'institutional_partners', 'Admins can manage partners',
  $$CREATE POLICY "Admins can manage partners" ON public.institutional_partners FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())$$);

SELECT pg_temp.create_policy_if_missing('public', 'talent_profiles', 'Public talent profiles visible to all',
  $$CREATE POLICY "Public talent profiles visible to all" ON public.talent_profiles FOR SELECT USING (visibility = 'public' OR auth.uid() = user_id)$$);
SELECT pg_temp.create_policy_if_missing('public', 'talent_profiles', 'partners_only visible to authenticated',
  $$CREATE POLICY "partners_only visible to authenticated" ON public.talent_profiles FOR SELECT USING (visibility = 'partners_only' AND auth.role() = 'authenticated')$$);
SELECT pg_temp.create_policy_if_missing('public', 'talent_profiles', 'Users can manage their own talent profile',
  $$CREATE POLICY "Users can manage their own talent profile" ON public.talent_profiles FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id)$$);

SELECT pg_temp.create_policy_if_missing('public', 'talent_inquiries', 'Anyone authenticated can send inquiries',
  $$CREATE POLICY "Anyone authenticated can send inquiries" ON public.talent_inquiries FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND (sender_id IS NULL OR sender_id = auth.uid()))$$);
SELECT pg_temp.create_policy_if_missing('public', 'talent_inquiries', 'Talent can read their own inquiries',
  $$CREATE POLICY "Talent can read their own inquiries" ON public.talent_inquiries FOR SELECT USING (EXISTS (SELECT 1 FROM public.talent_profiles WHERE id = talent_id AND user_id = auth.uid()))$$);
SELECT pg_temp.create_policy_if_missing('public', 'talent_inquiries', 'Talent can update their own inquiries',
  $$CREATE POLICY "Talent can update their own inquiries" ON public.talent_inquiries FOR UPDATE USING (EXISTS (SELECT 1 FROM public.talent_profiles WHERE id = talent_id AND user_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.talent_profiles WHERE id = talent_id AND user_id = auth.uid()))$$);

SELECT pg_temp.create_policy_if_missing('public', 'sponsor_placements', 'Sponsor placements viewable by everyone',
  $$CREATE POLICY "Sponsor placements viewable by everyone" ON public.sponsor_placements FOR SELECT USING (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'sponsor_placements', 'Admins can manage sponsor placements',
  $$CREATE POLICY "Admins can manage sponsor placements" ON public.sponsor_placements FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin())$$);

SELECT pg_temp.create_policy_if_missing('public', 'contact_requests', 'Anyone can submit contact requests',
  $$CREATE POLICY "Anyone can submit contact requests" ON public.contact_requests FOR INSERT WITH CHECK (true)$$);
SELECT pg_temp.create_policy_if_missing('public', 'contact_requests', 'Admins can read contact requests',
  $$CREATE POLICY "Admins can read contact requests" ON public.contact_requests FOR SELECT USING (public.is_admin())$$);

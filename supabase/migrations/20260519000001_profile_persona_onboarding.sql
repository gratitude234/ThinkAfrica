ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS profile_type text,
  ADD COLUMN IF NOT EXISTS secondary_profile_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS organization_name text,
  ADD COLUMN IF NOT EXISTS professional_title text,
  ADD COLUMN IF NOT EXISTS organization_website text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_profile_type_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_profile_type_check
  CHECK (
    profile_type IS NULL OR profile_type IN (
      'student',
      'researcher',
      'educator',
      'ngo_nonprofit',
      'founder',
      'policy_government',
      'journalist_media',
      'professional',
      'other'
    )
  );

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_secondary_profile_types_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_secondary_profile_types_check
  CHECK (
    secondary_profile_types <@ ARRAY[
      'student',
      'researcher',
      'educator',
      'ngo_nonprofit',
      'founder',
      'policy_government',
      'journalist_media',
      'professional',
      'other'
    ]::text[]
    AND cardinality(secondary_profile_types) <= 3
    AND (
      profile_type IS NULL
      OR profile_type <> ALL(secondary_profile_types)
    )
  );

CREATE INDEX IF NOT EXISTS profiles_profile_type_idx
  ON public.profiles(profile_type);

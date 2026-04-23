-- Add graduation year and alumni flag to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS graduation_year integer,
  ADD COLUMN IF NOT EXISTS is_alumni boolean NOT NULL DEFAULT false;

-- Index for alumni queries
CREATE INDEX IF NOT EXISTS profiles_is_alumni_idx ON public.profiles(is_alumni) WHERE is_alumni = true;

-- Seed the Alumni badge (idempotent)
INSERT INTO public.badges (id, name, description, icon)
VALUES (
  '00000000-0000-0000-0000-000000000010',
  'Alumni',
  'Graduated scholar. Part of the ThinkAfrica network for life.',
  '🎓'
) ON CONFLICT (id) DO NOTHING;

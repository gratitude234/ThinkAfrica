ALTER TABLE public.debate_arguments
  ADD COLUMN IF NOT EXISTS stance text
  CHECK (stance IN ('for', 'against'));

COMMENT ON COLUMN public.debate_arguments.stance IS
  'Explicit stance chosen by the author. NULL for legacy rows.';

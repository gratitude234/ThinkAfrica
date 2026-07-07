-- Rebrand: Alumni badge description still references "ThinkAfrica".
-- This is seed DATA already applied to the live database (see
-- 20260423000001_alumni_mode.sql), not source code, so it is not touched by
-- the code-level rebrand. Review this migration and run it manually against
-- the database when ready — it is not applied automatically.
UPDATE public.badges
SET description = 'Graduated scholar. Part of the Indegenius network for life.'
WHERE id = '00000000-0000-0000-0000-000000000010'
  AND description = 'Graduated scholar. Part of the ThinkAfrica network for life.';

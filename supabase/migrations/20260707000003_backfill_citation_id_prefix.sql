-- Rebrand: backfill the 2 existing citation IDs from the 'TAK-' prefix
-- (ThinkAfrica) to 'IND-' (Indegenius), preserving the same year and
-- sequence number — only the prefix changes.
--
-- Confirmed via `SELECT id, type, citation_id, title FROM posts WHERE
-- citation_id IS NOT NULL` on 2026-07-07: exactly 2 rows, TAK-2026-0001
-- (research) and TAK-2026-0002 (policy_brief), neither cited externally.
--
-- Review and run this manually — it is not applied automatically.
UPDATE public.posts
SET citation_id = 'IND-2026-0001'
WHERE id = 'c891e295-5f8f-4d6e-885f-70b899707c4e'
  AND citation_id = 'TAK-2026-0001';

UPDATE public.posts
SET citation_id = 'IND-2026-0002'
WHERE id = 'e713d224-c720-4ddd-ac54-c9caebebcc5d'
  AND citation_id = 'TAK-2026-0002';

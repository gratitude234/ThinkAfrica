-- Research document setup checklist:
-- 1. Apply this migration before enabling /submit/research in production.
-- 2. Confirm the research-documents bucket remains private.
-- 3. Research PDFs are served through signed URLs from the app, not public storage URLs.

INSERT INTO storage.buckets (id, name, public)
VALUES ('research-documents', 'research-documents', false)
ON CONFLICT (id) DO UPDATE
SET public = false;

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_original_name text,
  ADD COLUMN IF NOT EXISTS document_mime_type text,
  ADD COLUMN IF NOT EXISTS document_size_bytes integer;

ALTER TABLE public.post_versions
  ADD COLUMN IF NOT EXISTS document_path text,
  ADD COLUMN IF NOT EXISTS document_original_name text,
  ADD COLUMN IF NOT EXISTS document_mime_type text,
  ADD COLUMN IF NOT EXISTS document_size_bytes integer;

CREATE INDEX IF NOT EXISTS posts_research_document_idx
  ON public.posts(type, status)
  WHERE type = 'research' AND document_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS post_versions_document_idx
  ON public.post_versions(post_id, version_kind)
  WHERE document_path IS NOT NULL;

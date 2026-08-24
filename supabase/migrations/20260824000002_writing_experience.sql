-- Writing experience: private draft share links and draft revision history.
--
-- Both tables belong to an unpublished draft and are owned by its author.
-- Neither participates in the editorial workflow: post_versions still owns
-- reviewed submissions, and nothing here is ever part of a citation record.

-- ---------------------------------------------------------------------------
-- Draft share links
-- ---------------------------------------------------------------------------
-- A writer sends a draft to a colleague before publishing. The reader needs no
-- account, so the token is the only credential and is therefore generated
-- server-side from a CSPRNG, never derived from the post id.

CREATE TABLE IF NOT EXISTS public.post_draft_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL UNIQUE REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

COMMENT ON TABLE public.post_draft_shares IS
  'Unlisted read-only links to an unpublished draft. One row per post; revoking sets revoked_at rather than deleting, so a reused token can never resurrect an old link.';

COMMENT ON COLUMN public.post_draft_shares.token IS
  'URL-safe secret. Generated with crypto.randomBytes server-side. Anyone holding it can read the draft while revoked_at is null.';

CREATE INDEX IF NOT EXISTS post_draft_shares_author_idx
  ON public.post_draft_shares (author_id);

ALTER TABLE public.post_draft_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors manage their own draft shares" ON public.post_draft_shares;
CREATE POLICY "Authors manage their own draft shares"
ON public.post_draft_shares
FOR ALL
TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_draft_shares TO authenticated;

-- No anon grant. The public /draft/[token] route reads through the service
-- role and enforces "share is active and the post is still a draft" itself,
-- so an anon client can never enumerate this table.

-- ---------------------------------------------------------------------------
-- Draft revision history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.post_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  excerpt text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  word_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.post_revisions IS
  'Periodic snapshots of a draft as it is written, so a writer can recover paragraphs they cut. Written by record_post_revision(), which throttles and prunes.';

CREATE INDEX IF NOT EXISTS post_revisions_post_created_idx
  ON public.post_revisions (post_id, created_at DESC);

ALTER TABLE public.post_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authors read their own revisions" ON public.post_revisions;
CREATE POLICY "Authors read their own revisions"
ON public.post_revisions
FOR SELECT
TO authenticated
USING (author_id = auth.uid());

-- Inserts go exclusively through record_post_revision() so the throttle and
-- the retention cap cannot be bypassed by a direct client write.
GRANT SELECT ON public.post_revisions TO authenticated;

-- Number of snapshots kept per draft. Old ones are pruned on each write.
CREATE OR REPLACE FUNCTION public.post_revision_retention()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 40 $$;

/**
 * Records one snapshot of a draft, subject to a throttle.
 *
 * Autosave fires every couple of seconds, which would be thousands of rows an
 * hour. A snapshot is only kept when the newest one is older than
 * p_min_interval AND the content actually changed, which turns a writing
 * session into a readable list of restore points rather than a firehose.
 */
CREATE OR REPLACE FUNCTION public.record_post_revision(
  target_post_id uuid,
  p_title text,
  p_excerpt text,
  p_content text,
  p_word_count integer,
  p_min_interval interval DEFAULT '3 minutes'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  post_row public.posts%ROWTYPE;
  latest public.post_revisions%ROWTYPE;
  new_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO post_row
  FROM public.posts
  WHERE id = target_post_id AND author_id = auth.uid();

  -- Snapshots exist for work in progress. Once a post is published or in
  -- review its history belongs to post_versions instead.
  IF post_row.id IS NULL OR post_row.status <> 'draft' THEN
    RETURN NULL;
  END IF;

  SELECT * INTO latest
  FROM public.post_revisions
  WHERE post_id = target_post_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF latest.id IS NOT NULL THEN
    IF latest.content IS NOT DISTINCT FROM p_content THEN
      RETURN NULL;
    END IF;
    IF latest.created_at > now() - p_min_interval THEN
      RETURN NULL;
    END IF;
  END IF;

  INSERT INTO public.post_revisions (post_id, author_id, title, excerpt, content, word_count)
  VALUES (
    target_post_id,
    auth.uid(),
    NULLIF(trim(both from coalesce(p_title, '')), ''),
    coalesce(p_excerpt, ''),
    coalesce(p_content, ''),
    greatest(coalesce(p_word_count, 0), 0)
  )
  RETURNING id INTO new_id;

  DELETE FROM public.post_revisions
  WHERE post_id = target_post_id
    AND id NOT IN (
      SELECT id
      FROM public.post_revisions
      WHERE post_id = target_post_id
      ORDER BY created_at DESC
      LIMIT public.post_revision_retention()
    );

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_post_revision(uuid, text, text, text, integer, interval) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_post_revision(uuid, text, text, text, integer, interval) TO authenticated;

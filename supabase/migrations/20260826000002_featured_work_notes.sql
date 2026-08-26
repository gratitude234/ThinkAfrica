BEGIN;

-- Featured Work explanations.
--
-- A reader arriving at a profile sees three titles and no reason why those
-- three. The author knows: one is their most complete treatment of a subject,
-- one is the piece that changed how they think, one is the one people keep
-- citing back at them. This gives them somewhere to say so.
--
-- DEPLOYMENT STATUS
-- -----------------
-- Source-controlled only. Creating this file does not prove it has run.
-- Preflight:
--   1. Confirm 20260824000002_intellectual_profile_v2.sql is applied and
--      replace_my_featured_posts(uuid[]) exists.
--   2. Confirm profile_featured_posts has no conflicting feature_note column.
--   3. In staging exercise: saving three selections with notes, reordering
--      with notes attached, clearing a note, exceeding 180 characters
--      (rejected), and a non-eligible post id (rejected, selection unchanged).
--
-- Rollback policy matches the profile-security migrations: ship a forward
-- migration rather than editing this one.

ALTER TABLE public.profile_featured_posts
  ADD COLUMN IF NOT EXISTS feature_note text;

-- 180 characters, mirrored by FEATURE_NOTE_MAX_LENGTH in lib/featuredWork.ts.
-- A blank note is stored as NULL so "absent" has exactly one representation:
-- the public card renders on presence, and an empty string would render an
-- empty caption slot under the title.
ALTER TABLE public.profile_featured_posts
  DROP CONSTRAINT IF EXISTS profile_featured_posts_feature_note_length;
ALTER TABLE public.profile_featured_posts
  ADD CONSTRAINT profile_featured_posts_feature_note_length
  CHECK (
    feature_note IS NULL
    OR (
      char_length(feature_note) <= 180
      AND btrim(feature_note) <> ''
    )
  );

COMMENT ON COLUMN public.profile_featured_posts.feature_note IS
  'Optional author explanation of why this work is featured. Plain text, at most 180 characters, NULL when absent. Public.';

-- ==========================================================================
-- Versioned replacement RPC
-- ==========================================================================

-- v2 rather than a signature change to the existing function: a deployed
-- client calling replace_my_featured_posts(uuid[]) keeps working through the
-- rollout, and neither version can half-apply because both replace the whole
-- selection in one statement pair.
--
-- Notes travel positionally alongside the ids. A shorter notes array is
-- padded with NULL, so a caller that has no notes at all can pass NULL and
-- get exactly the v1 behaviour.
CREATE OR REPLACE FUNCTION public.replace_my_featured_posts_v2(
  p_post_ids uuid[],
  p_feature_notes text[] DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_user_id uuid := (SELECT auth.uid());
  v_post_ids uuid[] := COALESCE(p_post_ids, ARRAY[]::uuid[]);
  v_notes text[] := COALESCE(p_feature_notes, ARRAY[]::text[]);
  v_selected_count integer := cardinality(COALESCE(p_post_ids, ARRAY[]::uuid[]));
  v_distinct_count integer;
  v_eligible_count integer;
  v_note text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'You must be signed in to manage featured work.';
  END IF;

  IF v_selected_count > 3 THEN
    RAISE EXCEPTION 'You can feature up to three publications.';
  END IF;

  IF cardinality(v_notes) > v_selected_count THEN
    RAISE EXCEPTION 'Featured work notes do not match the selection.';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(v_post_ids) AS selected(id) WHERE id IS NULL) THEN
    RAISE EXCEPTION 'Featured work contains an invalid publication.';
  END IF;

  SELECT count(DISTINCT selected.id)
  INTO v_distinct_count
  FROM unnest(v_post_ids) AS selected(id);

  IF v_distinct_count <> v_selected_count THEN
    RAISE EXCEPTION 'Choose each featured publication only once.';
  END IF;

  -- Checked here as well as by the column constraint so the caller gets the
  -- product's sentence rather than a constraint name.
  FOREACH v_note IN ARRAY v_notes LOOP
    IF v_note IS NOT NULL AND char_length(btrim(v_note)) > 180 THEN
      RAISE EXCEPTION 'Keep each featured work note to 180 characters or fewer.';
    END IF;
  END LOOP;

  -- Same eligibility rule as v1: published, and authored or accepted
  -- co-authored by the caller.
  SELECT count(*)
  INTO v_eligible_count
  FROM public.posts AS post
  WHERE post.id = ANY(v_post_ids)
    AND post.status = 'published'
    AND (
      post.author_id = v_user_id
      OR EXISTS (
        SELECT 1
        FROM public.post_authors AS author
        WHERE author.post_id = post.id
          AND author.user_id = v_user_id
          AND author.accepted_at IS NOT NULL
      )
    );

  IF v_eligible_count <> v_selected_count THEN
    RAISE EXCEPTION 'Featured work must be published and belong to you as an author or accepted co-author.';
  END IF;

  DELETE FROM public.profile_featured_posts
  WHERE user_id = v_user_id;

  INSERT INTO public.profile_featured_posts (user_id, post_id, position, feature_note)
  SELECT
    v_user_id,
    selected.post_id,
    selected.position::integer,
    NULLIF(btrim(COALESCE(v_notes[selected.position], '')), '')
  FROM unnest(v_post_ids) WITH ORDINALITY AS selected(post_id, position);
END;
$$;

REVOKE ALL ON FUNCTION public.replace_my_featured_posts_v2(uuid[], text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_my_featured_posts_v2(uuid[], text[])
  TO authenticated;

COMMENT ON FUNCTION public.replace_my_featured_posts_v2(uuid[], text[]) IS
  'Atomically replaces the caller''s Featured Work selection, order, and optional notes. Same eligibility and duplicate rules as replace_my_featured_posts(uuid[]), which remains for deployed clients.';

-- The insert policy predates this column and does not name columns, so it
-- still applies unchanged. Stated rather than re-created: the column-level
-- write boundary for this table is the RPC, and the table's existing
-- owner-scoped policies already bound it.

COMMIT;

-- Post-apply verification (staging first): confirm the column and its CHECK in
-- information_schema/pg_constraint, that both replace_my_featured_posts
-- overloads exist in pg_proc, and that EXECUTE on the v2 signature is granted
-- to authenticated only.

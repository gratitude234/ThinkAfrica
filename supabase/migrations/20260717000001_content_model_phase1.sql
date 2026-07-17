-- Phase 1 of the Post/Article/Research content-model migration (see
-- docs/content-model.md). This is the "expand" step of an expand-and-
-- contract migration: it adds nullable, additive columns so posts can
-- carry the new classification (content_kind/article_format) alongside
-- the existing `type` column, without changing any existing behaviour.
--
-- `type` keeps its NOT NULL constraint and its existing check constraint
-- untouched. No rows are deleted or rewritten destructively. This
-- migration is safe to apply before the application code that dual-writes
-- the new columns ships (see the sync trigger below).

ALTER TABLE public.posts
  ADD COLUMN IF NOT EXISTS content_kind text,
  ADD COLUMN IF NOT EXISTS article_format text;

-- Backfill existing rows from the legacy `type` mapping:
--   blog          -> content_kind 'post'
--   essay         -> content_kind 'article', article_format 'essay'
--   policy_brief  -> content_kind 'article', article_format 'policy_brief'
--   research      -> content_kind 'research'
UPDATE public.posts
SET
  content_kind = CASE type
    WHEN 'blog' THEN 'post'
    WHEN 'essay' THEN 'article'
    WHEN 'policy_brief' THEN 'article'
    WHEN 'research' THEN 'research'
    ELSE NULL
  END,
  article_format = CASE type
    WHEN 'essay' THEN 'essay'
    WHEN 'policy_brief' THEN 'policy_brief'
    ELSE NULL
  END
WHERE content_kind IS NULL;

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_content_kind_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_content_kind_check
  CHECK (content_kind IS NULL OR content_kind IN ('post', 'article', 'research'));

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_article_format_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_article_format_check
  CHECK (article_format IS NULL OR article_format IN ('essay', 'policy_brief'));

ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_article_format_requires_article_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_article_format_requires_article_check
  CHECK (article_format IS NULL OR content_kind = 'article');

-- Transition-only consistency guard: during the dual-write period, `type`
-- and `content_kind` must not disagree about what a post fundamentally is
-- (e.g. type='blog' with content_kind='research' would show legacy
-- readers a Blog and migrated readers a Research paper for the same row).
-- This still allows a generic Article -- e.g. type='essay' with
-- content_kind='article' and article_format=NULL -- because 'essay' maps
-- to 'article' either way; it only rejects content_kind values that
-- contradict the legacy type's mapped kind. Like the sync trigger, this
-- is temporary: it should be dropped once `type` is retired in a later
-- contract step, when content_kind is allowed to mean something `type`
-- has no equivalent for (e.g. a titleless Post with no legacy type at
-- all).
--
-- Verified scenarios (traced by hand; see the note above the sync
-- trigger about the lack of a local Postgres harness in this repo):
--   - Every {type, content_kind} pair produced by the legacy mapping
--     (blog/post, essay/article, policy_brief/article, research/research)
--     passes.
--   - An explicit type='blog', content_kind='research' write is rejected.
--   - A generic article (type='essay', content_kind='article',
--     article_format=NULL) passes, since 'essay' maps to 'article'.
--   - All six sync-trigger scenarios documented below still pass: the
--     trigger only ever derives content_kind from `type` using this same
--     mapping, so every value it produces satisfies this constraint by
--     construction.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_legacy_type_content_kind_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_legacy_type_content_kind_check
  CHECK (
    content_kind IS NULL
    OR content_kind = CASE type
      WHEN 'blog' THEN 'post'
      WHEN 'essay' THEN 'article'
      WHEN 'policy_brief' THEN 'article'
      WHEN 'research' THEN 'research'
    END
  );

-- Transition-only sync trigger.
--
-- Purpose: application code is being migrated to dual-write content_kind/
-- article_format alongside `type` (see lib/contentModel.ts and the
-- write/edit/research-submission server actions). Until every write path
-- is confirmed to dual-write -- and for the deploy window where this
-- migration lands before that application code does -- this trigger
-- recomputes content_kind/article_format from `type` for statements that
-- look like a legacy, new-columns-unaware write. Once Phase 2 confirms
-- every write path dual-writes consistently, this trigger should be
-- dropped as part of the "contract" step of the migration.
--
-- Detection is a single all-or-nothing recompute, not two independently
-- gated column updates: the two columns must always stay consistent with
-- each other (article_format may only be non-null when content_kind =
-- 'article'), so partially resyncing one column while leaving the other
-- stale can produce an inconsistent row. Concretely:
--   INSERT: if content_kind is NULL (the caller didn't know about the new
--     columns), derive both content_kind and article_format from `type`.
--     If content_kind was supplied, the caller is new-columns-aware --
--     leave both exactly as given, including an intentional NULL
--     article_format for a generic article.
--   UPDATE: if `type` changed AND neither content_kind's nor
--     article_format's resulting value differs from the row's previous
--     value (both IS NOT DISTINCT FROM OLD -- Postgres can only compare
--     NEW to OLD, it cannot detect whether a column was syntactically
--     referenced in the statement's SET clause), this is a legacy client
--     changing type alone -- recompute both columns fully from the new
--     `type`. Any statement whose resulting content_kind or article_format
--     differs from OLD, or that leaves `type` unchanged, is treated as an
--     explicit, new-columns-aware write and is left untouched.
--
-- Verified scenarios (traced by hand; no local Postgres harness is
-- configured in this repo to execute them -- see CLAUDE.md):
--   1. Legacy insert (content_kind omitted) for each of blog/essay/
--      policy_brief/research -> both columns derived correctly.
--   2. Essay -> Blog via a `type`-only UPDATE (content_kind='article',
--      article_format='essay' before) -> recomputed to
--      content_kind='post', article_format=NULL. (Previously this left
--      article_format='essay' stranded against content_kind='post',
--      violating posts_article_format_requires_article_check.)
--   3. Policy Brief -> Research via a `type`-only UPDATE -> recomputed to
--      content_kind='research', article_format=NULL.
--   4. Blog -> Policy Brief via a `type`-only UPDATE -> recomputed to
--      content_kind='article', article_format='policy_brief'.
--   5. Explicit INSERT of a generic article (content_kind='article',
--      article_format=NULL supplied intentionally) -> left untouched
--      because content_kind was non-null on insert.
--   6. Explicit INSERT of an invalid combination (e.g.
--      content_kind='post', article_format='essay') -> left untouched by
--      this trigger (content_kind was supplied) and then rejected by
--      posts_article_format_requires_article_check, as intended.
CREATE OR REPLACE FUNCTION public.sync_post_content_classification()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  derived_kind text;
  derived_format text;
BEGIN
  derived_kind := CASE NEW.type
    WHEN 'blog' THEN 'post'
    WHEN 'essay' THEN 'article'
    WHEN 'policy_brief' THEN 'article'
    WHEN 'research' THEN 'research'
    ELSE NULL
  END;
  derived_format := CASE NEW.type
    WHEN 'essay' THEN 'essay'
    WHEN 'policy_brief' THEN 'policy_brief'
    ELSE NULL
  END;

  IF TG_OP = 'INSERT' THEN
    IF NEW.content_kind IS NULL THEN
      NEW.content_kind := derived_kind;
      NEW.article_format := derived_format;
    END IF;
  ELSIF TG_OP = 'UPDATE'
    AND NEW.type IS DISTINCT FROM OLD.type
    AND NEW.content_kind IS NOT DISTINCT FROM OLD.content_kind
    AND NEW.article_format IS NOT DISTINCT FROM OLD.article_format
  THEN
    NEW.content_kind := derived_kind;
    NEW.article_format := derived_format;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS posts_sync_content_classification ON public.posts;
CREATE TRIGGER posts_sync_content_classification
BEFORE INSERT OR UPDATE ON public.posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_post_content_classification();

COMMENT ON COLUMN public.posts.content_kind IS
  'Target-model classification (post/article/research). Nullable during the Phase 1 expand step; resolve via lib/contentModel.ts, which falls back to `type` when null. See docs/content-model.md.';
COMMENT ON COLUMN public.posts.article_format IS
  'Optional genre for content_kind = article (essay/policy_brief), preserved from the legacy `type` value. See docs/content-model.md.';

-- Phase 2 of the Post/Article/Research content-model migration (see
-- docs/content-model.md): allows `posts.title` to be null for lightweight
-- Posts, while keeping it required for Article/Research.
--
-- This builds on the Phase 1 migration (20260717000001) and does not
-- touch anything it added: `content_kind`/`article_format` stay nullable,
-- the legacy-consistency constraint and sync trigger are untouched, and
-- `posts.type` keeps its own NOT NULL constraint and check.

ALTER TABLE public.posts
  ALTER COLUMN title DROP NOT NULL;

-- Transitional conditional title requirement.
--
-- Title is only optional for the "post" kind. Everything else (article,
-- research, and -- importantly -- any row whose classification can't be
-- resolved at all) still requires a non-blank title. This mirrors
-- lib/postDisplay.ts's `isLightweightPost` / lib/contentModel.ts's
-- `resolveContentKind`: prefer `content_kind` when it's a valid value,
-- otherwise fall back to mapping the legacy `type` column (blog -> post,
-- essay/policy_brief -> article, research -> research). Unknown/null
-- `type` values (which shouldn't exist given `type`'s own NOT NULL check,
-- but the expression below is defensive) resolve to "not post", so they
-- still require a title rather than silently allowing a blank one.
--
-- This constraint is transitional for the same reason the Phase 1 sync
-- trigger and legacy-consistency check are: once `type` is retired in a
-- later contract step, this can be simplified to key off `content_kind`
-- alone.
ALTER TABLE public.posts
  DROP CONSTRAINT IF EXISTS posts_title_required_unless_post_check;
ALTER TABLE public.posts
  ADD CONSTRAINT posts_title_required_unless_post_check
  CHECK (
    (
      CASE
        WHEN content_kind IN ('post', 'article', 'research') THEN content_kind
        WHEN type = 'blog' THEN 'post'
        WHEN type IN ('essay', 'policy_brief') THEN 'article'
        WHEN type = 'research' THEN 'research'
        ELSE NULL
      END
    ) = 'post'
    -- Explicit "title IS NOT NULL" guard: a bare `trim(title) <> ''`
    -- would evaluate to NULL (not FALSE) when title is NULL, and
    -- Postgres CHECK constraints silently pass on a NULL result -- which
    -- would let a null title slip through for Article/Research. Requiring
    -- IS NOT NULL first forces this branch to evaluate to FALSE instead.
    OR (title IS NOT NULL AND trim(both from title) <> '')
  );

COMMENT ON COLUMN public.posts.title IS
  'Required for Article/Research (and for any row whose content kind cannot be resolved); optional for Post -- see posts_title_required_unless_post_check and lib/postDisplay.ts. See docs/content-model.md.';

-- Removes the superseded public explicit-id identity overloads.
--
-- ===========================================================================
-- DEPLOYMENT STATUS: NOT APPLIED. DESTRUCTIVE BY DESIGN. IDEMPOTENT.
-- ===========================================================================
-- Apply AFTER 20260909000001 and 20260910000001.
--
-- ===========================================================================
-- WHY THIS EXISTS
-- ===========================================================================
-- An earlier draft of 20260909000001 created the parameterised functions as
-- PUBLIC overloads granted to `authenticated`, with a runtime guard refusing a
-- p_user_id that disagreed with auth.uid(). That guard had to exempt callers
-- with no JWT, because a trusted server is the caller the parameter exists
-- for, which made impersonation a question about who can mint a token rather
-- than about who is granted what.
--
-- 20260909000001 has since been rewritten: the implementations live in
-- `private`, which PostgREST does not expose and which grants USAGE to
-- `postgres` alone. Rerunning it creates the private forms but does not remove
-- the public ones, because CREATE OR REPLACE cannot delete a signature it no
-- longer mentions.
--
-- Production does not have the old overloads: the catalogue shows exactly one
-- row per name, the zero-argument form. **The Neon scratch database does.**
-- The earlier draft was applied there during Phase 4, so that database is
-- carrying a live impersonation surface right now, and any environment that
-- ever ran the earlier draft is in the same state.
--
-- So this file is written to be safe on both:
--
--   * On production it is a no-op. Every statement is IF EXISTS.
--   * On Neon and on any environment that ran the earlier draft, it removes
--     the superseded signatures.
--
-- ===========================================================================
-- WHY IT IS SAFE TO DROP THESE
-- ===========================================================================
-- Nothing calls them. `supabase/migrations/parameterizeIdentityRpcsMigration.test.ts`
-- asserts that no application file sends `p_user_id`, and the rollout in
-- docs/rpc-identity-migration.md has not started. These signatures were
-- created by a migration draft and have never had a caller.
--
-- The ZERO-ARGUMENT signatures are untouched. Those are what the application
-- calls, and dropping one would be an outage. Every DROP below names an
-- argument list that begins with uuid, which is the explicit-id form.
--
-- ===========================================================================
-- ORDER
-- ===========================================================================
-- The overloads go first and the guard last: while a public overload still
-- exists it references public.assert_identity_claim, so dropping the guard
-- first would leave a function whose body cannot resolve.

BEGIN;

SET LOCAL lock_timeout = '5s';

-- The six explicit-id overloads from the earlier draft.
DROP FUNCTION IF EXISTS public.toggle_comment_vote(uuid, uuid);
DROP FUNCTION IF EXISTS public.set_notification_preference(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.save_onboarding_topics(uuid, text[]);
DROP FUNCTION IF EXISTS public.save_onboarding_preferences(uuid, text, text);
DROP FUNCTION IF EXISTS public.save_onboarding_path(uuid, text);
DROP FUNCTION IF EXISTS public.get_my_onboarding_state(uuid);

-- The guard it shared. Its replacement is private.assert_identity_claim(uuid),
-- created by 20260909000001.
DROP FUNCTION IF EXISTS public.assert_identity_claim(uuid);

COMMIT;

-- ===========================================================================
-- VERIFICATION
-- ===========================================================================
-- After applying, this must return no rows on every environment:
--
--   SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND (
--       p.proname = 'assert_identity_claim'
--       OR (
--         p.proname IN (
--           'get_my_onboarding_state', 'save_onboarding_path',
--           'save_onboarding_preferences', 'save_onboarding_topics',
--           'set_notification_preference', 'toggle_comment_vote'
--         )
--         AND pg_get_function_identity_arguments(p.oid) LIKE 'uuid%'
--       )
--     );
--
-- And this must still return six rows, the zero-argument wrappers the
-- application calls:
--
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid)
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN (
--       'get_my_onboarding_state', 'save_onboarding_path',
--       'save_onboarding_preferences', 'save_onboarding_topics',
--       'set_notification_preference', 'toggle_comment_vote'
--     )
--     AND pg_get_function_identity_arguments(p.oid) NOT LIKE 'uuid%';
--
-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
-- There is nothing to roll back to that anyone should want. The dropped
-- signatures are the design this migration exists to remove, and no caller
-- has ever used them. If one is somehow needed, recreate it from the git
-- history of 20260909000001 before commit 51120de.

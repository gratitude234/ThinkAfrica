-- Neon preflight: what has to exist before and after the Supabase schema is
-- applied to a SCRATCH database.
--
-- NOT RUN BY ANYTHING. Run it by hand, against a scratch Neon branch, never
-- against anything holding data you care about. Read
-- docs/neon-migration-plan.md §5 first.
--
-- ===========================================================================
-- WHAT PHASE 2 CHANGED IN THIS FILE, AND WHY
-- ===========================================================================
-- Phase 1 wrote this before anyone had run it. Two statements in it were
-- inert, and both would have failed open rather than loudly:
--
--   1. `GRANT ... ON ALL TABLES IN SCHEMA public` ran before the schema was
--      applied, so there were no tables to grant on. The application role
--      would have ended up able to connect and able to read nothing, which
--      looks like a broken query rather than a missing grant.
--   2. `ALTER DEFAULT PRIVILEGES IN SCHEMA public` with no FOR ROLE applies
--      only to objects created by the role that runs the statement. The
--      runbook has the schema applied by indegenius_migrator, so the defaults
--      would have covered nothing it created.
--
-- The file is therefore in two parts. Part A runs before the schema, Part B
-- after it, and Part B is not optional.
--
-- ===========================================================================
-- TWO THINGS THIS ESTABLISHES, AND THE WHOLE AUTHORIZATION STORY RESTS ON BOTH
-- ===========================================================================
--
--   1. auth.uid() has no meaning off Supabase. It returns null rather than
--      failing, which turns every `where id = auth.uid()` guard into a silent
--      no-op. public.app_user_id() replaces it, reading a value the
--      application sets on the connection for one transaction.
--
--   2. The application role must not own the tables. A table owner bypasses
--      RLS whatever the policies say, so migrating 146 policies to a database
--      the application connects to as owner would be migrating decoration.

\echo '=== Part A: run BEFORE applying the schema ==='

-- ---------------------------------------------------------------------------
-- A0. Version and capability check
-- ---------------------------------------------------------------------------
-- Do not assume. The schema uses gen_random_uuid(), jsonb_build_object,
-- advisory locks and GENERATED columns; 14 is the floor and Neon is well past
-- it, but the check costs nothing and a surprise here is cheap to find now.

DO $$
DECLARE
  v_version integer := current_setting('server_version_num')::integer;
BEGIN
  IF v_version < 140000 THEN
    RAISE EXCEPTION 'PostgreSQL % is older than the 14 this schema assumes.', v_version;
  END IF;
  RAISE NOTICE 'PostgreSQL server_version_num = %', v_version;
END
$$;

-- ---------------------------------------------------------------------------
-- A1. Extensions
-- ---------------------------------------------------------------------------
-- pg_cron, pg_net and vault are deliberately absent: Neon does not offer them,
-- and the seven scheduled jobs move to Cloudflare Cron Triggers hitting the
-- same /api/cron/* routes.
--
-- If any of these three raises here, stop: the schema names objects in them,
-- and applying it anyway produces a database that is missing functions nobody
-- notices until a page uses one.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";    -- uuid_generate_v4() in the base schema
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ---------------------------------------------------------------------------
-- A2. Schemas
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS public;
CREATE SCHEMA IF NOT EXISTS private;

-- ---------------------------------------------------------------------------
-- A3. The identity function that replaces auth.uid()
-- ---------------------------------------------------------------------------
-- The application sets this per transaction, immediately after acquiring a
-- connection and before any statement that depends on it:
--
--     select set_config('app.user_id', $1, true);   -- true = transaction-local
--
-- Transaction-local matters, and it matters more under Hyperdrive than under
-- Supabase. A pooled connection is handed to the next request as soon as the
-- transaction ends; a session-scoped setting would give that request the
-- previous member's identity. Anything that depends on this therefore has to
-- run inside an explicit transaction, which is why Phase 2 does NOT adopt this
-- pattern anywhere yet. See docs/neon-migration-plan.md and the RLS section of
-- docs/auth-and-rls-migration.md.

CREATE OR REPLACE FUNCTION public.app_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT nullif(current_setting('app.user_id', true), '')::uuid
$$;

COMMENT ON FUNCTION public.app_user_id() IS
  'The acting user for this transaction. Replaces auth.uid(). Null when the '
  'application did not set it, which every policy and SECURITY DEFINER '
  'function must treat as "nobody" rather than as "skip the check".';

-- ---------------------------------------------------------------------------
-- A4. Roles
-- ---------------------------------------------------------------------------
-- One role for the application, one for migrations. Neither owns the tables:
-- on Neon the owner is the role the branch was created with, and leaving it
-- that way is what keeps RLS in force for both of these.
--
-- Passwords are set out of band, never in a file in the repository:
--     ALTER ROLE indegenius_app WITH PASSWORD '...';
--
-- Note for Neon specifically: a role created here with SQL works but does not
-- appear in the Neon console's role list, which manages its own roles through
-- the API. That is fine for a scratch database and should be revisited before
-- anything permanent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'indegenius_app') THEN
    CREATE ROLE indegenius_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'indegenius_migrator') THEN
    CREATE ROLE indegenius_migrator LOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO indegenius_app, indegenius_migrator;
GRANT CREATE ON SCHEMA public TO indegenius_migrator;

-- `ALTER DEFAULT PRIVILEGES FOR ROLE x` requires membership in x. The role
-- running this file owns the database but is not automatically a member of a
-- role it just created, so PostgreSQL refuses with "permission denied to
-- change default privileges" -- a message that reads like a missing superuser
-- rather than a missing grant. Membership is taken explicitly, and is what
-- also lets a later step SET ROLE to the migrator if that becomes useful.
DO $$
BEGIN
  EXECUTE format('GRANT indegenius_migrator TO %I', current_user);
  EXECUTE format('GRANT indegenius_app TO %I', current_user);
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE
      'Could not take membership of the migrator role. ALTER DEFAULT '
      'PRIVILEGES FOR ROLE will be skipped; Part B''s ALL TABLES grants still '
      'cover every restored object.';
END
$$;

-- Objects the migrator creates from here on are readable and writable by the
-- application without a second grant. FOR ROLE is the part Phase 1 missed:
-- without it this covers only objects created by whoever runs this file.
ALTER DEFAULT PRIVILEGES FOR ROLE indegenius_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO indegenius_app;
ALTER DEFAULT PRIVILEGES FOR ROLE indegenius_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO indegenius_app;
ALTER DEFAULT PRIVILEGES FOR ROLE indegenius_migrator IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO indegenius_app;

-- And for whoever is running this file, which on a Neon scratch branch is the
-- branch owner rather than indegenius_migrator: the schema is restored by the
-- owner, because a role created here has no password and pg_restore needs to
-- authenticate. The security property that matters is unaffected -- the owner
-- is still not indegenius_app, so RLS still applies to the application role.
-- Part B's ALL TABLES grants are what actually covers the restored objects;
-- these defaults cover anything created afterwards.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO indegenius_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO indegenius_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO indegenius_app;

-- `private` is telemetry and scheduler internals. The application has no
-- business in it; that is the whole reason the schema exists.
REVOKE ALL ON SCHEMA private FROM PUBLIC;
REVOKE ALL ON SCHEMA private FROM indegenius_app;

-- A hung statement must not be able to hold a connection open. This is the
-- direct-SQL heir of the 8-second fetch deadline in
-- lib/supabase/fetchTimeout.ts, and it is the lesson from the outages that the
-- migration most needs to carry across. lib/db/postgres/connection.ts asks for
-- the same 8 seconds per connection; this is what holds when a client forgets.
ALTER ROLE indegenius_app SET statement_timeout = '8s';
ALTER ROLE indegenius_app SET idle_in_transaction_session_timeout = '15s';
ALTER ROLE indegenius_migrator SET statement_timeout = '0';
ALTER ROLE indegenius_migrator SET lock_timeout = '5s';

\echo '=== Part A done. Now apply the edited schema AS indegenius_migrator. ==='

-- ===========================================================================
-- Part B: run AFTER the schema is applied
-- ===========================================================================
-- Everything below is commented out so this file can be run end to end in
-- Part A. Uncomment and run it as a second step, once the tables exist.
--
-- The ALL TABLES grants are what Phase 1 got wrong by running them too early.
-- They are still needed even with the default privileges above, because the
-- schema may be applied by a different role than the one named in FOR ROLE
-- (for example by the Neon branch owner during a restore).

-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO indegenius_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO indegenius_app;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO indegenius_app;
-- REVOKE ALL ON ALL TABLES IN SCHEMA private FROM indegenius_app;
-- REVOKE ALL ON ALL FUNCTIONS IN SCHEMA private FROM indegenius_app;

-- ===========================================================================
-- Verification. Run after Part B. Each of these should return zero rows.
-- ===========================================================================

-- 1. Nothing still references the Supabase auth schema.
--    select n.nspname, p.proname
--      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname in ('public','private')
--       and pg_get_functiondef(p.oid) ~* 'auth\.(uid|role|jwt|users)';

-- 2. No policy still calls auth.uid().
--    select tablename, policyname from pg_policies
--     where schemaname in ('public','private')
--       and coalesce(qual,'') || coalesce(with_check,'') ~* 'auth\.uid';

-- 3. The application role owns nothing, so RLS applies to it.
--    select c.relname from pg_class c join pg_roles r on r.oid = c.relowner
--     where r.rolname = 'indegenius_app';

-- 4. Every table in public has RLS on. Compare this list against the same
--    query on Supabase: it must not be longer.
--    select c.relname from pg_class c
--     where c.relnamespace = 'public'::regnamespace
--       and c.relkind = 'r' and not c.relrowsecurity;

-- 5. The application role can actually read. This one should return rows;
--    an empty result means the Part B grants did not run.
--    set role indegenius_app;
--    select count(*) from public.posts;
--    reset role;

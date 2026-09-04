BEGIN;

-- Bulk member addresses for the recipient sync.
--
-- WHY THIS EXISTS
-- ---------------
-- Addresses live in auth.users, which PostgREST does not expose, so the sync
-- previously read them through the GoTrue admin API (auth.admin.listUsers).
-- That API answers 500 "Database error finding users" on this project, and the
-- cause is not the query, the page size, or a hook:
--
--   GoTrue scans each row into a Go struct whose confirmation_token,
--   recovery_token, email_change, email_change_token_new,
--   email_change_token_current, phone_change, phone_change_token and
--   reauthentication_token fields are plain strings rather than nullable ones.
--   A row holding NULL in any of them cannot be deserialised, and one such row
--   fails the whole request. Rows created through the Auth API always write ''
--   into those columns; rows inserted directly with SQL do not.
--
-- Five such rows exist here, seeded by hand, and every listUsers page wide
-- enough to reach them returns 500 while narrower pages succeed. Fetching one
-- of them individually fails the same way, which is what places the fault in
-- row deserialisation rather than anywhere in the sync.
--
-- Reading the two columns we actually want, in SQL, never constructs that
-- struct, so this is immune to the defect whichever column happens to be NULL.
-- It is also one round trip instead of one per thousand members.
--
-- The auth schema stays unexposed to PostgREST. This is a SECURITY DEFINER
-- function in public, executable only by service_role, returning nothing but an
-- id and an address: no tokens, no metadata, no password hashes.

CREATE OR REPLACE FUNCTION public.list_broadcast_contact_emails()
RETURNS TABLE (profile_id uuid, email text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT users.id,
         pg_catalog.lower(pg_catalog.btrim(users.email))
  FROM auth.users AS users
  WHERE users.deleted_at IS NULL
    AND users.email IS NOT NULL
    AND pg_catalog.btrim(users.email) <> ''
  -- Ordered so that paging the result over PostgREST is stable.
  ORDER BY users.id;
$$;

REVOKE ALL ON FUNCTION public.list_broadcast_contact_emails()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_broadcast_contact_emails()
  TO service_role;

COMMENT ON FUNCTION public.list_broadcast_contact_emails() IS
  'Bulk id-to-address read for the broadcast recipient sync. Replaces the GoTrue admin listUsers call, which cannot deserialise auth rows holding NULL token columns.';

NOTIFY pgrst, 'reload schema';

COMMIT;

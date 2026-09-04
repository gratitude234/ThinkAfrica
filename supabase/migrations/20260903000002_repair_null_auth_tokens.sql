BEGIN;

-- Repair auth rows that GoTrue cannot deserialise.
--
-- OPTIONAL, AND IT WRITES TO auth.users. The broadcast sync does not need it:
-- 20260903000001 made the sync read addresses in SQL, so it no longer goes
-- through the API that these rows break. Apply this one because the same rows
-- break everything else that reads a user through GoTrue.
--
-- WHAT IS WRONG
-- -------------
-- GoTrue models these eight columns as non-nullable Go strings. A row holding
-- NULL in any of them cannot be scanned, and one bad row fails the entire
-- request it appears in. Accounts created through the Auth API always get ''
-- here; accounts inserted directly with SQL get NULL unless the insert named
-- every column.
--
-- WHAT IT BREAKS UNTIL FIXED
-- --------------------------
--   - Authentication > Users in the Supabase dashboard, for any page wide
--     enough to include a bad row
--   - admin.listUsers and admin.getUserById
--   - password reset and email change for the affected accounts
--
-- WHY '' IS THE RIGHT VALUE
-- -------------------------
-- Empty string is what GoTrue itself writes for "no token outstanding", and
-- what every row created through the Auth API already holds. This sets no
-- token, grants no access, and changes no credential: it only makes an absent
-- token representable in the way the reader expects. Confirmation and recovery
-- state live in the *_at timestamp columns, which are untouched.
--
-- Idempotent, and narrowed to rows that are already unreadable, so re-running
-- it is a no-op and no healthy row is rewritten.

UPDATE auth.users
SET confirmation_token = coalesce(confirmation_token, ''),
    recovery_token = coalesce(recovery_token, ''),
    email_change = coalesce(email_change, ''),
    email_change_token_new = coalesce(email_change_token_new, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change = coalesce(phone_change, ''),
    phone_change_token = coalesce(phone_change_token, ''),
    reauthentication_token = coalesce(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR reauthentication_token IS NULL;

COMMIT;

-- Verify afterwards. Both should return zero rows:
--
--   select count(*) from auth.users
--   where confirmation_token is null or recovery_token is null
--      or email_change is null or email_change_token_new is null
--      or email_change_token_current is null or phone_change is null
--      or phone_change_token is null or reauthentication_token is null;
--
-- and the admin API should stop failing:
--
--   curl -s -o /dev/null -w '%{http_code}\n' \
--     -H "apikey: $SERVICE_ROLE_KEY" -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
--     "$SUPABASE_URL/auth/v1/admin/users?page=1&per_page=1000"

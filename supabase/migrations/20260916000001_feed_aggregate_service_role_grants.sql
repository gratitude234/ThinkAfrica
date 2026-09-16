-- Keep the public feed's aggregate reads on the cheap counter tables.
--
-- fetchCachedPublicFeedPage() reads through the service-role client. The
-- bookmark/reference aggregate migration granted SELECT only to anon and
-- authenticated, so service_role could be refused and the application would
-- fall back to counting raw rows. During a gateway slowdown that turns one
-- failed lightweight lookup into a second, heavier query and can take the
-- entire feed hydration down.
--
-- post_like_counts already received this grant in 20260715000006. Repeating it
-- here is intentional and idempotent so all three feed aggregates have one
-- explicit privilege contract.

BEGIN;

GRANT SELECT ON public.post_like_counts TO service_role;
GRANT SELECT ON public.post_bookmark_counts TO service_role;
GRANT SELECT ON public.post_reference_counts TO service_role;

COMMIT;

-- Make PostgREST observe the privilege/schema state immediately after the
-- migration. This is safe and does not restart the database.
NOTIFY pgrst, 'reload schema';

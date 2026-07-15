-- The "Authors can update their own posts" RLS policy (base_schema.sql) is row-level
-- only and does not restrict which columns change, so any author could otherwise set
-- like_count to an arbitrary value via a normal client update. like_count must only
-- change through increment_post_like_count()/decrement_post_like_count(), which run
-- SECURITY DEFINER and are unaffected by this column-level revoke.
REVOKE UPDATE (like_count) ON public.posts FROM authenticated;

-- Bring the `comments` table back into service behind a UI.
--
-- The table, its threading (parent_id), its vote RPC, its hidden_at/hidden_by
-- moderation columns and its RLS all survived commit 4956cc6, which removed only
-- the read/write path. This migration fixes what that commit left in an
-- inconsistent state, plus two pre-existing gaps that only matter once users can
-- actually write comments again.

-- 1. Comments must not award points.
--
-- award_points_on_comment() has been silently adding +3 to profiles.points on
-- every comment insert since 20260402000000_phase2_schema.sql, and was never
-- dropped when the comment UI was. Under the restored model a comment is a
-- lightweight reply and a Response is the scored unit, so this has to go before
-- any UI can create comments again. Dropping the trigger is what makes "comments
-- earn nothing" true; leaving it would score replies through the back door.
DROP TRIGGER IF EXISTS on_comment_points ON public.comments;
DROP FUNCTION IF EXISTS public.award_points_on_comment();

-- 2. Indexes for the threaded read.
--
-- The section loads a post's comments ordered by time and groups replies by
-- parent. Neither access path is indexed today: comments_post_id_idx alone
-- forces a sort, and parent_id has no index at all.
CREATE INDEX IF NOT EXISTS comments_post_created_idx
  ON public.comments (post_id, created_at DESC);
CREATE INDEX IF NOT EXISTS comments_parent_id_idx
  ON public.comments (parent_id)
  WHERE parent_id IS NOT NULL;

-- 3. An edit marker.
--
-- There is no way to tell an edited comment from an original one. Showing an
-- edit control without one lets a commenter silently rewrite what people
-- replied to.
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- 4. Close the UPDATE policy.
--
-- "Authors can update their own comments" (20260401000000_base_schema.sql) has
-- USING but no WITH CHECK, so an author could rewrite any column on their own
-- row -- including clearing hidden_at to reverse a moderator's decision, or
-- setting upvotes directly. WITH CHECK stops the row from being handed to
-- someone else; the column-level revoke stops the moderation and vote state
-- from being touched at all. Same technique as
-- 20260715000003_lock_like_count_column.sql.
--
-- toggle_comment_vote() and the moderation actions are unaffected: the RPC is
-- SECURITY DEFINER and moderation runs under the service role.
DROP POLICY IF EXISTS "Authors can update their own comments" ON public.comments;
CREATE POLICY "Authors can update their own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = author_id)
  WITH CHECK (auth.uid() = author_id);

REVOKE UPDATE (post_id, author_id, parent_id, created_at, upvotes, hidden_at, hidden_by)
  ON public.comments FROM authenticated;

-- 5. Suspended accounts must not be able to vote.
--
-- Every other user-generated write carries `not public.is_suspended()`
-- (20260704000001_trust_safety_v1.sql). comment_votes was missed.
DROP POLICY IF EXISTS "Authenticated users can vote on comments" ON public.comment_votes;
CREATE POLICY "Authenticated users can vote on comments"
  ON public.comment_votes FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND auth.uid() = user_id
    AND NOT public.is_suspended()
  );

-- 6. Let the new in-app "Comments and replies" toggle actually be saved.
--
-- set_notification_preference() validates p_key against a hardcoded allowlist
-- and raises 'Unsupported notification preference' for anything else, so a new
-- preference key is inert -- worse, it throws -- until the function knows about
-- it. Redefined here with 'inapp_comments' added and everything else byte-for-
-- byte as it was in supabase/pending/author_subscriptions_ux_v2.sql.
CREATE OR REPLACE FUNCTION public.set_notification_preference(
  p_key text,
  p_enabled boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid := auth.uid();
  v_preferences jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;
  if p_key not in (
    'inapp_likes', 'inapp_comments', 'inapp_follows', 'inapp_debates',
    'inapp_collaboration',
    'email_comments', 'email_follows', 'email_likes', 'email_responses',
    'email_messages', 'email_published', 'email_digest',
    'email_account_security', 'email_profile_reminders',
    'email_review_assigned', 'email_review_started', 'email_review_reminder',
    'email_co_author_invite', 'email_co_author_accepted',
    'email_co_author_declined', 'email_opportunity_inquiry',
    'email_author_publications', 'email_debate_updates', 'push_published',
    'push_messages', 'push_comments', 'push_likes', 'push_follows',
    'push_daily_brief', 'push_author_publications', 'push_debate_updates'
  ) then
    raise exception 'Unsupported notification preference';
  end if;

  update public.profiles
  set notification_prefs = jsonb_set(
    coalesce(notification_prefs, '{}'::jsonb),
    array[p_key],
    to_jsonb(p_enabled),
    true
  )
  where id = v_user_id
  returning notification_prefs into v_preferences;

  return v_preferences;
end;
$$;

REVOKE ALL ON FUNCTION public.set_notification_preference(text, boolean)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_notification_preference(text, boolean)
  TO authenticated;

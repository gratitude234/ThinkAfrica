-- Phase 0 profile-security hardening (EXPAND migration; forward-only).
--
-- IMPORTANT DEPLOYMENT STATUS
-- ---------------------------
-- This file is source-controlled only. Creating it does not prove that it has
-- run in staging or production. Do not apply it directly to production.
--
-- Production/staging preflight, in this order:
--   1. Confirm every earlier migration through 20260802000002 is present.
--   2. Capture pg_policies/role_table_grants/role_column_grants for profiles.
--   3. Confirm the profile columns named below exist with the expected types.
--   4. Confirm award_points_on_publish(), award_points_on_like(),
--      award_points_on_comment(), reverse_points_on_unlike(),
--      award_points_on_review_submission(), and promote_alumni() are
--      SECURITY DEFINER and are not owned by
--      authenticated/anon.
--   5. Confirm no deployed client inserts directly into public.profiles.
--   6. In staging, exercise profile editing, signup, verification,
--      suspend/unsuspend, publish, like/unlike, review completion, private
--      messaging, anonymous profile reads, and members-only profile reads.
--
-- Rollback policy:
--   Do not edit or delete this migration after it has been applied. If a
--   regression is found, ship a new forward migration that restores the
--   captured policy/function/grant definitions. Restoring broad authenticated
--   UPDATE or INSERT is not an acceptable emergency rollback because it
--   reopens self-unsuspension and reputation/role escalation.

-- ==========================================================================
-- A. Direct profile writes: explicit row ownership plus column allowlist
-- ==========================================================================

-- Profiles are created by handle_new_user(), the SECURITY DEFINER trigger on
-- auth.users. There is no application .insert()/.upsert() call for profiles.
-- Removing both the policy and SQL privilege closes the column-blind INSERT
-- path while leaving the auth trigger and service-role administration intact.
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles
  FROM PUBLIC, anon, authenticated;

-- Preserve the server-only administrative path explicitly. Supabase normally
-- grants this already, but stating it here makes the intended trust boundary
-- reviewable even if project defaults differ.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.profiles TO service_role;

-- RLS owns the row boundary. WITH CHECK is explicit so an authenticated user
-- cannot move a row to another identity even if grants change later.
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- This is the complete direct-client edit contract as of 2026-08-15. Revoking
-- table-level UPDATE before granting individual columns is essential: a
-- column-level REVOKE does not override an existing table-level grant.
GRANT UPDATE (
  username,
  full_name,
  country,
  university,
  field_of_study,
  profile_type,
  secondary_profile_types,
  organization_name,
  professional_title,
  organization_website,
  bio,
  avatar_url,
  cover_image_url,
  interests,
  graduation_year,
  open_to_mentoring,
  onboarding_completed,
  notification_prefs,
  privacy_settings
) ON TABLE public.profiles TO authenticated;

-- Defense in depth. The column grants above are the first enforcement layer;
-- this trigger protects the table if a future migration accidentally restores
-- broad UPDATE. It defaults new columns to protected: only the allowlist may
-- differ during a direct authenticated table write.
--
-- auth.role() is the original JWT role even inside a SECURITY DEFINER call.
-- current_user, however, changes to the function owner. Requiring both values
-- to be 'authenticated' blocks direct PostgREST writes while preserving point
-- award/reversal triggers, promote_alumni(), future narrowly scoped SECURITY
-- DEFINER workflows, and service-role admin verification/moderation.
CREATE OR REPLACE FUNCTION public.protect_profile_privileged_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_directly_editable_columns CONSTANT text[] := ARRAY[
    'username',
    'full_name',
    'country',
    'university',
    'field_of_study',
    'profile_type',
    'secondary_profile_types',
    'organization_name',
    'professional_title',
    'organization_website',
    'bio',
    'avatar_url',
    'cover_image_url',
    'interests',
    'graduation_year',
    'open_to_mentoring',
    'onboarding_completed',
    'notification_prefs',
    'privacy_settings'
  ]::text[];
BEGIN
  IF auth.role() = 'authenticated' AND current_user = 'authenticated' THEN
    IF (to_jsonb(NEW) - v_directly_editable_columns)
       IS DISTINCT FROM
       (to_jsonb(OLD) - v_directly_editable_columns)
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'System-managed profile fields cannot be changed directly.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_protect_privileged_columns ON public.profiles;
CREATE TRIGGER profiles_protect_privileged_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_privileged_columns();

COMMENT ON FUNCTION public.protect_profile_privileged_columns() IS
  'Phase 0 default-deny guard: direct authenticated table updates may change only the audited profile-edit allowlist. SECURITY DEFINER and service-role writes remain available for points, alumni, verification, and moderation.';

-- ==========================================================================
-- B. Profile visibility and staged private-column access
-- ==========================================================================

-- Pure, non-definer helper: it does not query profiles, avoiding RLS recursion.
-- Unknown/malformed visibility values fail closed for everyone except the row
-- owner. Existing NULL/missing legacy values retain the historical public
-- default.
CREATE OR REPLACE FUNCTION public.can_view_profile(
  p_profile_id uuid,
  p_privacy_settings jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
  SELECT
    p_profile_id = auth.uid()
    OR CASE COALESCE(p_privacy_settings ->> 'profile_visibility', 'public')
      WHEN 'public' THEN true
      WHEN 'members_only' THEN auth.role() = 'authenticated'
      ELSE false
    END;
$$;

REVOKE ALL ON FUNCTION public.can_view_profile(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid, jsonb)
  TO anon, authenticated, service_role;

-- Directory queries use this helper through the safe projection below. It is
-- intentionally not the general SELECT policy: hiding from discovery must not
-- make a known profile URL inaccessible to an otherwise eligible viewer.
CREATE OR REPLACE FUNCTION public.is_profile_listed_in_directory(
  p_profile_id uuid,
  p_privacy_settings jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.can_view_profile(p_profile_id, p_privacy_settings)
    AND COALESCE(p_privacy_settings ->> 'show_in_directory', 'true') = 'true';
$$;

REVOKE ALL ON FUNCTION public.is_profile_listed_in_directory(uuid, jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_profile_listed_in_directory(uuid, jsonb)
  TO anon, authenticated, service_role;

-- A view is the authoritative directory boundary. It exposes only reviewed
-- public fields and applies directory visibility even when queried through a
-- service-role client (for example, sitemap or cached discovery generation).
-- The default view-owner execution mode is intentional: the later CONTRACT
-- migration can revoke direct profiles SELECT without breaking this safe
-- projection. Keep the view owned by a trusted migration role and never by
-- anon or authenticated.
CREATE OR REPLACE VIEW public.profile_directory
WITH (security_barrier = true)
AS
SELECT
  p.id,
  p.username,
  p.full_name,
  p.country,
  p.university,
  p.field_of_study,
  p.profile_type,
  p.secondary_profile_types,
  p.organization_name,
  p.professional_title,
  p.organization_website,
  p.bio,
  p.avatar_url,
  p.cover_image_url,
  p.interests,
  p.graduation_year,
  p.open_to_mentoring,
  p.is_alumni,
  p.verified,
  p.verified_type,
  p.role,
  p.points,
  p.created_at
FROM public.profiles AS p
WHERE p.username IS NOT NULL
  AND p.suspended_at IS NULL
  AND public.is_profile_listed_in_directory(p.id, p.privacy_settings);

REVOKE ALL ON TABLE public.profile_directory FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profile_directory
  TO anon, authenticated, service_role;

COMMENT ON VIEW public.profile_directory IS
  'Safe profile discovery projection. Excludes suspended, non-viewable, opted-out, and username-less profiles; never exposes private preferences, email, moderation state, or delivery metadata.';

DROP POLICY IF EXISTS "Public profiles are viewable by everyone"
  ON public.profiles;
DROP POLICY IF EXISTS "Profiles are visible according to privacy settings"
  ON public.profiles;
CREATE POLICY "Profiles are visible according to privacy settings"
  ON public.profiles
  FOR SELECT
  TO anon, authenticated
  USING (
    id = auth.uid()
    OR (
      suspended_at IS NULL
      AND public.can_view_profile(id, privacy_settings)
    )
  );

-- EXPAND half of the private-column cutover. App code can move its owner-only
-- reads to this RPC before a later CONTRACT migration revokes table-level
-- SELECT and grants only the safe public profile projection. The application
-- changes shipped beside this migration move owner reads to the RPC, but this
-- migration deliberately does NOT revoke SELECT yet: old deployed clients
-- must remain compatible during the expand step. Until the separately reviewed
-- candidate in supabase/pending is promoted after staging cutover, public rows'
-- private columns remain reachable through explicit PostgREST selects even
-- though non-public rows now respect profile_visibility.
CREATE OR REPLACE FUNCTION public.get_my_profile_private()
RETURNS TABLE (
  profile_id uuid,
  signup_email text,
  notification_prefs jsonb,
  privacy_settings jsonb,
  onboarding_completed boolean,
  suspended_at timestamptz,
  suspended_reason text,
  last_engagement_push_notified_at timestamptz,
  last_comment_email_notified_at timestamptz,
  push_prompt_shown_at timestamptz,
  push_prompt_last_shown_at timestamptz,
  push_prompt_attempt_count integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
ROWS 1
AS $$
  SELECT
    p.id,
    p.signup_email,
    p.notification_prefs,
    p.privacy_settings,
    p.onboarding_completed,
    p.suspended_at,
    p.suspended_reason,
    p.last_engagement_push_notified_at,
    p.last_comment_email_notified_at,
    p.push_prompt_shown_at,
    p.push_prompt_last_shown_at,
    p.push_prompt_attempt_count
  FROM public.profiles AS p
  WHERE auth.uid() IS NOT NULL
    AND p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile_private() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile_private()
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_profile_private() IS
  'Owner-only EXPAND RPC for private profile data. Move app reads here before a later migration revokes broad profiles SELECT; returns no row without auth.uid().';

-- ==========================================================================
-- C. Enforce allow_messages at the authoritative conversation boundary
-- ==========================================================================

-- This preserves the current authentication, self-target, target-existence,
-- caller/target-suspension, and block checks. An existing unblocked
-- conversation is returned before recipient preferences are considered;
-- allow_messages governs creation only. Message delivery in an existing
-- conversation is protected by the message INSERT policy below.
CREATE OR REPLACE FUNCTION public.find_or_create_conversation(target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_current_user_id uuid := auth.uid();
  v_pair_key text;
  v_conversation_id uuid;
  v_allow_messages text;
  v_target_suspended boolean := false;
BEGIN
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF target_user_id IS NULL OR v_current_user_id = target_user_id THEN
    RAISE EXCEPTION 'Invalid conversation target.';
  END IF;

  SELECT
    CASE COALESCE(p.privacy_settings ->> 'allow_messages', 'everyone')
      WHEN 'everyone' THEN 'everyone'
      WHEN 'followers_only' THEN 'followers_only'
      WHEN 'nobody' THEN 'nobody'
      ELSE 'nobody'
    END,
    p.suspended_at IS NOT NULL
  INTO v_allow_messages, v_target_suspended
  FROM public.profiles AS p
  WHERE p.id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid conversation target.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = v_current_user_id
      AND p.suspended_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Your account is currently suspended.';
  END IF;

  IF v_target_suspended THEN
    RAISE EXCEPTION 'Conversation unavailable.';
  END IF;

  IF public.is_blocked_pair(v_current_user_id, target_user_id) THEN
    RAISE EXCEPTION 'You cannot message this user.';
  END IF;

  v_pair_key := LEAST(v_current_user_id::text, target_user_id::text)
    || ':'
    || GREATEST(v_current_user_id::text, target_user_id::text);

  SELECT c.id
  INTO v_conversation_id
  FROM public.conversations AS c
  WHERE c.participant_pair = v_pair_key;

  IF FOUND THEN
    RETURN v_conversation_id;
  END IF;

  IF v_allow_messages = 'nobody' THEN
    RAISE EXCEPTION 'This user is not accepting new conversations.';
  END IF;

  IF v_allow_messages = 'followers_only' AND NOT EXISTS (
    SELECT 1
    FROM public.follows AS f
    WHERE f.follower_id = v_current_user_id
      AND f.following_id = target_user_id
  ) THEN
    RAISE EXCEPTION 'Only this user''s followers can start a conversation.';
  END IF;

  INSERT INTO public.conversations (participant_pair)
  VALUES (v_pair_key)
  ON CONFLICT (participant_pair)
  DO UPDATE SET participant_pair = EXCLUDED.participant_pair
  RETURNING id INTO v_conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES
    (v_conversation_id, v_current_user_id),
    (v_conversation_id, target_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN v_conversation_id;
END;
$$;

REVOKE ALL ON FUNCTION public.find_or_create_conversation(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.find_or_create_conversation(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_or_create_conversation(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.find_or_create_conversation(uuid) IS
  'Creates or returns a direct conversation after authentication, self-target, target existence, caller/target suspension, and block checks; recipient allow_messages governs new conversations.';

-- Raw PostgREST inserts must enforce the same trust-and-safety boundary as the
-- server action. Without this helper, a participant could bypass application
-- suspension/block checks and insert directly into public.messages.
CREATE OR REPLACE FUNCTION public.can_send_message_in_conversation(
  p_conversation_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants AS mine
      WHERE mine.conversation_id = p_conversation_id
        AND mine.user_id = auth.uid()
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.profiles AS sender
      WHERE sender.id = auth.uid()
        AND sender.suspended_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants AS recipient
      JOIN public.profiles AS recipient_profile
        ON recipient_profile.id = recipient.user_id
      WHERE recipient.conversation_id = p_conversation_id
        AND recipient.user_id <> auth.uid()
        AND recipient_profile.suspended_at IS NOT NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.conversation_participants AS recipient
      JOIN public.user_blocks AS block
        ON (
          block.blocker_id = auth.uid()
          AND block.blocked_id = recipient.user_id
        ) OR (
          block.blocker_id = recipient.user_id
          AND block.blocked_id = auth.uid()
        )
      WHERE recipient.conversation_id = p_conversation_id
        AND recipient.user_id <> auth.uid()
    );
$$;

REVOKE ALL ON FUNCTION public.can_send_message_in_conversation(uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_send_message_in_conversation(uuid)
  FROM anon;
GRANT EXECUTE ON FUNCTION public.can_send_message_in_conversation(uuid)
  TO authenticated, service_role;

DROP POLICY IF EXISTS "sender_insert_message" ON public.messages;
CREATE POLICY "sender_insert_message"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND public.can_send_message_in_conversation(conversation_id)
  );

COMMENT ON FUNCTION public.can_send_message_in_conversation(uuid) IS
  'Authoritative INSERT guard for direct messages: caller participation, caller/recipient suspension, and either-direction block state.';

-- Post-apply verification (staging first; do not infer success from migration
-- ledger presence alone): inspect pg_policies, information_schema table/column
-- grants, pg_get_functiondef for all functions above, and pg_trigger for
-- profiles_protect_privileged_columns. Then run the behavioral matrix listed
-- in the preflight header. The later private-SELECT CONTRACT migration remains
-- intentionally outstanding.

-- Stop client roles creating conversations or writing messages.
--
-- Direct messaging was removed from the application in the publishing reset,
-- Phase 2E: the routes, the server actions and the profile Message button are
-- gone. This closes the database paths that did not go with them, because a
-- signed-in session can reach PostgREST without the application.
--
-- ## What a client could still do (read-only audit, 2026-09-15)
--
-- - Execute public.find_or_create_conversation(uuid). It is SECURITY DEFINER,
--   granted to authenticated, and inserts into conversations and
--   conversation_participants.
-- - INSERT into public.messages. anon and authenticated hold INSERT, UPDATE,
--   DELETE and TRUNCATE on all three tables, and the policy
--   sender_insert_message admits a participant writing as themselves.
-- - UPDATE their own messages (sender_update_message) and their own
--   participant row (participants_update_own).
--
-- conversations has no INSERT policy, and no table has a DELETE policy, so row
-- level security already refused those. They are revoked anyway: a privilege
-- that no policy admits today is one policy edit away from being a write path.
--
-- ## What this does
--
-- Revokes EXECUTE on find_or_create_conversation, and INSERT, UPDATE, DELETE
-- and TRUNCATE on the three tables, from PUBLIC, anon and authenticated.
--
-- ## What this deliberately does not do
--
-- - It drops nothing and deletes nothing. Every conversation, participant row
--   and message stays exactly as it is.
-- - It does not revoke SELECT. Participants keep reading their own history
--   through the existing policies, and service_role keeps full access for the
--   database cleanup phase, which snapshots and then drops these tables.
-- - It changes no policy, trigger or other function.
--   can_send_message_in_conversation, is_conversation_participant,
--   enforce_message_soft_delete and touch_conversation_last_message are left
--   for that phase.
--
-- None of the three tables is in a realtime publication, so there is nothing
-- to remove there.
--
-- ## Order
--
-- Apply after the application deploy that removes messaging. Applied first, the
-- still-running application would show a member an error on a send or on the
-- Message button until the deploy lands. Neither order puts data at risk.
--
--   node scripts/migration/apply-messaging-write-disablement.mjs --dry-run
--   node scripts/migration/apply-messaging-write-disablement.mjs --apply

begin;

revoke execute on function public.find_or_create_conversation(uuid)
  from public, anon, authenticated;

revoke insert, update, delete, truncate
  on table public.conversations, public.conversation_participants, public.messages
  from public, anon, authenticated;

commit;

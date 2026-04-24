-- Verified users can start direct conversations with any other profile.
-- Relationship/context checks are intentionally removed from the RPC gate.
create or replace function public.find_or_create_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  pair_key text;
  conversation_id uuid;
  current_verified boolean := false;
  target_exists boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or current_user_id = target_user_id then
    raise exception 'Invalid conversation target.';
  end if;

  select coalesce(verified, false) into current_verified
  from public.profiles
  where id = current_user_id;

  if not coalesce(current_verified, false) then
    raise exception 'Account verification required to send messages.';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = target_user_id
  )
  into target_exists;

  if not target_exists then
    raise exception 'Invalid conversation target.';
  end if;

  pair_key := least(current_user_id::text, target_user_id::text)
    || ':'
    || greatest(current_user_id::text, target_user_id::text);

  insert into public.conversations (participant_pair)
  values (pair_key)
  on conflict (participant_pair)
  do update set participant_pair = excluded.participant_pair
  returning id into conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (conversation_id, current_user_id),
    (conversation_id, target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return conversation_id;
end;
$$;

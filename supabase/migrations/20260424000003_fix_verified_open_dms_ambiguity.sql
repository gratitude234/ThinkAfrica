-- Fix PL/pgSQL name ambiguity from the previous verified-open-DMs RPC.
create or replace function public.find_or_create_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_pair_key text;
  v_conversation_id uuid;
  v_current_verified boolean := false;
  v_target_exists boolean := false;
begin
  if v_current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or v_current_user_id = target_user_id then
    raise exception 'Invalid conversation target.';
  end if;

  select coalesce(verified, false) into v_current_verified
  from public.profiles
  where id = v_current_user_id;

  if not coalesce(v_current_verified, false) then
    raise exception 'Account verification required to send messages.';
  end if;

  select exists (
    select 1
    from public.profiles
    where id = target_user_id
  )
  into v_target_exists;

  if not v_target_exists then
    raise exception 'Invalid conversation target.';
  end if;

  v_pair_key := least(v_current_user_id::text, target_user_id::text)
    || ':'
    || greatest(v_current_user_id::text, target_user_id::text);

  insert into public.conversations (participant_pair)
  values (v_pair_key)
  on conflict (participant_pair)
  do update set participant_pair = excluded.participant_pair
  returning id into v_conversation_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values
    (v_conversation_id, v_current_user_id),
    (v_conversation_id, target_user_id)
  on conflict (conversation_id, user_id) do nothing;

  return v_conversation_id;
end;
$$;

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
  is_eligible boolean := false;
  current_verified boolean := false;
begin
  if current_user_id is null then
    raise exception 'Authentication required.';
  end if;

  if target_user_id is null or current_user_id = target_user_id then
    raise exception 'Invalid conversation target.';
  end if;

  select verified into current_verified
  from public.profiles
  where id = current_user_id;

  if not current_verified then
    raise exception 'Account verification required to send messages.';
  end if;

  select exists (
    select 1
    from public.follows mine
    join public.follows theirs
      on theirs.follower_id = target_user_id
     and theirs.following_id = current_user_id
    where mine.follower_id = current_user_id
      and mine.following_id = target_user_id
  )
  into is_eligible;

  if not is_eligible then
    select exists (
      select 1
      from public.debate_arguments mine
      join public.debate_arguments theirs
        on theirs.debate_id = mine.debate_id
       and theirs.author_id = target_user_id
      where mine.author_id = current_user_id
    )
    into is_eligible;
  end if;

  if not is_eligible then
    select exists (
      select 1
      from public.profiles mine
      join public.profiles theirs
        on theirs.id = target_user_id
       and theirs.university is not null
       and theirs.university = mine.university
      where mine.id = current_user_id
        and mine.university is not null
    )
    into is_eligible;
  end if;

  if not is_eligible then
    select exists (
      select 1
      from public.talent_profiles
      where user_id = target_user_id
        and open_to_opportunities = true
        and visibility = 'public'
    )
    into is_eligible;
  end if;

  if not is_eligible then
    raise exception 'Conversation not allowed.';
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

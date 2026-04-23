-- Conversations table (1:1 only for now)
CREATE TABLE IF NOT EXISTS public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz NOT NULL DEFAULT now(),
  participant_pair text UNIQUE
);

-- Participants (exactly 2 per conversation for 1:1)
CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Messages
CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages(conversation_id, created_at);

CREATE INDEX IF NOT EXISTS conv_participants_user_idx
  ON public.conversation_participants(user_id);

CREATE INDEX IF NOT EXISTS conversations_last_message_idx
  ON public.conversations(last_message_at DESC);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants_select_conversation" ON public.conversations;
DROP POLICY IF EXISTS "participants_select_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "participants_update_own" ON public.conversation_participants;
DROP POLICY IF EXISTS "participants_select_messages" ON public.messages;
DROP POLICY IF EXISTS "sender_insert_message" ON public.messages;
DROP POLICY IF EXISTS "sender_update_message" ON public.messages;

CREATE POLICY "participants_select_conversation"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = conversations.id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "participants_select_own"
  ON public.conversation_participants FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp2
      WHERE cp2.conversation_id = conversation_participants.conversation_id
        AND cp2.user_id = auth.uid()
    )
  );

CREATE POLICY "participants_update_own"
  ON public.conversation_participants FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "participants_select_messages"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "sender_insert_message"
  ON public.messages FOR INSERT
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversation_participants cp
      WHERE cp.conversation_id = messages.conversation_id
        AND cp.user_id = auth.uid()
    )
  );

CREATE POLICY "sender_update_message"
  ON public.messages FOR UPDATE
  USING (sender_id = auth.uid())
  WITH CHECK (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.touch_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at
  WHERE id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_touch_conversation_last_message ON public.messages;
CREATE TRIGGER messages_touch_conversation_last_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.touch_conversation_last_message();

CREATE OR REPLACE FUNCTION public.enforce_message_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.sender_id <> auth.uid() THEN
    RAISE EXCEPTION 'Only the sender can update this message.';
  END IF;

  IF NEW.content IS DISTINCT FROM OLD.content
    OR NEW.sender_id IS DISTINCT FROM OLD.sender_id
    OR NEW.conversation_id IS DISTINCT FROM OLD.conversation_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Messages only support soft delete updates.';
  END IF;

  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    RAISE EXCEPTION 'Deleted messages cannot be changed.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS messages_enforce_soft_delete ON public.messages;
CREATE TRIGGER messages_enforce_soft_delete
BEFORE UPDATE ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.enforce_message_soft_delete();

CREATE OR REPLACE FUNCTION public.find_or_create_conversation(target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  pair_key text;
  conversation_id uuid;
  is_eligible boolean := false;
BEGIN
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF target_user_id IS NULL OR current_user_id = target_user_id THEN
    RAISE EXCEPTION 'Invalid conversation target.';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.follows mine
    JOIN public.follows theirs
      ON theirs.follower_id = target_user_id
     AND theirs.following_id = current_user_id
    WHERE mine.follower_id = current_user_id
      AND mine.following_id = target_user_id
  )
  INTO is_eligible;

  IF NOT is_eligible THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.debate_arguments mine
      JOIN public.debate_arguments theirs
        ON theirs.debate_id = mine.debate_id
       AND theirs.author_id = target_user_id
      WHERE mine.author_id = current_user_id
    )
    INTO is_eligible;
  END IF;

  IF NOT is_eligible THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles mine
      JOIN public.profiles theirs
        ON theirs.id = target_user_id
       AND theirs.university IS NOT NULL
       AND theirs.university = mine.university
      WHERE mine.id = current_user_id
        AND mine.university IS NOT NULL
    )
    INTO is_eligible;
  END IF;

  IF NOT is_eligible THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.talent_profiles
      WHERE user_id = target_user_id
        AND open_to_opportunities = true
        AND visibility = 'public'
    )
    INTO is_eligible;
  END IF;

  IF NOT is_eligible THEN
    RAISE EXCEPTION 'Conversation not allowed.';
  END IF;

  pair_key := LEAST(current_user_id::text, target_user_id::text)
    || ':'
    || GREATEST(current_user_id::text, target_user_id::text);

  INSERT INTO public.conversations (participant_pair)
  VALUES (pair_key)
  ON CONFLICT (participant_pair)
  DO UPDATE SET participant_pair = EXCLUDED.participant_pair
  RETURNING id INTO conversation_id;

  INSERT INTO public.conversation_participants (conversation_id, user_id)
  VALUES
    (conversation_id, current_user_id),
    (conversation_id, target_user_id)
  ON CONFLICT (conversation_id, user_id) DO NOTHING;

  RETURN conversation_id;
END;
$$;

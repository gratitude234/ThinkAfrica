import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MessageThread from "./MessageThread";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface ParticipantCheckRow {
  user_id: string;
}

interface OtherParticipantRow {
  user_id: string;
  profiles:
    | {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
      }
    | {
        username: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]
    | null;
}

interface MessageRow {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  edited_at: string | null;
}

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: participation } = await supabase
    .from("conversation_participants")
    .select("user_id")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .maybeSingle<ParticipantCheckRow>();

  if (!participation) notFound();

  const { data: otherParticipantRow } = await supabase
    .from("conversation_participants")
    .select("user_id, profiles!conversation_participants_user_id_fkey(username, full_name, avatar_url)")
    .eq("conversation_id", id)
    .neq("user_id", user.id)
    .maybeSingle<OtherParticipantRow>();

  const otherProfile = otherParticipantRow
    ? Array.isArray(otherParticipantRow.profiles)
      ? otherParticipantRow.profiles[0] ?? null
      : otherParticipantRow.profiles
    : null;

  const { data: initialMessages } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at, deleted_at, edited_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: false })
    .limit(50);

  await supabase
    .from("conversation_participants")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", id)
    .eq("user_id", user.id);

  return (
    <MessageThread
      conversationId={id}
      currentUserId={user.id}
      otherProfile={otherProfile}
      initialMessages={((initialMessages ?? []) as MessageRow[]).reverse()}
    />
  );
}

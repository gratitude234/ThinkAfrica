import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationListClient, { type ConversationRow } from "./ConversationListClient";

interface ParticipantRow {
  conversation_id: string;
  last_read_at: string | null;
}

interface ConversationBaseRow {
  id: string;
  last_message_at: string;
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

interface MessagePreviewRow {
  content: string;
  deleted_at: string | null;
  sender_id: string;
}

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
    .eq("user_id", user.id);

  const rows = (participantRows ?? []) as ParticipantRow[];
  const conversationIds = rows.map((row) => row.conversation_id);

  // Map of conversationId -> user's last_read_at
  const lastReadMap = new Map(
    rows.map((row) => [row.conversation_id, row.last_read_at])
  );

  let conversations: ConversationRow[] = [];

  if (conversationIds.length > 0) {
    const { data: conversationRows } = await supabase
      .from("conversations")
      .select("id, last_message_at")
      .in("id", conversationIds)
      .order("last_message_at", { ascending: false });

    if ((conversationRows ?? []).length > 0) {
      conversations = await Promise.all(
        ((conversationRows ?? []) as ConversationBaseRow[]).map(async (conversation) => {
          const [{ data: otherParticipant }, { data: lastMessage }] = await Promise.all([
            supabase
              .from("conversation_participants")
              .select("user_id, profiles!conversation_participants_user_id_fkey(username, full_name, avatar_url)")
              .eq("conversation_id", conversation.id)
              .neq("user_id", user.id)
              .maybeSingle<OtherParticipantRow>(),
            supabase
              .from("messages")
              .select("content, deleted_at, sender_id")
              .eq("conversation_id", conversation.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle<MessagePreviewRow>(),
          ]);

          const normalizedOther = otherParticipant
            ? {
                user_id: otherParticipant.user_id,
                profiles: Array.isArray(otherParticipant.profiles)
                  ? otherParticipant.profiles[0] ?? null
                  : otherParticipant.profiles,
              }
            : null;

          return {
            ...conversation,
            last_message: lastMessage ?? null,
            other_participant: normalizedOther,
            userLastReadAt: lastReadMap.get(conversation.id) ?? null,
          };
        })
      );
    }
  }

  return (
    <>
      {/* Mobile: full inbox */}
      <div className="mx-auto max-w-2xl lg:hidden">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
          <p className="mt-1 text-sm text-gray-500">Your direct conversations</p>
        </div>
        <ConversationListClient conversations={conversations} currentUserId={user.id} />
      </div>

      {/* Desktop: placeholder in the right panel */}
      <div className="hidden flex-1 flex-col items-center justify-center lg:flex">
        <svg className="mb-3 h-10 w-10 text-gray-300" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z" />
        </svg>
        <p className="text-sm font-medium text-gray-400">Select a conversation</p>
        <p className="mt-1 text-xs text-gray-300">Choose someone from the list to start chatting</p>
      </div>
    </>
  );
}

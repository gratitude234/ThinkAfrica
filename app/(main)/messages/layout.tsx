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

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let conversations: ConversationRow[] = [];
  const userId = user?.id ?? "";

  if (user) {
    const { data: participantRows } = await supabase
      .from("conversation_participants")
      .select("conversation_id, last_read_at")
      .eq("user_id", user.id);

    const rows = (participantRows ?? []) as ParticipantRow[];
    const conversationIds = rows.map((row) => row.conversation_id);
    const lastReadMap = new Map(rows.map((row) => [row.conversation_id, row.last_read_at]));

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
                .select(
                  "user_id, profiles!conversation_participants_user_id_fkey(username, full_name, avatar_url)"
                )
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
  }

  return (
    <>
      {/* Mobile: standard scrollable layout */}
      <div className="lg:hidden">{children}</div>

      {/* Desktop: fixed-height two-panel layout */}
      <div
        className="hidden lg:flex -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 overflow-hidden"
        style={{ height: "calc(100dvh - 64px)" }}
      >
        {/* Left panel: conversation list */}
        <aside className="flex w-80 flex-shrink-0 flex-col overflow-hidden border-r border-gray-100 bg-white">
          <div className="px-6 pt-6 pb-4">
            <h2 className="text-lg font-bold text-gray-900">Messages</h2>
          </div>
          <div className="flex-1 overflow-y-auto px-6 pb-6">
            {user ? (
              <ConversationListClient
                conversations={conversations}
                currentUserId={userId}
              />
            ) : null}
          </div>
        </aside>

        {/* Right panel: thread or placeholder */}
        <div className="flex flex-1 flex-col overflow-hidden bg-canvas">
          {children}
        </div>
      </div>
    </>
  );
}

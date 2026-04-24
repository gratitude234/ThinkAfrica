import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatRelativeTime } from "@/lib/utils";

interface ParticipantRow {
  conversation_id: string;
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

interface ConversationRow {
  id: string;
  last_message_at: string;
  last_message: MessagePreviewRow | null;
  other_participant: {
    user_id: string;
    profiles: {
      username: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
}

export default async function MessagesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: participantRows } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("user_id", user.id);

  const conversationIds = ((participantRows ?? []) as ParticipantRow[]).map(
    (row) => row.conversation_id
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
          };
        })
      );
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Messages</h1>
        <p className="mt-1 text-sm text-gray-500">Your direct conversations</p>
      </div>

      {conversations.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white py-16 text-center">
          <p className="mb-3 text-4xl">💬</p>
          <p className="text-sm font-medium text-gray-700">No messages yet</p>
          <p className="mt-1 text-xs text-gray-400">
            Visit a profile and start a direct conversation.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {conversations.map((conversation) => {
            const profile = conversation.other_participant?.profiles;
            const displayName = profile?.full_name ?? profile?.username ?? "Unknown";
            const lastMessage = conversation.last_message;
            const preview = lastMessage
              ? lastMessage.deleted_at
                ? "This message was deleted."
                : lastMessage.content.slice(0, 80) +
                  (lastMessage.content.length > 80 ? "…" : "")
              : "No messages yet";

            return (
              <Link
                key={conversation.id}
                href={`/messages/${conversation.id}`}
                className="flex items-center gap-4 px-4 py-4 transition-colors hover:bg-canvas"
              >
                <UserAvatar
                  name={displayName}
                  src={profile?.avatar_url ?? null}
                  size={44}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-gray-500">{preview}</p>
                </div>
                <p className="flex-shrink-0 text-xs text-gray-400">
                  {formatRelativeTime(conversation.last_message_at)}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

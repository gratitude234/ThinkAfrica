"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatRelativeTime } from "@/lib/utils";

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  deleted_at: string | null;
  edited_at: string | null;
}

interface MessageThreadProps {
  conversationId: string;
  currentUserId: string;
  otherProfile: {
    username: string;
    full_name: string | null;
    avatar_url: string | null;
  } | null;
  initialMessages: Message[];
}

export default function MessageThread({
  conversationId,
  currentUserId,
  otherProfile,
  initialMessages,
}: MessageThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = createClient();
  const displayName = otherProfile?.full_name ?? otherProfile?.username ?? "Unknown";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        async (payload) => {
          const newMessage = payload.new as Message;

          if (newMessage.sender_id !== currentUserId) {
            setMessages((prev) => [...prev, newMessage]);
            await supabase
              .from("conversation_participants")
              .update({ last_read_at: new Date().toISOString() })
              .eq("conversation_id", conversationId)
              .eq("user_id", currentUserId);
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sending) return;

    setSending(true);
    setInput("");

    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMessage: Message = {
      id: optimisticId,
      sender_id: currentUserId,
      content: text,
      created_at: new Date().toISOString(),
      deleted_at: null,
      edited_at: null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    const { data: inserted, error } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: text,
      })
      .select("id, sender_id, content, created_at, deleted_at, edited_at")
      .single<Message>();

    if (error) {
      setMessages((prev) => prev.filter((message) => message.id !== optimisticId));
      setInput(text);
      setSending(false);
      return;
    }

    if (inserted) {
      setMessages((prev) =>
        prev.map((message) => (message.id === optimisticId ? inserted : message))
      );
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId);
    }

    setSending(false);
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 8rem)" }}>
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/messages")}
          className="mr-1 text-gray-400 hover:text-gray-600"
          aria-label="Back to inbox"
        >
          ←
        </button>
        <UserAvatar
          name={displayName}
          src={otherProfile?.avatar_url ?? null}
          size={36}
        />
        <Link
          href={otherProfile?.username ? `/${otherProfile.username}` : "#"}
          className="text-sm font-semibold text-gray-900 transition-colors hover:text-emerald-brand"
        >
          {displayName}
        </Link>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-400">
            Send the first message.
          </p>
        ) : null}

        {messages.map((message) => {
          const isMine = message.sender_id === currentUserId;

          return (
            <div
              key={message.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm ${
                  message.deleted_at
                    ? "border border-dashed border-gray-200 bg-white italic text-gray-400"
                    : isMine
                      ? "bg-emerald-brand text-white"
                      : "bg-gray-100 text-gray-900"
                }`}
              >
                <p>{message.deleted_at ? "This message was deleted." : message.content}</p>
                <p
                  className={`mt-0.5 text-right text-[10px] ${
                    isMine ? "text-emerald-100" : "text-gray-400"
                  }`}
                >
                  {formatRelativeTime(message.created_at)}
                  {message.edited_at && !message.deleted_at ? " · edited" : ""}
                </p>
              </div>
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>

      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            placeholder="Write a message..."
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void handleSend();
              }
            }}
            maxLength={2000}
            className="flex-1 resize-none rounded-xl border border-gray-200 bg-canvas px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
            style={{ maxHeight: "120px", overflowY: "auto" }}
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={!input.trim() || sending}
            className="flex-shrink-0 rounded-xl bg-emerald-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-600 disabled:opacity-40"
          >
            Send
          </button>
        </div>
        <p className="mt-1 text-right text-[10px] text-gray-300">{input.length}/2000</p>
      </div>
    </div>
  );
}

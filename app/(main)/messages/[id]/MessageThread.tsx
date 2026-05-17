"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatRelativeTime } from "@/lib/utils";
import { trackActivationEvent } from "@/lib/activationEvents";

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
  otherLastReadAt: string | null;
  otherUserId: string | null;
}

export default function MessageThread({
  conversationId,
  currentUserId,
  otherProfile,
  initialMessages,
  otherLastReadAt,
  otherUserId,
}: MessageThreadProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  // Read receipts
  const [liveOtherLastReadAt, setLiveOtherLastReadAt] = useState(otherLastReadAt);
  // Typing indicator
  const [otherTyping, setOtherTyping] = useState(false);
  // Message editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const bottomRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBroadcastRef = useRef<number>(0);

  const displayName = otherProfile?.full_name ?? otherProfile?.username ?? "Unknown";

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, otherTyping]);

  // Track activation event on mount
  useEffect(() => {
    trackActivationEvent({
      event: "message_started",
      metadata: {
        conversationId,
        source: "message_thread",
        hasPriorMessages: initialMessages.length > 0,
      },
    });
  }, [conversationId, initialMessages.length]);

  // Real-time: new messages + read receipts + typing broadcast
  useEffect(() => {
    if (document.cookie.includes("ta_lite=1")) return;

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
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "conversation_participants",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          // Update read receipt when the OTHER user reads our messages
          if (
            payload.new.user_id !== currentUserId &&
            typeof payload.new.last_read_at === "string"
          ) {
            setLiveOtherLastReadAt(payload.new.last_read_at);
          }
        }
      )
      .on(
        "broadcast",
        { event: "typing" },
        (payload: { payload: { userId: string } }) => {
          if (payload.payload.userId !== currentUserId) {
            setOtherTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => setOtherTyping(false), 3000);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  // Compute which message gets the "Seen" label (last sent message the other person has read)
  const seenMessageId = useMemo(() => {
    if (!liveOtherLastReadAt) return null;
    const readTime = new Date(liveOtherLastReadAt).getTime();
    const myReadMessages = messages.filter(
      (m) =>
        m.sender_id === currentUserId &&
        !m.deleted_at &&
        !m.id.startsWith("optimistic-") &&
        new Date(m.created_at).getTime() <= readTime
    );
    return myReadMessages.length > 0
      ? myReadMessages[myReadMessages.length - 1].id
      : null;
  }, [messages, liveOtherLastReadAt, currentUserId]);

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
      setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      setInput(text);
      setSending(false);
      return;
    }

    if (inserted) {
      setMessages((prev) =>
        prev.map((m) => (m.id === optimisticId ? inserted : m))
      );
      await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId);
      trackActivationEvent({
        event: "message_sent",
        metadata: { conversationId, length: text.length },
      });
    }

    setSending(false);
  };

  const handleDelete = async (messageId: string) => {
    const deletedAt = new Date().toISOString();
    await supabase
      .from("messages")
      .update({ deleted_at: deletedAt })
      .eq("id", messageId)
      .eq("sender_id", currentUserId);

    setMessages((prev) =>
      prev.map((m) => (m.id === messageId ? { ...m, deleted_at: deletedAt } : m))
    );
  };

  const handleEdit = async (messageId: string) => {
    const trimmed = editContent.trim();
    if (!trimmed) return;

    const editedAt = new Date().toISOString();
    await supabase
      .from("messages")
      .update({ content: trimmed, edited_at: editedAt })
      .eq("id", messageId)
      .eq("sender_id", currentUserId);

    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: trimmed, edited_at: editedAt } : m
      )
    );
    setEditingId(null);
    setEditContent("");
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Broadcast typing at most once per 1.5s
    if (
      e.target.value.trim() &&
      Date.now() - lastBroadcastRef.current > 1500 &&
      channelRef.current
    ) {
      lastBroadcastRef.current = Date.now();
      void channelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: currentUserId },
      });
    }
  };

  return (
    <div className="mx-auto flex max-w-2xl flex-col" style={{ height: "calc(100vh - 8rem)" }}>
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => router.push("/messages")}
          className="mr-1 text-gray-400 hover:text-gray-600"
          aria-label="Back to inbox"
        >
          Back
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

      {/* Message list */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <p className="mt-8 text-center text-sm text-gray-500">
            Send the first message.
          </p>
        ) : null}

        {messages.map((message) => {
          const isMine = message.sender_id === currentUserId;
          const isEditing = editingId === message.id;

          return (
            <div
              key={message.id}
              className={`group relative flex flex-col ${isMine ? "items-end" : "items-start"}`}
            >
              <div className={`flex w-full ${isMine ? "justify-end" : "justify-start"}`}>
                {/* Hover actions for own messages */}
                {isMine && !message.deleted_at && !isEditing ? (
                  <div className="mr-2 flex items-center gap-2 self-center opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(message.id);
                        setEditContent(message.content);
                      }}
                      className="text-[11px] text-gray-300 hover:text-emerald-500"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(message.id)}
                      className="text-[11px] text-gray-300 hover:text-red-400"
                      aria-label="Delete message"
                    >
                      Delete
                    </button>
                  </div>
                ) : null}

                {/* Message bubble or edit form */}
                {isMine && !message.deleted_at && isEditing ? (
                  <div className="w-[75%] space-y-2">
                    <textarea
                      autoFocus
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void handleEdit(message.id);
                        }
                        if (e.key === "Escape") {
                          setEditingId(null);
                          setEditContent("");
                        }
                      }}
                      rows={3}
                      maxLength={2000}
                      className="w-full resize-none rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(null);
                          setEditContent("");
                        }}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleEdit(message.id)}
                        className="rounded-lg bg-emerald-brand px-3 py-1 text-xs font-medium text-white hover:bg-emerald-600"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`max-w-[75%] rounded-xl px-4 py-2.5 text-sm ${
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
                        isMine ? "text-emerald-100" : "text-gray-500"
                      }`}
                    >
                      {formatRelativeTime(message.created_at)}
                      {message.edited_at && !message.deleted_at ? " / edited" : ""}
                    </p>
                  </div>
                )}
              </div>

              {/* Read receipt — only under the last seen message */}
              {isMine && message.id === seenMessageId ? (
                <p className="mt-0.5 text-[10px] text-emerald-400">Seen</p>
              ) : null}
            </div>
          );
        })}

        {/* Typing indicator */}
        {otherTyping ? (
          <div className="flex justify-start">
            <div className="rounded-xl bg-gray-100 px-4 py-2.5 text-sm text-gray-500">
              <span className="inline-flex gap-0.5">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
              </span>
              {" "}{displayName} is typing
            </div>
          </div>
        ) : null}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-200 bg-white px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={1}
            placeholder="Write a message..."
            value={input}
            onChange={handleInputChange}
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

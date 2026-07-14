"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shouldUseRealtime } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";

interface ParticipantRow {
  last_read_at: string;
  conversations:
    | { last_message_at: string }
    | { last_message_at: string }[]
    | null;
}

export default function MessagesUnreadBadge({
  userId,
  className = "",
}: {
  userId: string;
  className?: string;
}) {
  const [count, setCount] = useState(0);
  const supabase = useMemo(() => createClient(), []);
  const channelId = useRef(
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2)
  );

  const fetchCount = useCallback(async () => {
    const { data } = await supabase
      .from("conversation_participants")
      .select("last_read_at, conversations!inner(last_message_at)")
      .eq("user_id", userId);

    const unread = ((data ?? []) as ParticipantRow[]).filter((row) => {
      const conversation = Array.isArray(row.conversations)
        ? row.conversations[0]
        : row.conversations;

      return (
        !!conversation &&
        new Date(conversation.last_message_at).getTime() >
          new Date(row.last_read_at).getTime()
      );
    }).length;

    setCount(unread);
  }, [supabase, userId]);

  useEffect(() => {
    void fetchCount();

    if (!shouldUseRealtime()) {
      return;
    }

    const channel = supabase
      .channel(`unread-badge-${userId}-${channelId.current}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
        },
        () => {
          void fetchCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchCount]);

  // Polling fallback when Realtime is disabled. This badge sits in the nav
  // and stays mounted across every page (not just one open thread), so it
  // uses a longer interval than the 12s message poll to keep aggregate
  // query volume down across the whole logged-in session.
  useEffect(() => {
    if (shouldUseRealtime()) return;

    const poll = setInterval(() => {
      void fetchCount();
    }, 25_000);

    return () => clearInterval(poll);
  }, [fetchCount]);

  if (!count) return null;

  return (
    <span
      className={`absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

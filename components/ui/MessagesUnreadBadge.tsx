"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const supabase = createClient();

    supabase
      .from("conversation_participants")
      .select("last_read_at, conversations!inner(last_message_at)")
      .eq("user_id", userId)
      .then(({ data }) => {
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
      });
  }, [userId]);

  if (!count) return null;

  return (
    <span
      className={`absolute flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ${className}`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

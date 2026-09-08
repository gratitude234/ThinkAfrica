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
    // Counted server-side, from the session's viewer rather than the userId
    // prop. The comparison is unchanged: a conversation whose last message is
    // newer than this member's read cursor, and one they have never read.
    try {
      const response = await fetch("/api/messages/unread");
      if (!response.ok) return;
      const body = (await response.json()) as { count: number | null };

      // null means the count could not be taken. Leaving the badge as it was
      // is deliberate: clearing it to zero would tell a member they have no
      // messages during an outage.
      if (typeof body.count === "number") setCount(body.count);
    } catch {
      // Same: keep whatever the badge already showed.
    }
  }, []);

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

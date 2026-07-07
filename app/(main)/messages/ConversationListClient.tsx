"use client";

import { useState } from "react";
import Link from "next/link";
import UserAvatar from "@/components/ui/UserAvatar";
import { formatRelativeTime } from "@/lib/utils";

export interface ConversationRow {
  id: string;
  last_message_at: string;
  userLastReadAt: string | null;
  last_message: {
    content: string;
    deleted_at: string | null;
    sender_id: string;
  } | null;
  other_participant: {
    user_id: string;
    profiles: {
      username: string;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  } | null;
}

interface Props {
  conversations: ConversationRow[];
  currentUserId: string;
}

export default function ConversationListClient({ conversations, currentUserId }: Props) {
  const [query, setQuery] = useState("");

  const filtered = conversations.filter((c) => {
    if (!query.trim()) return true;
    const profile = c.other_participant?.profiles;
    const name = (profile?.full_name ?? profile?.username ?? "").toLowerCase();
    return name.includes(query.toLowerCase());
  });

  return (
    <div>
      {conversations.length > 0 && (
        <div className="relative mb-4">
          <svg
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z"
            />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search conversations…"
            className="w-full rounded-xl border border-gray-200 bg-canvas py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>
      )}

      {filtered.length === 0 && query.trim() ? (
        <div className="rounded-xl border border-gray-200 bg-white py-10 text-center">
          <p className="text-sm text-gray-500">
            No conversations matching &ldquo;{query}&rdquo;
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-gray-700">No messages yet</p>
          <p className="mt-1 text-xs text-gray-500">
            Visit a public profile and start a direct conversation.
          </p>
          <Link
            href="/opportunities"
            className="mt-4 inline-flex rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
          >
            Browse open profiles
          </Link>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {filtered.map((conversation) => {
            const profile = conversation.other_participant?.profiles;
            const displayName = profile?.full_name ?? profile?.username ?? "Unknown";
            const lastMessage = conversation.last_message;
            const preview = lastMessage
              ? lastMessage.deleted_at
                ? "This message was deleted."
                : lastMessage.content.slice(0, 80) +
                  (lastMessage.content.length > 80 ? "..." : "")
              : "No messages yet";

            const isUnread =
              !!lastMessage &&
              !lastMessage.deleted_at &&
              lastMessage.sender_id !== currentUserId &&
              new Date(conversation.last_message_at).getTime() >
                new Date(conversation.userLastReadAt ?? 0).getTime();

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
                  <p className={`truncate text-sm ${isUnread ? "font-bold text-gray-900" : "font-semibold text-gray-700"}`}>
                    {displayName}
                  </p>
                  <p className={`truncate text-xs ${isUnread ? "font-medium text-gray-700" : "text-gray-500"}`}>
                    {preview}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <p className="text-xs text-gray-500">
                    {formatRelativeTime(conversation.last_message_at)}
                  </p>
                  {isUnread ? (
                    <span className="h-2 w-2 rounded-full bg-emerald-brand" />
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

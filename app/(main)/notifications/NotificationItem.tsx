"use client";

import Link from "next/link";
import { formatDate } from "@/lib/utils";

interface NotificationData {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  actor: { full_name: string | null; username: string } | null;
  post_title: string | null;
  post_slug: string | null;
  actor_username: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  like: "❤️",
  comment: "💬",
  follow: "👤",
  debate_reply: "⚡",
  post_published: "✅",
  post_rejected: "❌",
};

function buildMessage(notification: NotificationData): string {
  const actorName = notification.actor?.full_name ?? notification.actor?.username ?? "Someone";
  const postTitle = notification.post_title ?? "your post";
  switch (notification.type) {
    case "like":
      return `${actorName} liked your post "${postTitle}"`;
    case "comment":
      return `${actorName} commented on "${postTitle}"`;
    case "follow":
      return `${actorName} started following you`;
    case "debate_reply":
      return `${actorName} replied to your debate argument`;
    case "post_published":
      return `Your post "${postTitle}" has been published`;
    case "post_rejected":
      return `Your post "${postTitle}" was not approved`;
    default:
      return `New notification`;
  }
}

function buildLink(notification: NotificationData): string | null {
  switch (notification.type) {
    case "like":
    case "comment":
    case "post_published":
    case "post_rejected":
      return notification.post_slug ? `/post/${notification.post_slug}` : null;
    case "follow":
      return notification.actor_username ? `/${notification.actor_username}` : null;
    default:
      return null;
  }
}

export default function NotificationItem({ notification }: { notification: NotificationData }) {
  const message = buildMessage(notification);
  const link = buildLink(notification);

  const inner = (
    <div className={`flex items-start gap-3 px-4 py-4 transition-colors ${!notification.read ? "bg-emerald-50 hover:bg-emerald-100/50" : "hover:bg-gray-50"}`}>
      <span className="text-lg flex-shrink-0 mt-0.5">
        {TYPE_ICONS[notification.type] ?? "🔔"}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-700 leading-snug">{message}</p>
        <p className="text-xs text-gray-400 mt-1">
          {formatDate(notification.created_at)}
        </p>
      </div>
      {!notification.read && (
        <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0 mt-1.5" />
      )}
    </div>
  );

  if (link) {
    return <Link href={link}>{inner}</Link>;
  }

  return inner;
}

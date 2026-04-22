"use client";

import Link from "next/link";
import { formatRelativeTime } from "@/lib/utils";
import { respondToCoAuthorInvite } from "./actions";

interface NotificationData {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  message?: string | null;
  link?: string | null;
  post_id?: string | null;
  actor: {
    full_name: string | null;
    username: string;
    avatar_url?: string | null;
  } | null;
  post_title: string | null;
  post_slug: string | null;
  actor_username: string | null;
}

const TYPE_ICONS: Record<string, string> = {
  follow: "👤",
  like: "❤️",
  comment: "💬",
  debate_reply: "⚡",
  debate_argument: "⚡",
  fellowship: "🎓",
  badge: "🏅",
  post_approved: "✅",
  post_rejected: "❌",
  review_assigned: "📝",
  revision_requested: "✍️",
  post_published: "📚",
  co_author_invite: "🤝",
  co_author_accepted: "✅",
  co_author_declined: "↩️",
};

function buildMessage(notification: NotificationData): string {
  if (notification.message) {
    return notification.message;
  }

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
    case "debate_argument":
      return `${actorName} added a debate argument`;
    case "fellowship":
      return "You have a fellowship update";
    case "badge":
      return "You earned a new badge";
    case "review_assigned":
      return `You've been assigned to review: ${postTitle}`;
    case "revision_requested":
      return `Reviewers have requested revisions on: ${postTitle}`;
    case "post_published":
      return `Your post ${postTitle} has been published.`;
    case "co_author_invite":
      return `${actorName} has invited you to co-author: ${postTitle}`;
    case "co_author_accepted":
      return `${actorName} accepted your co-author invitation on: ${postTitle}`;
    case "co_author_declined":
      return `${actorName} declined your co-author invitation on: ${postTitle}`;
    default:
      return "New notification";
  }
}

function buildLink(notification: NotificationData): string | null {
  if (notification.link) {
    return notification.link;
  }

  switch (notification.type) {
    case "like":
    case "comment":
    case "review_assigned":
    case "revision_requested":
    case "post_published":
    case "co_author_invite":
    case "co_author_accepted":
    case "co_author_declined":
      return notification.post_slug ? `/post/${notification.post_slug}` : null;
    case "follow":
      return notification.actor_username ? `/${notification.actor_username}` : null;
    case "debate_reply":
    case "debate_argument":
      return "/debates";
    default:
      return null;
  }
}

export default function NotificationItem({ notification }: { notification: NotificationData }) {
  const message = buildMessage(notification);
  const link = buildLink(notification);
  const icon = TYPE_ICONS[notification.type] ?? "🔔";

  const inner = (
    <div
      className={`flex items-start gap-3 px-4 py-4 transition-colors ${
        !notification.read ? "bg-emerald-50 hover:bg-emerald-100/50" : "hover:bg-canvas"
      }`}
    >
      {notification.actor?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={notification.actor.avatar_url}
          alt={notification.actor.full_name ?? notification.actor.username}
          className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
        />
      ) : (
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-base">
          {icon}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-gray-700">{message}</p>
        <p className="mt-1 text-xs text-gray-400">
          {formatRelativeTime(notification.created_at)}
        </p>
        {notification.type === "co_author_invite" && notification.post_id ? (
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={async (event) => {
                event.preventDefault();
                await respondToCoAuthorInvite({
                  notificationId: notification.id,
                  postId: notification.post_id!,
                  accept: true,
                });
                window.location.reload();
              }}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white"
            >
              Accept
            </button>
            <button
              type="button"
              onClick={async (event) => {
                event.preventDefault();
                await respondToCoAuthorInvite({
                  notificationId: notification.id,
                  postId: notification.post_id!,
                  accept: false,
                });
                window.location.reload();
              }}
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700"
            >
              Decline
            </button>
          </div>
        ) : null}
      </div>
      {!notification.read ? (
        <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
      ) : null}
    </div>
  );

  if (link) {
    return <Link href={link}>{inner}</Link>;
  }

  return inner;
}

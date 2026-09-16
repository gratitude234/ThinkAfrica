"use client";

import Link from "next/link";
import NotificationAvatar from "@/components/notifications/NotificationAvatar";
import { trackActivationEvent } from "@/lib/activationEvents";
import { notificationHref, notificationMessage } from "@/lib/notificationCatalog";
import type { NotificationData } from "@/lib/notificationData";
import { formatRelativeTime } from "@/lib/utils";

interface NotificationItemProps {
  notification: NotificationData;
  onOpen?: (notificationId: string) => void;
  onDismiss?: (notificationId: string) => void;
}

export function buildNotificationMessage(notification: NotificationData): string {
  return notificationMessage(notification);
}

export default function NotificationItem({
  notification,
  onOpen,
  onDismiss,
}: NotificationItemProps) {
  const message = buildNotificationMessage(notification);
  const link = notificationHref(notification);
  const isRead = notification.read;

  const handleOpen = () => {
    trackActivationEvent({
      event: "notification_opened",
      metadata: {
        notificationId: notification.id,
        type: notification.type,
        source: "notifications_page",
        postId: notification.post_id ?? null,
      },
    });
    onOpen?.(notification.id);
  };

  const body = (
    <>
      <NotificationAvatar
        type={notification.type}
        avatarUrl={notification.actor?.avatar_url}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-gray-700">{message}</p>
        <p className="mt-1 text-xs text-gray-500">
          <time
            dateTime={notification.created_at}
            title={new Date(notification.created_at).toLocaleString()}
          >
            {formatRelativeTime(notification.created_at)}
          </time>
        </p>
      </div>
    </>
  );

  return (
    <div
      className={`flex items-start gap-3 px-4 py-4 transition-colors ${
        isRead ? "hover:bg-canvas" : "bg-emerald-50 hover:bg-emerald-100/50"
      }`}
    >
      {link ? (
        <Link href={link} onClick={handleOpen} className="flex min-w-0 flex-1 items-start gap-3">
          {body}
        </Link>
      ) : (
        <button
          type="button"
          onClick={handleOpen}
          className="flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          {body}
        </button>
      )}
      <div className="flex shrink-0 flex-col items-center gap-2 pt-1">
        {!isRead ? (
          <span className="h-2 w-2 rounded-full bg-emerald-500">
            <span className="sr-only">Unread</span>
          </span>
        ) : null}
        {onDismiss ? (
          <button
            type="button"
            onClick={() => onDismiss(notification.id)}
            aria-label={`Dismiss notification: ${message}`}
            title="Dismiss"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}
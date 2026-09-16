"use client";

import Link from "next/link";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getActionInboxSummary, type ActionInboxItem } from "@/lib/actionInbox";
import { notificationHref, notificationMessage } from "@/lib/notificationCatalog";
import NotificationAvatar from "@/components/notifications/NotificationAvatar";
import { formatRelativeTime } from "@/lib/utils";
import type { NotificationData } from "@/lib/notificationData";

interface NotificationItemProps {
  notification: NotificationData;
  /**
   * Called when the reader opens the notification. Read state is owned by the
   * parent rather than tracked locally here: the page header count, the bell badge
   * and the "needs attention" hero all derive from the same list, so a local
   * `read` flag would leave them disagreeing with the row the user just clicked.
   */
  onOpen?: (notificationId: string) => void;
  onDismiss?: (notificationId: string) => void;
}

/**
 * Retained as a named export because it is the unit under test for fallback copy.
 * The copy itself now lives in lib/notificationCatalog.ts, alongside every other
 * per-type presentation detail, instead of in a switch that had drifted out of
 * step with both the action inbox and the bell dropdown.
 */
export function buildNotificationMessage(notification: NotificationData): string {
  return notificationMessage(notification);
}

export default function NotificationItem({
  notification,
  onOpen,
  onDismiss,
}: NotificationItemProps) {
  const inboxItem = getActionInboxSummary([notification]).items[0];
  const message = inboxItem?.description ?? buildNotificationMessage(notification);
  const link = notificationHref(notification);
  const isRead = notification.read;

  const trackNotificationAction = (source: string, item?: ActionInboxItem) => {
    trackActivationEvent({
      event: "notification_opened",
      metadata: {
        notificationId: notification.id,
        type: notification.type,
        source,
        postId: notification.post_id ?? null,
      },
    });
    if (item) {
      trackActivationEvent({
        event: "next_action_clicked",
        metadata: {
          actionKey: item.actionKey,
          label: item.cta,
          source,
          notificationId: notification.id,
          type: notification.type,
          postId: notification.post_id ?? null,
        },
      });
    }
  };

  /**
   * Opening a notification is what marks it read. Before this, the only way to
   * clear the badge was the bulk "Mark all read" button, so an inbox you had
   * worked through still reported every item as new.
   */
  const handleOpen = (source: string, item?: ActionInboxItem) => {
    trackNotificationAction(source, item);
    onOpen?.(notification.id);
  };

  const avatar = (
    <NotificationAvatar
      type={notification.type}
      avatarUrl={notification.actor?.avatar_url}
    />
  );

  const body = (
    <>
      {avatar}
      <div className="min-w-0 flex-1">
        {inboxItem ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {inboxItem.label}
          </p>
        ) : null}
        <p className="mt-0.5 text-sm leading-snug text-gray-700">{message}</p>
        <p className="mt-1 text-xs text-gray-500">
          <time
            dateTime={notification.created_at}
            title={new Date(notification.created_at).toLocaleString()}
          >
            {formatRelativeTime(notification.created_at)}
          </time>
        </p>
        {inboxItem && notification.type !== "co_author_invite" ? (
          <p className="mt-2 text-xs font-semibold text-emerald-700">
            {inboxItem.cta}
          </p>
        ) : null}
      </div>
    </>
  );

  // The dismiss control is a sibling of the link, never a descendant: a <button>
  // nested inside an <a> is invalid markup and leaves keyboard users unable to
  // reach it. It stays visible rather than appearing on hover, because a
  // hover-only affordance is unreachable on touch.
  const rowControls = (
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
          className="cursor-pointer rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      ) : null}
    </div>
  );

  // LEGACY COMPATIBILITY — existing co-authored publications. Invitation rows already in an inbox
  // still render with their own copy, but co-authoring is removed and they can
  // no longer be answered, so they carry no call to action and open nothing.
  const isInvite = notification.type === "co_author_invite";

  const row = (
    <div
      className={`flex items-start gap-3 px-4 py-4 transition-colors ${
        !isRead ? "bg-emerald-50 hover:bg-emerald-100/50" : "hover:bg-canvas"
      }`}
    >
      {link && !isInvite ? (
        <Link
          href={link}
          onClick={() => handleOpen("notifications_page", inboxItem)}
          className="flex min-w-0 flex-1 items-start gap-3"
        >
          {body}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
      )}
      {rowControls}
    </div>
  );

  return row;
}

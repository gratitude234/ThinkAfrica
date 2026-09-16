"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Toast from "@/components/ui/Toast";
import {
  dismissNotificationAction,
  markAllNotificationsReadAction,
  restoreUnreadAction,
  undismissNotificationAction,
} from "@/lib/notificationActions";
import { markNotificationRead } from "@/lib/notificationRead";
import { sectionsFromNotifications, type NotificationData } from "@/lib/notificationShape";
import NotificationItem from "./NotificationItem";

type FilterKey = "all" | "unread";

interface UndoState {
  actionLabel: string;
  run: () => Promise<void>;
}

export default function NotificationsPageClient({
  notifications: initialNotifications,
}: {
  notifications: NotificationData[];
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [toast, setToast] = useState<{ message: string; undo?: UndoState } | null>(null);
  const pendingWrites = useRef(0);

  const runWrite = useCallback(async <T,>(write: () => Promise<T>): Promise<T> => {
    pendingWrites.current += 1;
    try {
      return await write();
    } finally {
      pendingWrites.current -= 1;
    }
  }, []);

  const refresh = useCallback(async () => {
    if (pendingWrites.current > 0) return;
    try {
      const response = await fetch("/api/notifications?limit=50");
      if (!response.ok) return;
      const body = (await response.json()) as { notifications: NotificationData[] | null };
      if (body.notifications && pendingWrites.current === 0) {
        setNotifications(body.notifications);
      }
    } catch {
      // Keep the current inbox during a transient refresh failure.
    }
  }, []);

  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 30_000);
    return () => clearInterval(poll);
  }, [refresh]);

  // Catch up on returning to the tab, since polling paused while it was hidden.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  const unreadCount = notifications.filter((item) => !item.read).length;
  const visibleNotifications = useMemo(
    () => activeFilter === "unread" ? notifications.filter((item) => !item.read) : notifications,
    [activeFilter, notifications]
  );
  const sections = useMemo(
    () => sectionsFromNotifications(visibleNotifications),
    [visibleNotifications]
  );

  const handleOpen = useCallback((notificationId: string) => {
    const target = notifications.find((item) => item.id === notificationId);
    if (!target || target.read) return;
    setNotifications((current) => current.map((item) =>
      item.id === notificationId ? { ...item, read: true } : item
    ));
    void runWrite(async () => {
      try {
        await markNotificationRead(notificationId);
      } catch {
        setNotifications((current) => current.map((item) =>
          item.id === notificationId ? { ...item, read: false } : item
        ));
      }
    });
  }, [notifications, runWrite]);

  const handleDismiss = useCallback((notificationId: string) => {
    const target = notifications.find((item) => item.id === notificationId);
    if (!target) return;
    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    void runWrite(async () => {
      const result = await dismissNotificationAction(notificationId);
      if (result.error) {
        setNotifications((current) => [...current, target].sort((left, right) =>
          right.created_at.localeCompare(left.created_at)
        ));
        setToast({ message: `Could not dismiss notification: ${result.error}` });
        return;
      }
      setToast({
        message: "Notification dismissed",
        undo: {
          actionLabel: "Undo",
          run: async () => {
            const undoResult = await runWrite(() => undismissNotificationAction(notificationId));
            if (undoResult.error) {
              setToast({ message: `Could not undo: ${undoResult.error}` });
              return;
            }
            await refresh();
          },
        },
      });
    });
  }, [notifications, refresh, runWrite]);

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = notifications.filter((item) => !item.read).map((item) => item.id);
    if (unreadIds.length === 0) return;
    setMarkingAllRead(true);
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    const restoreUnread = () =>
      setNotifications((current) => current.map((item) =>
        unreadIds.includes(item.id) ? { ...item, read: false } : item
      ));
    try {
      const result = await runWrite(markAllNotificationsReadAction);
      if (result.error) {
        restoreUnread();
        setToast({ message: `Failed to mark notifications as read: ${result.error}` });
        return;
      }
      // Prefer the ids the database actually changed; fall back to what was
      // unread on screen if the update returned no representation.
      const affectedIds = result.affectedIds.length > 0 ? result.affectedIds : unreadIds;
      setToast({
        message: `Marked ${affectedIds.length} notification${affectedIds.length === 1 ? "" : "s"} read`,
        undo: {
          actionLabel: "Undo",
          run: async () => {
            const undoResult = await runWrite(() => restoreUnreadAction(affectedIds));
            if (undoResult.error) {
              setToast({
                message: undoResult.conflict
                  ? "Could not undo: some of those notifications have newer activity."
                  : `Could not undo: ${undoResult.error}`,
              });
              await refresh();
              return;
            }
            await refresh();
          },
        },
      });
    } catch {
      restoreUnread();
      setToast({ message: "Failed to mark notifications as read." });
    } finally {
      setMarkingAllRead(false);
    }
  }, [notifications, refresh, runWrite]);

  return (
    <>
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="mt-2 text-sm text-gray-600">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You are all caught up."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAllRead}
              className="text-xs font-medium text-emerald-700 hover:underline disabled:opacity-60"
            >
              {markingAllRead ? "Marking…" : "Mark all read"}
            </button>
          ) : null}
          <Link href="/settings?tab=notifications" className="text-xs font-medium text-gray-500 hover:text-gray-700">
            Settings
          </Link>
        </div>
      </header>

      <div className="mb-4 flex gap-2" role="group" aria-label="Filter notifications">
        {(["all", "unread"] as const).map((filter) => (
          <button
            key={filter}
            type="button"
            onClick={() => setActiveFilter(filter)}
            aria-pressed={activeFilter === filter}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              activeFilter === filter ? "bg-emerald-brand text-white" : "border border-gray-200 bg-white text-gray-700"
            }`}
          >
            {filter === "all" ? "All" : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {sections.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-16 text-center">
          <p className="font-medium text-gray-700">
            {activeFilter === "unread" ? "No unread notifications" : "No notifications yet"}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Follow writers and join conversations to see updates here.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {sections.map((section) => (
            <section key={section.label} aria-labelledby={`notifications-${section.label.replace(/\s+/g, "-").toLowerCase()}`}>
              <h2 id={`notifications-${section.label.replace(/\s+/g, "-").toLowerCase()}`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {section.label}
              </h2>
              <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
                {section.items.map((notification) => (
                  <NotificationItem
                    key={notification.id}
                    notification={notification}
                    onOpen={handleOpen}
                    onDismiss={handleDismiss}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {toast ? (
        <Toast
          message={toast.message}
          actionLabel={toast.undo?.actionLabel}
          onAction={toast.undo ? () => void toast.undo?.run() : undefined}
          onDone={() => setToast(null)}
        />
      ) : null}
    </>
  );
}
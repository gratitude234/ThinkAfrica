"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";
import { getActionInboxSummary, type ActionInboxItem } from "@/lib/actionInbox";
import {
  dismissNotification,
  markAllNotificationsRead,
  markNotificationsRead,
  restoreUnread,
  undismissNotification,
} from "@/lib/notificationMutations";
import { trackActivationEvent } from "@/lib/activationEvents";
import { formatRelativeTime } from "@/lib/utils";
import NotificationItem from "./NotificationItem";
import {
  fetchNotificationRows,
  sectionsFromNotifications,
  type NotificationData,
} from "./notificationData";

interface NotificationsPageClientProps {
  userId: string;
  notifications: NotificationData[];
}

type FilterKey = "needs_attention" | "responses" | "review" | "opportunities" | "activity";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "responses", label: "Responses" },
  { key: "review", label: "Review" },
  { key: "opportunities", label: "Opportunities" },
  { key: "activity", label: "Activity" },
];

interface UndoState {
  message: string;
  actionLabel: string;
  run: () => Promise<void>;
}

function trackAction(item: ActionInboxItem, source: string) {
  trackActivationEvent({
    event: "next_action_clicked",
    metadata: {
      actionKey: item.actionKey,
      label: item.cta,
      source,
      notificationId: item.notificationId,
      type: item.type,
      postId: item.postId,
    },
  });
  trackActivationEvent({
    event: "notification_opened",
    metadata: {
      notificationId: item.notificationId,
      type: item.type,
      source,
      postId: item.postId,
    },
  });
}

export default function NotificationsPageClient({
  userId,
  notifications: initialNotifications,
}: NotificationsPageClientProps) {
  // One flat, authoritative list. Date sections and the action summary are both
  // derived from it, so marking one row read cannot leave the header count, the
  // hero and the list disagreeing with each other.
  const [notifications, setNotifications] = useState(initialNotifications);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("needs_attention");
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [toast, setToast] = useState<
    { message: string; undo?: UndoState } | null
  >(null);

  // Suppress the poller while a mutation is in flight, otherwise a refetch that
  // started before the write lands can overwrite the optimistic update with stale
  // server rows and make the row visibly "un-read" itself.
  const pendingWrites = useRef(0);

  const supabase = useMemo(() => createClient(), []);

  const refresh = useCallback(async () => {
    if (pendingWrites.current > 0) return;
    const { rows, error } = await fetchNotificationRows(supabase, userId);
    // Leave the currently-displayed notifications alone on a transient fetch
    // failure rather than wiping them out with an empty result.
    if (error) return;
    if (pendingWrites.current > 0) return;
    setNotifications(rows);
  }, [supabase, userId]);

  // Unconditional polling — this page has no realtime subscription of its own, and
  // `notifications` stays out of the Realtime publication regardless of the
  // shouldUseRealtime() flag (see NotificationBell.tsx for the same reasoning).
  useEffect(() => {
    const poll = setInterval(() => {
      void refresh();
    }, 30_000);

    return () => clearInterval(poll);
  }, [refresh]);

  const runWrite = useCallback(async <T,>(write: () => Promise<T>): Promise<T> => {
    pendingWrites.current += 1;
    try {
      return await write();
    } finally {
      pendingWrites.current -= 1;
    }
  }, []);

  const unreadCount = notifications.filter((item) => !item.read).length;
  const summary = useMemo(
    () => getActionInboxSummary(notifications),
    [notifications]
  );

  /**
   * Only a notification that actually asks something of the reader is promoted
   * into the hero. Previously this was just the newest unread row, so a single new
   * follower rendered as a full-width "NEEDS ATTENTION" banner.
   */
  const heroItem = summary.primaryActionable;

  const categoryByNotificationId = useMemo(
    () => new Map(summary.items.map((item) => [item.notificationId, item.category])),
    [summary]
  );

  // The hero already renders this notification in full above the list; rendering
  // it again below is what made the page look like a duplicate of itself.
  const listNotifications = useMemo(
    () => notifications.filter((item) => item.id !== heroItem?.notificationId),
    [notifications, heroItem]
  );

  const visibleSections = useMemo(
    () =>
      sectionsFromNotifications(
        listNotifications.filter((item) => {
          if (activeFilter === "needs_attention") return !item.read;
          return categoryByNotificationId.get(item.id) === activeFilter;
        })
      ),
    [listNotifications, activeFilter, categoryByNotificationId]
  );

  // Counted over the same set the list renders, so a chip can never advertise
  // items that clicking it will not show.
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      needs_attention: 0,
      responses: 0,
      review: 0,
      opportunities: 0,
      activity: 0,
    };
    for (const item of listNotifications) {
      if (!item.read) counts.needs_attention += 1;
      const category = categoryByNotificationId.get(item.id);
      if (category && category !== "needs_attention") counts[category] += 1;
    }
    return counts;
  }, [listNotifications, categoryByNotificationId]);

  const handleOpen = useCallback(
    (notificationId: string) => {
      const target = notifications.find((item) => item.id === notificationId);
      if (!target || target.read) return;

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId ? { ...item, read: true } : item
        )
      );

      void runWrite(async () => {
        const { error } = await markNotificationsRead(supabase, userId, [
          notificationId,
        ]);
        if (error) {
          // Put it back rather than showing a cleared badge that the server
          // does not agree with.
          setNotifications((current) =>
            current.map((item) =>
              item.id === notificationId ? { ...item, read: false } : item
            )
          );
        }
      });
    },
    [notifications, runWrite, supabase, userId]
  );

  const handleDismiss = useCallback(
    (notificationId: string) => {
      const target = notifications.find((item) => item.id === notificationId);
      if (!target) return;

      setNotifications((current) =>
        current.filter((item) => item.id !== notificationId)
      );

      void runWrite(async () => {
        const { error } = await dismissNotification(
          supabase,
          userId,
          notificationId
        );

        if (error) {
          setNotifications((current) =>
            [...current, target].sort(
              (left, right) =>
                new Date(right.created_at).getTime() -
                new Date(left.created_at).getTime()
            )
          );
          setToast({ message: `Could not dismiss notification: ${error}` });
          return;
        }

        setToast({
          message: "Notification dismissed",
          undo: {
            message: "Notification dismissed",
            actionLabel: "Undo",
            run: async () => {
              const result = await runWrite(() =>
                undismissNotification(supabase, userId, notificationId)
              );
              if (result.error) {
                setToast({ message: `Could not undo: ${result.error}` });
                return;
              }
              await refresh();
            },
          },
        });
      });
    },
    [notifications, refresh, runWrite, supabase, userId]
  );

  const handleMarkAllRead = useCallback(async () => {
    setMarkingAllRead(true);
    const previouslyUnread = notifications
      .filter((item) => !item.read)
      .map((item) => item.id);

    setNotifications((current) => current.map((item) => ({ ...item, read: true })));

    try {
      const { error, affectedIds } = await runWrite(() =>
        markAllNotificationsRead(supabase, userId)
      );

      if (error) {
        setNotifications((current) =>
          current.map((item) =>
            previouslyUnread.includes(item.id) ? { ...item, read: false } : item
          )
        );
        setToast({ message: `Failed to mark notifications as read: ${error}` });
        return;
      }

      // Prefer the ids the database actually changed; fall back to what we saw as
      // unread if the update returned no representation.
      const undoableIds = affectedIds.length > 0 ? affectedIds : previouslyUnread;
      if (undoableIds.length === 0) return;

      setToast({
        message: `Marked ${undoableIds.length} notification${
          undoableIds.length === 1 ? "" : "s"
        } read`,
        undo: {
          message: "Marked read",
          actionLabel: "Undo",
          run: async () => {
            const result = await runWrite(() =>
              restoreUnread(supabase, userId, undoableIds)
            );
            if (result.error) {
              setToast({
                message: result.conflict
                  ? "Could not undo — some of those notifications have newer activity."
                  : `Could not undo: ${result.error}`,
              });
              await refresh();
              return;
            }
            await refresh();
          },
        },
      });
    } catch {
      setNotifications((current) =>
        current.map((item) =>
          previouslyUnread.includes(item.id) ? { ...item, read: false } : item
        )
      );
      setToast({ message: "Failed to mark notifications as read." });
    } finally {
      setMarkingAllRead(false);
    }
  }, [notifications, refresh, runWrite, supabase, userId]);

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Action inbox</h1>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {unreadCount > 0
                ? `${unreadCount} new notification${unreadCount === 1 ? "" : "s"}`
                : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAllRead}
              className="cursor-pointer text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700 disabled:opacity-60"
            >
              {markingAllRead ? "Marking..." : "Mark all read"}
            </button>
          ) : null}
        </div>
      </div>

      {heroItem ? (
        <section className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Needs attention
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-950">
                {heroItem.label}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
                {heroItem.description}
              </p>
              <p className="mt-2 text-xs text-gray-500">
                <time
                  dateTime={heroItem.createdAt}
                  title={new Date(heroItem.createdAt).toLocaleString()}
                >
                  {formatRelativeTime(heroItem.createdAt)}
                </time>
              </p>
              {summary.staleUnreadCount > 0 ? (
                <p className="mt-2 text-xs font-medium text-amber-700">
                  {summary.staleUnreadCount} unread item
                  {summary.staleUnreadCount === 1 ? "" : "s"} older than 7 days
                </p>
              ) : null}
            </div>
            <Link
              href={heroItem.href}
              onClick={() => {
                trackAction(heroItem, "notifications_inbox");
                handleOpen(heroItem.notificationId);
              }}
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
            >
              {heroItem.cta}
            </Link>
          </div>
        </section>
      ) : null}

      {listNotifications.length === 0 ? (
        // When the hero is the entire inbox, it already says everything there is
        // to say — an "all caught up" panel underneath it would contradict it.
        heroItem ? null : (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
            All caught up
          </p>
          <p className="mt-2 font-medium text-gray-700">No notifications yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Return to the feed, follow credible writers, or keep building your next draft.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/?tab=latest"
              className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-[#0E4B37]"
            >
              Read latest
            </Link>
            <Link
              href="/onboarding?step=follow"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-canvas"
            >
              Follow writers
            </Link>
            <Link
              href="/write"
              className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-canvas"
            >
              Continue writing
            </Link>
          </div>
        </div>
        )
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const count = filterCounts[filter.key];
              const isActive = activeFilter === filter.key;
              return (
                <button
                  key={filter.key}
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => setActiveFilter(filter.key)}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-canvas"
                  }`}
                >
                  {count > 0 ? `${filter.label} (${count})` : filter.label}
                </button>
              );
            })}
          </div>

          {visibleSections.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
              {visibleSections.map((section) => (
                <div key={section.label}>
                  <div className="border-b border-gray-100 bg-canvas px-4 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      {section.label}
                    </p>
                  </div>
                  {section.items.map((notification) => (
                    <NotificationItem
                      key={notification.id}
                      notification={notification}
                      onOpen={handleOpen}
                      onDismiss={handleDismiss}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-gray-700">Nothing in this view.</p>
              <p className="mt-1 text-sm text-gray-500">
                {activeFilter === "needs_attention"
                  ? "You are caught up. Switch filters to revisit what has already been read."
                  : "Try another filter to see the rest of your inbox."}
              </p>
            </div>
          )}
        </>
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

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";
import {
  getActionInboxSummary,
  type ActionInboxCategory,
  type ActionInboxItem,
} from "@/lib/actionInbox";
import {
  dismissNotification,
  markAllNotificationsRead,
  restoreUnread,
  undismissNotification,
} from "@/lib/notificationMutations";
import { markNotificationRead } from "@/lib/notificationRead";
import { trackActivationEvent } from "@/lib/activationEvents";
import { formatRelativeTime } from "@/lib/utils";
import NotificationItem from "./NotificationItem";
import {
  fetchNotificationRows,
  sectionsFromNotifications,
  type NotificationData,
} from "@/lib/notificationData";
import { isAuthorSubscriptionsUxV2Enabled } from "@/lib/featureFlags";

interface NotificationsPageClientProps {
  userId: string;
  notifications: NotificationData[];
  /** Types this reader has muted in Settings. Applied to the poller's refetch too. */
  mutedTypes: string[];
}

/**
 * "all" and "unread" are states; the rest are categories. They are separate kinds
 * of thing, which is why the old single "needs_attention" key -- a state pretending
 * to be a category -- had to be special-cased everywhere it was touched.
 */
type FilterKey =
  | "all"
  | "unread"
  | "needs_attention"
  | ActionInboxCategory;

const BASE_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
  { key: "responses", label: "Responses" },
  { key: "review", label: "Review" },
  { key: "opportunities", label: "Opportunities" },
  { key: "activity", label: "Activity" },
];

const V2_FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "subscriptions", label: "Subscriptions" },
  ...BASE_FILTERS,
];

function initialFilter(
  notifications: NotificationData[],
  subscriptionUxEnabled: boolean
): FilterKey {
  if (!subscriptionUxEnabled) return "all";
  const summary = getActionInboxSummary(notifications);
  if (summary.unreadActionCount > 0) return "needs_attention";
  if (summary.items.some((item) => item.category === "subscriptions")) {
    return "subscriptions";
  }
  return "activity";
}

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
  mutedTypes,
}: NotificationsPageClientProps) {
  // One flat, authoritative list. Date sections and the action summary are both
  // derived from it, so marking one row read cannot leave the header count, the
  // hero and the list disagreeing with each other.
  const [notifications, setNotifications] = useState(initialNotifications);
  const subscriptionUxEnabled = isAuthorSubscriptionsUxV2Enabled();
  const filters = subscriptionUxEnabled ? V2_FILTERS : BASE_FILTERS;
  const [activeFilter, setActiveFilter] = useState<FilterKey>(() =>
    initialFilter(initialNotifications, subscriptionUxEnabled)
  );
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
    const { rows, error } = await fetchNotificationRows(
      supabase,
      userId,
      50,
      mutedTypes
    );
    // Leave the currently-displayed notifications alone on a transient fetch
    // failure rather than wiping them out with an empty result.
    if (error) return;
    if (pendingWrites.current > 0) return;
    setNotifications(rows);
  }, [supabase, userId, mutedTypes]);

  // Polling — this page has no realtime subscription of its own, and `notifications`
  // stays out of the Realtime publication regardless of the shouldUseRealtime() flag
  // (see NotificationBell.tsx for the same reasoning).
  //
  // Gated on visibility so a backgrounded tab stops issuing requests, and because
  // the bell polls too: on this page that was two independent 30s pollers running
  // forever whether or not anyone was looking.
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh();
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
          if (activeFilter === "all") return true;
          if (activeFilter === "unread") return !item.read;
          if (activeFilter === "needs_attention") {
            const inboxItem = summary.items.find(
              (candidate) => candidate.notificationId === item.id
            );
            return !item.read && inboxItem?.requiresAction === true;
          }
          return categoryByNotificationId.get(item.id) === activeFilter;
        })
      ),
    [listNotifications, activeFilter, categoryByNotificationId, summary.items]
  );

  /**
   * Every count answers the same question: how many rows will I see if I tap this?
   *
   * They previously did not. "Needs attention" counted unread only while the four
   * category chips counted read and unread alike, so the same three notifications
   * were advertised as "Needs attention (3)" and "Activity (3)" by two different
   * rules. Counting over exactly the set the list renders makes them comparable.
   */
  const filterCounts = useMemo(() => {
    const counts: Record<FilterKey, number> = {
      all: listNotifications.length,
      unread: 0,
      needs_attention: summary.unreadActionCount,
      responses: 0,
      review: 0,
      opportunities: 0,
      subscriptions: 0,
      activity: 0,
    };
    for (const item of listNotifications) {
      if (!item.read) counts.unread += 1;
      const category = categoryByNotificationId.get(item.id);
      if (category) counts[category] += 1;
    }
    return counts;
  }, [listNotifications, categoryByNotificationId, summary.unreadActionCount]);

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
        try {
          await markNotificationRead(notificationId);
        } catch {
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
    [notifications, runWrite]
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
                  ? "Could not undo: some of those notifications have newer activity."
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
          <div className="flex shrink-0 items-center gap-3">
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
            {/* Neither this page nor the bell used to link anywhere you could
                turn notifications down. */}
            <Link
              href="/settings?tab=notifications"
              className="text-xs font-medium text-gray-500 transition-colors hover:text-gray-700"
            >
              Settings
            </Link>
          </div>
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
            {filters.map((filter) => {
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
              <p className="font-medium text-gray-700">
                {activeFilter === "unread"
                  ? "You are all caught up."
                  : "Nothing in this view."}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {activeFilter === "unread"
                  ? `Everything here has been read. Your inbox still has ${notifications.length} notification${
                      notifications.length === 1 ? "" : "s"
                    }.`
                  : "This filter has nothing in it right now."}
              </p>
              {/* An empty filter used to be a dead end -- it said "try another
                  filter" without offering one. */}
              <button
                type="button"
                onClick={() => setActiveFilter("all")}
                className="mt-4 cursor-pointer rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-canvas"
              >
                Show all notifications
              </button>
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

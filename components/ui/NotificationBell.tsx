"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { trackActivationEvent } from "@/lib/activationEvents";
import { getActionInboxSummary, type ActionInboxItem } from "@/lib/actionInbox";
import { markAllNotificationsRead } from "@/lib/notificationMutations";
import { markNotificationRead } from "@/lib/notificationRead";
import { notificationHref, notificationMessage } from "@/lib/notificationCatalog";
import NotificationAvatar from "@/components/notifications/NotificationAvatar";
import {
  fetchNotificationRows,
  fetchUnreadCount,
  type NotificationData,
} from "@/lib/notificationData";
import { mutedNotificationTypes } from "@/lib/notificationPreferences";
import { shouldUseRealtime } from "@/lib/realtime";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";

const POLL_MS = 30_000;

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // null until the reader's in-app preferences have loaded. Fetching before then
  // would flash notifications they have muted, then remove them a moment later.
  const [mutedTypes, setMutedTypes] = useState<string[] | null>(null);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const supabase = useMemo(() => createClient(), []);

  const actionSummary = useMemo(
    () => getActionInboxSummary(notifications),
    [notifications]
  );

  // Only a notification that asks something of the reader earns the hero slot; a
  // new follower used to be promoted here purely for being the newest unread row.
  const heroItem = actionSummary.primaryActionable;

  // ...and whatever the hero renders is dropped from the list below it, so a
  // narrow dropdown stops showing the same notification twice.
  const listNotifications = useMemo(
    () =>
      notifications.filter(
        (notification) => notification.id !== heroItem?.notificationId
      ),
    [notifications, heroItem]
  );

  useEffect(() => {
    let cancelled = false;

    void supabase
      .from("profiles")
      .select("notification_prefs")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }: { data: { notification_prefs?: unknown } | null }) => {
        if (cancelled) return;
        // On failure fall back to muting nothing: an unreadable preference should
        // under-filter rather than silently hide a reader's notifications.
        setMutedTypes(mutedNotificationTypes(data?.notification_prefs));
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, userId]);

  const fetchNotifications = useCallback(async () => {
    if (mutedTypes === null) return;

    // The badge count is queried separately rather than derived from these rows:
    // this list is capped at ten, and the unread total is not. Both apply the same
    // mute list, or the badge counts notifications the dropdown will not show.
    const [rowsResult, countResult] = await Promise.all([
      fetchNotificationRows(supabase, userId, 10, mutedTypes),
      fetchUnreadCount(supabase, userId, mutedTypes),
    ]);

    if (!rowsResult.error) setNotifications(rowsResult.rows);
    if (countResult.count !== null) setUnreadCount(countResult.count);
  }, [supabase, userId, mutedTypes]);

  useEffect(() => {
    void fetchNotifications();
  }, [fetchNotifications]);

  // Unconditional polling fallback. `notifications` is excluded from the Realtime
  // publication at the Postgres level regardless of shouldUseRealtime()'s flag check
  // (see 20260521000001_disable_realtime_for_launch_stability.sql), so gating this on
  // that flag would silently stop delivery if Realtime is ever enabled for other
  // tables (e.g. messages) without also being re-enabled for this one.
  //
  // It is gated on visibility, though: a backgrounded tab polled every 30s forever,
  // and on /notifications that ran alongside the page's own poller.
  useEffect(() => {
    const poll = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void fetchNotifications();
    }, POLL_MS);

    return () => clearInterval(poll);
  }, [fetchNotifications]);

  // Catch up immediately on returning to the tab, since polling paused while hidden.
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") void fetchNotifications();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [fetchNotifications]);

  useEffect(() => {
    if (open) void fetchNotifications();
  }, [open, fetchNotifications]);

  useEffect(() => {
    if (!shouldUseRealtime()) {
      return;
    }

    const channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          // Refetch rather than splicing in `payload.new`: a Realtime row carries
          // only the `notifications` columns, with none of the joined actor/post
          // fields the copy and link fallbacks are built from, so the spliced row
          // would render as "Someone ..." with no destination.
          void fetchNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, fetchNotifications]);

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // pointerdown rather than mousedown: mousedown never fires for a touch tap that
  // does not resolve to a click, so tapping outside the panel on a phone did not
  // reliably dismiss it.
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        close();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        close(true);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  // Move focus into the panel on open so keyboard and screen-reader users land in
  // the notifications rather than continuing through the nav behind them.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  async function markAllRead() {
    const previouslyUnread = notifications
      .filter((notification) => !notification.read)
      .map((notification) => notification.id);
    const previousCount = unreadCount;

    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, read: true }))
    );
    setUnreadCount(0);

    const { error } = await markAllNotificationsRead(supabase, userId);

    // Previously this ignored the result entirely and cleared the badge even when
    // the write failed, leaving the UI asserting something the server disagreed with.
    if (error) {
      setNotifications((prev) =>
        prev.map((notification) =>
          previouslyUnread.includes(notification.id)
            ? { ...notification, read: false }
            : notification
        )
      );
      setUnreadCount(previousCount);
    }
  }

  /**
   * Opening a notification marks it read. Without this the badge only ever cleared
   * via "Mark all as read", so a notification the reader had already acted on kept
   * counting against them.
   */
  function markOneRead(notificationId: string) {
    const target = notifications.find(
      (notification) => notification.id === notificationId
    );
    if (!target || target.read) return;

    setNotifications((prev) =>
      prev.map((notification) =>
        notification.id === notificationId
          ? { ...notification, read: true }
          : notification
      )
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    void markNotificationRead(notificationId).catch(() => {
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === notificationId
            ? { ...notification, read: false }
            : notification
        )
      );
      setUnreadCount((count) => count + 1);
    });
  }

  function trackOpen(notification: NotificationData) {
    trackActivationEvent({
      event: "notification_opened",
      metadata: {
        notificationId: notification.id,
        type: notification.type,
        source: "notification_bell",
      },
    });
  }

  function trackAction(item: ActionInboxItem) {
    trackActivationEvent({
      event: "next_action_clicked",
      metadata: {
        actionKey: item.actionKey,
        label: item.cta,
        source: "notification_bell",
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
        source: "notification_bell",
        postId: item.postId,
      },
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
      >
        <svg
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 ? (
          <span
            aria-hidden="true"
            className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {/* The badge is aria-hidden decoration; this is what actually announces. */}
      <span className="sr-only" role="status" aria-live="polite">
        {unreadCount > 0 ? `${unreadCount} unread notifications` : ""}
      </span>

      {open ? (
        <>
          {/* Dims the page behind the mobile sheet and gives a large dismiss target. */}
          <div
            aria-hidden="true"
            onClick={() => close()}
            className="fixed inset-0 z-40 bg-black/20 sm:hidden"
          />

          <div
            id={panelId}
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-label="Notifications"
            className="fixed inset-x-3 top-[calc(var(--app-nav-height,60px)+0.5rem)] z-50 rounded-xl border border-gray-200 bg-white shadow-lg outline-none sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
              <span className="text-sm font-semibold text-gray-900">
                Notifications
              </span>
              <div className="flex items-center gap-3">
                {unreadCount > 0 ? (
                  <button
                    type="button"
                    onClick={markAllRead}
                    className="cursor-pointer text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Mark all as read
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => close(true)}
                  aria-label="Close notifications"
                  className="cursor-pointer rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 sm:hidden"
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="max-h-[65vh] divide-y divide-gray-50 overflow-y-auto overscroll-contain sm:max-h-80">
              {notifications.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-gray-400">
                  <p>No notifications yet</p>
                  <Link
                    href="/?tab=latest"
                    onClick={() => close()}
                    className="mt-3 inline-flex text-xs font-medium text-emerald-600 hover:text-emerald-700"
                  >
                    Read latest posts
                  </Link>
                </div>
              ) : (
                <>
                  {heroItem ? (
                    <div className="px-3 py-3">
                      <Link
                        href={heroItem.href}
                        onClick={() => {
                          trackAction(heroItem);
                          markOneRead(heroItem.notificationId);
                          close();
                        }}
                        className="block rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2 transition-colors hover:bg-emerald-100/60"
                      >
                        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
                          Needs attention
                        </p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">
                          {heroItem.label}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs leading-5 text-gray-600">
                          {heroItem.description}
                        </p>
                        <p className="mt-1 text-xs text-gray-400">
                          <time dateTime={heroItem.createdAt}>
                            {formatRelativeTime(heroItem.createdAt)}
                          </time>
                        </p>
                        <p className="mt-2 text-xs font-semibold text-emerald-700">
                          {heroItem.cta}
                        </p>
                      </Link>
                    </div>
                  ) : null}
                  {listNotifications.map((notification) => {
                    // Resolved through the catalog, so a follow or like created
                    // without an explicit `link` is still reachable here. This used
                    // to read `notification.link` directly, leaving those rows dead.
                    const href = notificationHref(notification);
                    const inner = (
                      <div className="flex items-start gap-3">
                        <NotificationAvatar
                          type={notification.type}
                          avatarUrl={notification.actor?.avatar_url}
                        />
                        <div className="min-w-0 flex-1">
                          {(notification.type === "author_published" ||
                            notification.type === "topic_published") &&
                          notification.post_content_kind ? (
                            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                              {notification.post_content_kind}
                            </p>
                          ) : null}
                          <p className="text-sm leading-snug text-gray-700">
                            {notificationMessage(notification)}
                          </p>
                          <p className="mt-1 text-xs text-gray-400">
                            <time
                              dateTime={notification.created_at}
                              title={new Date(
                                notification.created_at
                              ).toLocaleString()}
                            >
                              {formatRelativeTime(notification.created_at)}
                            </time>
                          </p>
                        </div>
                        {!notification.read ? (
                          <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500">
                            <span className="sr-only">Unread</span>
                          </span>
                        ) : null}
                      </div>
                    );

                    return (
                      <div
                        key={notification.id}
                        className={`px-4 py-3 transition-colors ${
                          !notification.read ? "bg-emerald-50" : "hover:bg-canvas"
                        }`}
                      >
                        {href ? (
                          <Link
                            href={href}
                            onClick={() => {
                              trackOpen(notification);
                              markOneRead(notification.id);
                              close();
                            }}
                          >
                            {inner}
                          </Link>
                        ) : (
                          inner
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>

            <div className="border-t border-gray-100 px-4 py-2.5">
              <Link
                href="/notifications"
                onClick={() => close()}
                className="block text-center text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                View all notifications &rarr;
              </Link>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";
import {
  getActionInboxSummary,
  type ActionInboxCategory,
  type ActionInboxItem,
} from "@/lib/actionInbox";
import { trackActivationEvent } from "@/lib/activationEvents";
import { shouldUseRealtime } from "@/lib/realtime";
import NotificationItem from "./NotificationItem";
import {
  fetchNotificationRows,
  sectionsFromNotifications,
  type NotificationSection,
} from "./notificationData";

interface NotificationsPageClientProps {
  userId: string;
  initialUnreadCount: number;
  sections: NotificationSection[];
}

type FilterKey = "needs_attention" | "responses" | "review" | "opportunities" | "activity";

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: "needs_attention", label: "Needs attention" },
  { key: "responses", label: "Responses" },
  { key: "review", label: "Review" },
  { key: "opportunities", label: "Opportunities" },
  { key: "activity", label: "Activity" },
];

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

function ActionCard({
  item,
  source,
  primary = false,
}: {
  item: ActionInboxItem;
  source: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={() => trackAction(item, source)}
      className={`block rounded-xl border transition-colors ${
        primary
          ? "border-emerald-200 bg-emerald-50 p-4 hover:bg-emerald-100/60"
          : "border-gray-200 bg-white p-3 hover:bg-canvas"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">{item.label}</p>
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-gray-600">
            {item.description}
          </p>
        </div>
        {!item.read ? (
          <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        ) : null}
      </div>
      <p className="mt-3 text-xs font-semibold text-emerald-700">{item.cta}</p>
    </Link>
  );
}

export default function NotificationsPageClient({
  userId,
  initialUnreadCount,
  sections,
}: NotificationsPageClientProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [localSections, setLocalSections] = useState(sections);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("needs_attention");
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    const rows = await fetchNotificationRows(supabase, userId);
    setLocalSections(sectionsFromNotifications(rows));
    setUnreadCount(rows.filter((notification) => !notification.read).length);
  }, [userId]);

  // Polling fallback since this page has no realtime subscription of its own.
  useEffect(() => {
    if (shouldUseRealtime()) return;

    const poll = setInterval(() => {
      void refresh();
    }, 30_000);

    return () => clearInterval(poll);
  }, [refresh]);

  const notifications = localSections.flatMap((section) => section.items);
  const summary = useMemo(
    () => getActionInboxSummary(notifications),
    [notifications]
  );
  const categoryByNotificationId = new Map(
    summary.items.map((item) => [item.notificationId, item.category])
  );
  const visibleSections = localSections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => {
        const category = categoryByNotificationId.get(item.id);
        if (activeFilter === "needs_attention") return !item.read;
        return category === activeFilter;
      }),
    }))
    .filter((section) => section.items.length > 0);
  const secondaryActions = summary.items
    .filter((item) => !item.read && item.notificationId !== summary.primaryAction?.notificationId)
    .slice(0, 3);

  const handleMarkAllRead = async () => {
    setMarkingAllRead(true);

    try {
      const supabase = createClient();
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("user_id", userId)
        .eq("read", false);

      if (error) {
        setToastMessage(`Failed to mark notifications as read: ${error.message}`);
      } else {
        setUnreadCount(0);
        setLocalSections((current) =>
          current.map((section) => ({
            ...section,
            items: section.items.map((item) => ({ ...item, read: true })),
          }))
        );
      }
    } catch {
      setToastMessage("Failed to mark notifications as read.");
    } finally {
      setMarkingAllRead(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Action inbox</h1>
            <p className="mt-2 text-sm font-semibold text-gray-900">
              {unreadCount > 0 ? `${unreadCount} new notifications` : "All caught up"}
            </p>
          </div>
          {unreadCount > 0 ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingAllRead}
              className="cursor-pointer text-xs font-medium text-emerald-600 transition-colors hover:text-emerald-700 disabled:opacity-60"
            >
              {markingAllRead ? "Marking..." : "Mark all read"}
            </button>
          ) : null}
        </div>
      </div>

      {summary.primaryAction ? (
        <section className="mb-6 rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                Needs attention
              </p>
              <h2 className="mt-1 text-lg font-semibold text-gray-950">
                {summary.primaryAction.label}
              </h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-600">
                {summary.primaryAction.description}
              </p>
            </div>
            <Link
              href={summary.primaryAction.href}
              onClick={() =>
                trackAction(summary.primaryAction as ActionInboxItem, "notifications_inbox")
              }
              className="inline-flex shrink-0 items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#0E4B37]"
            >
              {summary.primaryAction.cta}
            </Link>
          </div>
          {secondaryActions.length > 0 ? (
            <div className="mt-4 grid gap-2 md:grid-cols-3">
              {secondaryActions.map((item) => (
                <ActionCard
                  key={item.notificationId}
                  item={item}
                  source="notifications_inbox_secondary"
                />
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {notifications.length === 0 ? (
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
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {FILTERS.map((filter) => {
              const count =
                filter.key === "needs_attention"
                  ? summary.unreadActionCount
                  : summary.items.filter(
                      (item) => item.category === (filter.key as ActionInboxCategory)
                    ).length;
              return (
                <button
                  key={filter.key}
                  type="button"
                  onClick={() => setActiveFilter(filter.key)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    activeFilter === filter.key
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-gray-200 bg-white text-gray-500 hover:bg-canvas"
                  }`}
                >
                  {filter.label} {count > 0 ? `(${count})` : ""}
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
                    <NotificationItem key={notification.id} notification={notification} />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white px-6 py-12 text-center">
              <p className="font-medium text-gray-700">Nothing in this view.</p>
              <p className="mt-1 text-sm text-gray-500">
                Try another filter or mark everything read when you are caught up.
              </p>
            </div>
          )}
        </>
      )}

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </>
  );
}

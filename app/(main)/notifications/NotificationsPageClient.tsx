"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import Toast from "@/components/ui/Toast";
import NotificationItem from "./NotificationItem";

interface NotificationData {
  id: string;
  type: string;
  read: boolean;
  created_at: string;
  message?: string | null;
  link?: string | null;
  post_id?: string | null;
  actor: { full_name: string | null; username: string; avatar_url?: string | null } | null;
  actor_username: string | null;
  post_title: string | null;
  post_slug: string | null;
}

interface NotificationSection {
  label: string;
  items: NotificationData[];
}

interface NotificationsPageClientProps {
  userId: string;
  initialUnreadCount: number;
  sections: NotificationSection[];
}

export default function NotificationsPageClient({
  userId,
  initialUnreadCount,
  sections,
}: NotificationsPageClientProps) {
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount);
  const [localSections, setLocalSections] = useState(sections);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

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

  const notifications = localSections.flatMap((section) => section.items);

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
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
        <p className="mt-2 text-sm font-semibold text-gray-900">
          {unreadCount > 0 ? `${unreadCount} new notifications` : "All caught up"}
        </p>
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-6 py-20 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
            All caught up
          </p>
          <p className="mt-2 font-medium text-gray-700">No notifications yet</p>
          <p className="mt-1 text-sm text-gray-400">
            Return to the feed, follow credible writers, or keep building your next draft.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link
              href="/?tab=latest"
              className="rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
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
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
          {localSections.map((section) => (
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
      )}

      {toastMessage ? (
        <Toast message={toastMessage} onDone={() => setToastMessage(null)} />
      ) : null}
    </>
  );
}

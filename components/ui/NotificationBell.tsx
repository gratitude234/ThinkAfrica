"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { trackActivationEvent } from "@/lib/activationEvents";
import { createClient } from "@/lib/supabase/client";

interface Notification {
  id: string;
  type: string;
  message: string | null;
  read: boolean;
  link: string | null;
  created_at: string;
}

function timeAgo(dateString: string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(dateString).getTime()) / 1000
  );

  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;

  return `${Math.floor(hours / 24)}d ago`;
}

const TYPE_ICONS: Record<string, string> = {
  like: "<3",
  comment: "...",
  follow: "+",
  debate_reply: "!",
  post_approved: "OK",
  post_published: "P",
  revision_requested: "RE",
  response_post: "RE",
  opportunity_inquiry: "OP",
};

function notificationText(notification: Notification) {
  if (notification.message) return notification.message;

  switch (notification.type) {
    case "follow":
      return "Someone started following you";
    case "like":
      return "Someone liked your post";
    case "comment":
      return "Someone commented on your post";
    case "response_post":
      return "Someone wrote a response to your post";
    case "revision_requested":
      return "A post needs revision";
    case "post_published":
      return "Your post has been published";
    case "opportunity_inquiry":
      return "New opportunity inquiry";
    default:
      return "New notification";
  }
}

export default function NotificationBell({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const supabase = useMemo(() => createClient(), []);

  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    async function fetchNotifications() {
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        setNotifications(data as Notification[]);
      }
    }

    void fetchNotifications();

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
        (payload) => {
          setNotifications((prev) => [
            payload.new as Notification,
            ...prev.slice(0, 9),
          ]);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  async function markAllRead() {
    await supabase
      .from("notifications")
      .update({ read: true })
      .eq("user_id", userId)
      .eq("read", false);

    setNotifications((prev) =>
      prev.map((notification) => ({ ...notification, read: true }))
    );
  }

  function trackOpen(notification: Notification) {
    trackActivationEvent({
      event: "notification_opened",
      metadata: {
        notificationId: notification.id,
        type: notification.type,
        source: "notification_bell",
      },
    });
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative flex h-[34px] w-[34px] items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 hover:bg-canvas hover:text-ink"
        aria-label="Notifications"
      >
        <svg
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="text-sm font-semibold text-gray-900">Notifications</span>
            {unreadCount > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-xs font-medium text-emerald-600 hover:text-emerald-700"
              >
                Mark all as read
              </button>
            ) : null}
          </div>

          <div className="max-h-80 divide-y divide-gray-50 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400">
                <p>No notifications yet</p>
                <Link
                  href="/?tab=latest"
                  onClick={() => setOpen(false)}
                  className="mt-3 inline-flex text-xs font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Read latest posts
                </Link>
              </div>
            ) : (
              notifications.map((notification) => {
                const inner = (
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-600">
                      {TYPE_ICONS[notification.type] ?? "N"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-gray-700">
                        {notificationText(notification)}
                      </p>
                      <p className="mt-1 text-xs text-gray-400">
                        {timeAgo(notification.created_at)}
                      </p>
                    </div>
                    {!notification.read ? (
                      <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-emerald-500" />
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
                    {notification.link ? (
                      <Link
                        href={notification.link}
                        onClick={() => {
                          trackOpen(notification);
                          setOpen(false);
                        }}
                      >
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="border-t border-gray-100 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-emerald-600 hover:text-emerald-700"
            >
              View all notifications -&gt;
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useState, useEffect } from "react";

interface BottomNavProps {
  username: string | null;
  userId: string | null;
}

export default function BottomNav({ username, userId }: BottomNavProps) {
  const pathname = usePathname();
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("read", false)
      .then(({ count }) => setUnreadCount(count ?? 0));
  }, [userId]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const profileHref = username ? `/${username}` : "/settings";
  const profileActive = username
    ? pathname === profileHref || pathname.startsWith(`${profileHref}/`)
    : pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-end justify-around h-16 px-2">
        {/* Home */}
        <Link
          href="/"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 pb-2 ${
            isActive("/") ? "text-emerald-brand" : "text-gray-500"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill={isActive("/") ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10.75L12 3l9 7.75V21H14.75v-5.5h-5.5V21H3V10.75z"
            />
          </svg>
          <span className="text-[10px] font-medium">Home</span>
        </Link>

        {/* Explore */}
        <Link
          href="/search"
          className={`flex flex-col items-center justify-center w-full h-full gap-1 pb-2 ${
            isActive("/search") ? "text-emerald-brand" : "text-gray-500"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span className="text-[10px] font-medium">Explore</span>
        </Link>

        {/* Write */}
        <Link
          href="/write"
          className="flex flex-col items-center justify-center w-full h-full gap-1 text-gray-500"
        >
          <div className="w-12 h-12 rounded-full bg-emerald-brand text-white flex items-center justify-center shadow-md -mt-4">
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 5.5l5 5M5 19l3.5-.5L18 9l-5-5-9.5 9.5L3 17l2 2z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.5 3.5v4m-2-2h4"
              />
            </svg>
          </div>
          <span className="text-[10px] font-medium pb-2">Write</span>
        </Link>

        {/* Notifications */}
        <Link
          href="/notifications"
          className={`relative flex flex-col items-center justify-center w-full h-full gap-1 pb-2 ${
            isActive("/notifications") ? "text-emerald-brand" : "text-gray-500"
          }`}
        >
          <div className="relative">
            <svg
              className="w-5 h-5"
              fill={isActive("/notifications") ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[14px] h-3.5 flex items-center justify-center bg-red-500 text-white text-[9px] font-bold rounded-full px-0.5 leading-none">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </div>
          <span className="text-[10px] font-medium">Notifications</span>
        </Link>

        {/* Profile */}
        <Link
          href={profileHref}
          className={`flex flex-col items-center justify-center w-full h-full gap-1 pb-2 ${
            profileActive ? "text-emerald-brand" : "text-gray-500"
          }`}
        >
          <svg
            className="w-5 h-5"
            fill={profileActive ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 21a8 8 0 10-16 0m12-11a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span className="text-[10px] font-medium">Profile</span>
        </Link>
      </div>
    </nav>
  );
}

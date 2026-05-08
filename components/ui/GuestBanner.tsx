"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const STORAGE_KEY = "ta_guest_banner_dismissed";

export default function GuestBanner() {
  const [visible, setVisible] = useState(false);
  const pathname = usePathname();
  const isReadingPost = pathname.startsWith("/post/");
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];
  const reservedSingleSegmentRoutes = new Set([
    "about",
    "admin",
    "alumni",
    "ambassadors",
    "bookmarks",
    "dashboard",
    "debates",
    "discover",
    "fellowships",
    "leaderboard",
    "login",
    "messages",
    "notifications",
    "onboarding",
    "opportunities",
    "partners",
    "post",
    "privacy",
    "review",
    "settings",
    "signup",
    "stats",
    "talent",
    "terms",
    "topics",
    "webinars",
    "write",
  ]);
  const isProfilePage =
    segments.length === 1 &&
    !!firstSegment &&
    !reservedSingleSegmentRoutes.has(firstSegment);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div
      className={`mb-5 rounded-xl bg-emerald-brand px-3.5 py-3 text-white shadow-sm ${
        isProfilePage
          ? "md:px-4"
          : "md:fixed md:bottom-4 md:left-1/2 md:z-40 md:mb-0 md:w-[92%] md:max-w-xl md:-translate-x-1/2 md:px-4 md:shadow-lg"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm leading-snug">
          Reading as a guest.{" "}
          <Link href="/signup" className="font-semibold underline">
            Sign up
          </Link>{" "}
          {isReadingPost
            ? "to save this post or write a response."
            : "to follow writers and save posts."}
        </p>
        <button
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setVisible(false);
          }}
          aria-label="Dismiss"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
        >
          <span aria-hidden="true">x</span>
        </button>
      </div>
    </div>
  );
}

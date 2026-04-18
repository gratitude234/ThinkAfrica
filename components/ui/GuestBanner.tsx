"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "ta_guest_banner_dismissed";

export default function GuestBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(STORAGE_KEY) !== "1") {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-20 left-1/2 z-40 w-[92%] max-w-xl -translate-x-1/2 rounded-xl bg-emerald-brand px-4 py-3 text-white shadow-lg md:bottom-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm">
          Reading as a guest.{" "}
          <Link href="/signup" className="font-semibold underline">
            Sign up
          </Link>{" "}
          to comment, follow authors, and save posts.
        </p>
        <button
          onClick={() => {
            localStorage.setItem(STORAGE_KEY, "1");
            setVisible(false);
          }}
          aria-label="Dismiss"
          className="text-white/80 hover:text-white"
        >
          x
        </button>
      </div>
    </div>
  );
}

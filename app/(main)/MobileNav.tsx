"use client";

import { useState } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";

interface MobileNavProps {
  user: User | null;
  profile: { username: string; full_name: string | null; points?: number } | null;
  isAdmin?: boolean;
}

export default function MobileNav({ user, profile, isAdmin }: MobileNavProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="md:hidden p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
        aria-label="Toggle menu"
      >
        {open ? (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {open && (
        <div className="md:hidden absolute top-16 left-0 right-0 bg-white border-b border-gray-200 shadow-lg z-40">
          <nav className="px-4 py-3 space-y-1">
            <Link
              href="/"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
            >
              Feed
            </Link>
            <Link
              href="/debates"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
            >
              Debates
            </Link>
            <Link
              href="/leaderboard"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
            >
              Leaderboard
            </Link>
            <Link
              href="/search"
              onClick={() => setOpen(false)}
              className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
            >
              Search
            </Link>
            {user && (
              <>
                <div className="border-t border-gray-100 my-1" />
                <Link
                  href="/write"
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
                >
                  Write
                </Link>
                {profile && (
                  <Link
                    href={`/${profile.username}`}
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Profile
                  </Link>
                )}
                {isAdmin && (
                  <Link
                    href="/admin/review"
                    onClick={() => setOpen(false)}
                    className="block px-3 py-2.5 text-sm font-medium text-gray-700 hover:text-emerald-brand hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    Admin
                  </Link>
                )}
              </>
            )}
          </nav>
        </div>
      )}
    </>
  );
}

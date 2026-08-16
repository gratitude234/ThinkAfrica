"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import type { User } from "@supabase/supabase-js";
import { getUsableProfileUsername } from "@/lib/profileUsername";
import { useSignOut } from "@/lib/useSignOut";
import Button from "@/components/ui/Button";

interface NavUserMenuProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url?: string | null;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin?: boolean;
  canAccessReview?: boolean;
}

export default function NavUserMenu({
  user,
  profile,
  isAdmin,
  canAccessReview,
}: NavUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const displayName =
    profile?.full_name ?? user?.email?.split("@")[0] ?? "Account";
  const profileUsername = getUsableProfileUsername(profile?.username ?? null);
  const profileHref = profileUsername ? `/${profileUsername}` : "/settings";

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const {
    signOut,
    isSigningOut: signOutBusy,
    error: signOutError,
  } = useSignOut();

  const handleSignOut = async () => {
    const signedOut = await signOut();
    if (signedOut) setOpen(false);
  };

  if (!user) {
    return (
      <div className="hidden items-center gap-2 sm:flex">
        <Link href="/login">
          <Button variant="ghost" size="sm">
            Sign in
          </Button>
        </Link>
        <Link href="/signup">
          <Button size="sm">Get started</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 transition-colors hover:text-emerald-brand"
        aria-label="Open account menu"
      >
        {profile?.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.avatar_url}
            alt={displayName}
            className="h-8 w-8 flex-shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[13px] font-semibold text-emerald-800">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-canvas">
            <p className="text-sm font-semibold text-gray-900 truncate">
              {displayName}
            </p>
            <span className="text-xs font-medium text-emerald-700">
              Intellectual Record
            </span>
          </div>
          {profile && (
            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-canvas transition-colors"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              Intellectual Record
            </Link>
          )}
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-canvas transition-colors"
          >
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
            Writing dashboard
          </Link>
          {canAccessReview ? (
            <Link
              href="/review"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-canvas transition-colors"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Review
            </Link>
          ) : null}
          <Link
            href="/bookmarks"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-canvas transition-colors"
          >
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
              />
            </svg>
            Bookmarks
          </Link>
          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-canvas transition-colors"
          >
            <svg
              className="w-4 h-4 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Settings
          </Link>
          {isAdmin && (
            <Link
              href="/admin/review"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-canvas transition-colors"
            >
              <svg
                className="w-4 h-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              Admin
            </Link>
          )}
          <div className="border-t border-gray-100" />
          <button
            onClick={handleSignOut}
            disabled={signOutBusy}
            aria-busy={signOutBusy || undefined}
            className="flex items-center gap-2.5 w-full px-4 py-3 text-sm text-red-600 hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            {signOutBusy ? "Signing out…" : "Sign out"}
          </button>
          {signOutError ? (
            <p className="px-4 pb-3 text-xs leading-5 text-red-600" role="alert">
              {signOutError}
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

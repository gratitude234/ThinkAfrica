"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import NavUserMenu from "./NavUserMenu";
import MobileNav from "./MobileNav";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";
import NotificationBell from "@/components/ui/NotificationBell";
import LiteModeToggle from "@/components/ui/LiteModeToggle";

interface NavClientProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    points?: number;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin: boolean;
  canAccessReview: boolean;
  onOpenSearch: () => void;
}

function navItemClass(isActive: boolean) {
  return `relative rounded-lg px-4 py-2 text-sm transition-colors ${
    isActive
      ? "font-semibold text-emerald-brand"
      : "text-ink-muted hover:bg-canvas hover:text-ink"
  }`;
}

export default function NavClient({
  user,
  profile,
  isAdmin,
  canAccessReview,
  onOpenSearch,
}: NavClientProps) {
  const pathname = usePathname();
  const isHomeActive = pathname === "/";
  const isDiscoverActive =
    pathname === "/topics" || pathname.startsWith("/topics/");
  const isAlumniActive =
    pathname === "/alumni" || pathname.startsWith("/alumni/");
  const isOpportunitiesActive =
    pathname === "/opportunities" || pathname.startsWith("/opportunities/");
  const isMessagesActive =
    pathname === "/messages" || pathname.startsWith("/messages/");
  const isWriteActive = pathname.startsWith("/write");

  return (
    <nav
      className="sticky top-0 z-50 border-b border-gray-200 bg-white"
      aria-label="Primary navigation"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex flex-shrink-0 items-center gap-2">
            <Image
              src="/logo.png"
              alt="ThinkAfrika"
              width={160}
              height={48}
              priority
              data-lite-keep
              className="h-16 w-auto"
            />
          </Link>

          <div className="hidden min-w-0 flex-1 items-center justify-center gap-3 px-4 md:flex">
            <div className="flex items-center gap-1">
              <Link
                href="/"
                className={navItemClass(isHomeActive)}
                aria-current={isHomeActive ? "page" : undefined}
              >
                Home
              </Link>
              <Link
                href="/topics"
                className={navItemClass(isDiscoverActive)}
                aria-current={isDiscoverActive ? "page" : undefined}
              >
                Discover
              </Link>
              <Link
                href="/opportunities"
                className={navItemClass(isOpportunitiesActive)}
                aria-current={isOpportunitiesActive ? "page" : undefined}
              >
                Opportunities
              </Link>
              <Link
                href="/alumni"
                className={navItemClass(isAlumniActive)}
                aria-current={isAlumniActive ? "page" : undefined}
              >
                Alumni
              </Link>
              {user ? (
                <Link
                  href="/messages"
                  className={navItemClass(isMessagesActive)}
                  aria-current={isMessagesActive ? "page" : undefined}
                >
                  <span className="relative">
                    Messages
                    <MessagesUnreadBadge
                      userId={user.id}
                      className="-right-4 -top-1"
                    />
                  </span>
                </Link>
              ) : null}
              <Link
                href="/write"
                className={`rounded-lg px-4 py-2 text-sm transition-colors ${
                  isWriteActive
                    ? "font-semibold text-emerald-brand"
                    : "text-emerald-brand/90 hover:bg-emerald-50 hover:text-emerald-brand"
                }`}
                aria-current={isWriteActive ? "page" : undefined}
              >
                Write
              </Link>
            </div>

            <button
              type="button"
              onClick={onOpenSearch}
              className="flex w-full max-w-sm items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-ink-muted transition-colors hover:border-emerald-brand hover:text-ink"
              aria-label="Open search"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <span>Search posts, people, topics...</span>
              <kbd className="ml-auto hidden text-xs text-gray-400 sm:inline">
                Ctrl+K
              </kbd>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSearch}
              className="rounded-full border border-gray-200 bg-white p-2 text-ink-muted transition-colors hover:border-emerald-brand hover:text-ink md:hidden"
              aria-label="Open search"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
            {user ? <NotificationBell userId={user.id} /> : null}
            <LiteModeToggle />
            <NavUserMenu
              user={user}
              profile={profile}
              points={profile?.points ?? 0}
              isAdmin={isAdmin}
              canAccessReview={canAccessReview}
            />
            <MobileNav
              user={user}
              profile={profile}
              isAdmin={isAdmin}
              canAccessReview={canAccessReview}
            />
          </div>
        </div>
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import NavUserMenu from "./NavUserMenu";
import MobileNav from "./MobileNav";
import NotificationBell from "@/components/ui/NotificationBell";

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
  return `rounded-[7px] px-[9px] py-[5px] text-[13px] font-medium transition-colors ${
    isActive
      ? "font-semibold text-ink"
      : "text-gray-500 hover:bg-gray-100 hover:text-ink"
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
    pathname === "/discover" || pathname.startsWith("/discover/");
  const isDebatesActive =
    pathname === "/debates" || pathname.startsWith("/debates/");
  const isOpportunitiesActive =
    pathname === "/opportunities" || pathname.startsWith("/opportunities/");
  const isWriteActive = pathname.startsWith("/write");

  return (
    <nav
      className="sticky top-0 z-50 h-14 border-b border-gray-200 bg-white/95 backdrop-blur-xl"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex h-full max-w-[1152px] items-center gap-6 px-5">
          <Link
            href="/"
            className="shrink-0 font-display text-xl font-bold leading-none"
          >
            <span className="text-emerald-brand">Think</span>
            <span className="text-purple-accent">Africa</span>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center gap-6 md:flex">
            <div className="flex items-center gap-0.5">
              <Link
                href="/"
                className={navItemClass(isHomeActive)}
                aria-current={isHomeActive ? "page" : undefined}
              >
                Home
              </Link>
              <Link
                href="/discover"
                className={navItemClass(isDiscoverActive)}
                aria-current={isDiscoverActive ? "page" : undefined}
              >
                Discover
              </Link>
              <Link
                href="/debates"
                className={navItemClass(isDebatesActive)}
                aria-current={isDebatesActive ? "page" : undefined}
              >
                Debates
              </Link>
              <Link
                href="/opportunities"
                className={navItemClass(isOpportunitiesActive)}
                aria-current={isOpportunitiesActive ? "page" : undefined}
              >
                Opportunities
              </Link>
            </div>

            <button
              type="button"
              onClick={onOpenSearch}
              className="ml-auto hidden w-full max-w-[280px] items-center gap-2 rounded-[9px] border border-transparent bg-gray-100 px-3 py-1.5 text-[13px] text-gray-400 transition-colors hover:border-gray-300 hover:bg-white hover:text-ink md:flex"
              aria-label="Open search"
            >
              <svg
                className="h-3.5 w-3.5 flex-shrink-0"
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
              <span className="truncate">Search essays, writers, topics...</span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenSearch}
              className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-ink md:hidden"
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
            <Link
              href="/write"
              className={`hidden items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors sm:inline-flex ${
                isWriteActive
                  ? "bg-ink"
                  : "bg-emerald-brand hover:bg-emerald-600"
              }`}
              aria-current={isWriteActive ? "page" : undefined}
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
              </svg>
              Write
            </Link>
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
    </nav>
  );
}

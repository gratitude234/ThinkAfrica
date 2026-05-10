"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import NavUserMenu from "./NavUserMenu";
import MobileNav from "./MobileNav";
import CreateLauncher from "./CreateLauncher";
import NotificationBell from "@/components/ui/NotificationBell";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";

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
  return `rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors ${
    isActive
      ? "bg-canvas font-semibold text-ink"
      : "text-ink-muted hover:bg-canvas hover:text-ink"
  }`;
}

function MessageIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 10h8M8 14h5m7-2a8 8 0 11-3.05-6.28L21 5l-.72 4.05A7.97 7.97 0 0120 12z"
      />
    </svg>
  );
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
  const isExploreActive =
    pathname === "/explore" ||
    pathname.startsWith("/explore/") ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/");
  const isDebatesActive =
    pathname === "/debates" || pathname.startsWith("/debates/");
  const isOpportunitiesActive =
    pathname === "/opportunities" || pathname.startsWith("/opportunities/");
  const isWriteActive = pathname.startsWith("/write");
  const messagesHref = user
    ? "/messages"
    : `/login?redirectTo=${encodeURIComponent("/messages")}`;

  return (
    <nav
      className="sticky top-0 z-50 h-[60px] border-b border-gray-200 bg-white/95 backdrop-blur-xl"
      aria-label="Primary navigation"
    >
      <div className="mx-auto flex h-full max-w-[1240px] items-center gap-7 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="shrink-0 font-display text-[21px] font-bold leading-none"
          >
            <span className="text-emerald-brand">Think</span>
            <span className="text-purple-accent">Africa</span>
          </Link>

          <div className="hidden min-w-0 flex-1 items-center gap-7 md:flex">
            <div className="flex items-center gap-1">
              <Link
                href="/"
                className={navItemClass(isHomeActive)}
                aria-current={isHomeActive ? "page" : undefined}
              >
                Home
              </Link>
              <Link
                href="/explore"
                className={navItemClass(isExploreActive)}
                aria-current={isExploreActive ? "page" : undefined}
              >
                Explore
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
              className="ml-auto hidden w-full max-w-[340px] items-center gap-2 rounded-full border border-gray-200 bg-canvas px-3.5 py-2 text-[13px] text-ink-muted transition-colors hover:border-gray-300 hover:bg-white hover:text-ink lg:flex"
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
              <span className="truncate">Search essays, writers, universities...</span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <Link
              href={messagesHref}
              className="relative rounded-lg p-2 text-ink-muted transition-colors hover:bg-canvas hover:text-ink lg:hidden"
              aria-label="Open messages"
            >
              <MessageIcon />
              {user ? (
                <MessagesUnreadBadge userId={user.id} className="-right-0.5 -top-0.5" />
              ) : null}
            </Link>
            {user ? <NotificationBell userId={user.id} /> : null}
            <CreateLauncher
              userId={user?.id ?? null}
              variant="desktop"
              isActive={isWriteActive}
            />
            <div className="hidden md:block">
              <NavUserMenu
                user={user}
                profile={profile}
                points={profile?.points ?? 0}
                isAdmin={isAdmin}
                canAccessReview={canAccessReview}
              />
            </div>
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

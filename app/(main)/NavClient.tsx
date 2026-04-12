"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import NavUserMenu from "./NavUserMenu";
import MobileNav from "./MobileNav";
import NotificationBell from "@/components/ui/NotificationBell";
import SearchOverlay from "@/components/ui/SearchOverlay";

interface NavClientProps {
  user: User | null;
  profile: { username: string; full_name: string | null; points?: number } | null;
  isAdmin: boolean;
}

const NAV_PILLARS = [
  {
    label: "Discover",
    items: [
      { label: "Feed", href: "/" },
      { label: "Debates", href: "/debates" },
      { label: "Webinars", href: "/webinars" },
      { label: "Leaderboard", href: "/leaderboard" },
      { label: "People", href: "/talent" },
      { label: "Topics", href: "/topics" },
    ],
    activePrefixes: ["/", "/debates", "/webinars", "/leaderboard", "/talent", "/topics"],
  },
  {
    label: "Create",
    items: [
      { label: "Write a post", href: "/write" },
      { label: "Start a debate", href: "/debates/create" },
      { label: "Host a webinar", href: "/webinars/create" },
      { label: "My dashboard", href: "/dashboard" },
    ],
    activePrefixes: ["/write", "/debates/create", "/webinars/create", "/dashboard"],
  },
  {
    label: "Grow",
    items: [
      { label: "Fellowships", href: "/fellowships" },
      { label: "Ambassadors", href: "/ambassadors" },
      { label: "Bookmarks", href: "/bookmarks" },
      { label: "Partners", href: "/partners" },
    ],
    activePrefixes: ["/fellowships", "/ambassadors", "/bookmarks", "/partners"],
  },
] as const;

function matchesPrefix(pathname: string, prefix: string) {
  if (prefix === "/") {
    return pathname === "/";
  }

  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function getActivePillar(pathname: string) {
  const priorityOrder = ["Create", "Grow", "Discover"] as const;

  for (const label of priorityOrder) {
    const pillar = NAV_PILLARS.find((item) => item.label === label);
    if (pillar?.activePrefixes.some((prefix) => matchesPrefix(pathname, prefix))) {
      return pillar.label;
    }
  }

  return null;
}

export default function NavClient({ user, profile, isAdmin }: NavClientProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const pathname = usePathname();
  const activePillar = getActivePillar(pathname);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Image
              src="/logo.png"
              alt="ThinkAfrika"
              width={160}
              height={48}
              priority
              className="h-16 w-auto"
            />
          </Link>

          {/* Center nav links - desktop */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_PILLARS.map((pillar) => {
              const isActive = activePillar === pillar.label;

              return (
                <div key={pillar.label} className="relative group">
                  <button
                    type="button"
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-1 ${
                      isActive
                        ? "text-emerald-brand font-semibold"
                        : "text-gray-600 hover:text-emerald-brand hover:bg-gray-50"
                    }`}
                  >
                    <span>{pillar.label}</span>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-50 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none group-hover:pointer-events-auto">
                    {pillar.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-emerald-brand"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSearchOpen(true)}
              className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label="Search"
            >
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
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>

            {user && <NotificationBell userId={user.id} />}
            <NavUserMenu
              user={user}
              profile={profile}
              points={profile?.points ?? 0}
              isAdmin={isAdmin}
            />
            <MobileNav user={user} profile={profile} isAdmin={isAdmin} />
          </div>
        </div>
      </div>

      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </nav>
  );
}

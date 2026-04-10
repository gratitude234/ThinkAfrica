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
import ExploreDropdown from "./ExploreDropdown";

interface NavClientProps {
  user: User | null;
  profile: { username: string; full_name: string } | null;
  isAdmin: boolean;
}

export default function NavClient({ user, profile, isAdmin }: NavClientProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const pathname = usePathname();

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
              className="h-14 w-auto"
            />
          </Link>

          {/* Center nav links — desktop */}
          <div className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname === "/"
                  ? "text-emerald-brand"
                  : "text-gray-600 hover:text-emerald-brand hover:bg-gray-50"
              }`}
            >
              Feed
            </Link>
            <Link
              href="/debates"
              className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                pathname.startsWith("/debates")
                  ? "text-emerald-brand"
                  : "text-gray-600 hover:text-emerald-brand hover:bg-gray-50"
              }`}
            >
              Debates
            </Link>
            <ExploreDropdown />
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
            <NavUserMenu user={user} profile={profile} isAdmin={isAdmin} />
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

"use client";

import Link from "next/link";
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import BrandWordmark from "@/components/ui/BrandWordmark";
import { useHasScrolled } from "@/lib/useHasScrolled";
import { useAppChrome } from "./AppChromeProvider";
import NavUserMenu from "./NavUserMenu";

interface NavClientProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url?: string | null;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin: boolean;
  onOpenSearch: () => void;
}

/**
 * Global utilities only. Primary navigation lives in the desktop side rail and
 * the mobile bottom bar, so Write, Notifications and Profile are not repeated.
 */
export default function NavClient({
  user,
  profile,
  isAdmin,
  onOpenSearch,
}: NavClientProps) {
  const { registerNav, setInteractionLocked } = useAppChrome();
  const hasScrolled = useHasScrolled();

  useEffect(() => {
    return () => setInteractionLocked(false);
  }, [setInteractionLocked]);

  return (
    <div
      ref={registerNav}
      data-app-primary-nav=""
      data-app-chrome-motion=""
      onFocus={() => setInteractionLocked(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setInteractionLocked(false);
        }
      }}
      className="sticky top-0 z-50 transition-transform duration-200 ease-out motion-reduce:transition-none"
    >
      <nav
        className={`h-[60px] border-b border-gray-200 bg-white transition-shadow duration-300 motion-reduce:transition-none ${
          hasScrolled ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]" : ""
        }`}
        aria-label="Application header"
      >
        <div className="mx-auto flex h-full max-w-[1240px] items-center gap-5 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0" aria-label="Indegenius home">
            <BrandWordmark
              iconClassName="hidden h-6 w-6 md:block"
              textClassName="text-[18px] md:text-[19px]"
            />
          </Link>

          <button
            type="button"
            onClick={onOpenSearch}
            className="ml-auto hidden min-h-11 w-full max-w-[520px] items-center gap-2 rounded-full border border-gray-200 bg-canvas px-3.5 py-2 text-[13px] text-ink-muted transition-colors hover:border-gray-300 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 md:flex"
            aria-label="Open search"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="truncate">Search Posts, Articles, and writers…</span>
          </button>

          <div className="hidden md:block">
            <NavUserMenu user={user} profile={profile} isAdmin={isAdmin} />
          </div>
        </div>
      </nav>
    </div>
  );
}
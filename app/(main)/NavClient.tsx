"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import BrandWordmark from "@/components/ui/BrandWordmark";

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
  const [shortcut, setShortcut] = useState("Ctrl+K");
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setShortcut("⌘K");
  }, []);

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
        className="app-utility-header"
        aria-label="Application header"
      >
        <div className="app-utility-inner">
          <Link href="/" className="shrink-0" aria-label="Indegenius home">
            <BrandWordmark
              iconClassName="app-brand-icon"
              textClassName="app-brand-text"
            />
          </Link>

          <button
            type="button"
            onClick={onOpenSearch}
            className="app-search-trigger focus-ring"
            aria-haspopup="dialog"
            aria-keyshortcuts="Meta+K Control+K"
            aria-label="Open search"
          >
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <span className="app-search-placeholder">Search Posts, Articles, and writers…</span>
            <kbd className="app-search-shortcut">{shortcut}</kbd>
          </button>

          <div className="app-account">
            <NavUserMenu user={user} profile={profile} isAdmin={isAdmin} />
          </div>
        </div>
      </nav>
    </div>
  );
}
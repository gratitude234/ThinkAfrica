"use client";

import { useCallback, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import NavClient from "@/app/(main)/NavClient";
import SearchOverlay from "@/components/ui/SearchOverlay";
import { useVisualViewportBottom } from "@/lib/useVisualViewportBottom";
import type { NavigationProfile } from "@/lib/navigationViewer";

interface WriteChromeProps {
  user: User | null;
  profile: NavigationProfile | null;
  isAdmin: boolean;
  children: ReactNode;
}

/**
 * The app navigation above the write screens, from md up. On a phone each
 * screen is the whole view, with its own bar on the keyboard, so the
 * navigation is left out. `display: contents` keeps NavClient's own sticky
 * positioning working against the page rather than against this wrapper.
 *
 * There is no AppChromeProvider here. NavClient falls back to an always-shown
 * bar without one, which is what a writing screen wants, and the Article
 * header sticks at --app-nav-height below it.
 */
export default function WriteChrome({ user, profile, isAdmin, children }: WriteChromeProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  // The phone toolbars sit on the keyboard through
  // --mobile-visual-viewport-bottom, which only this hook publishes.
  useVisualViewportBottom();

  return (
    <>
      <div className="hidden md:contents">
        <NavClient user={user} profile={profile} isAdmin={isAdmin} onOpenSearch={() => setSearchOpen(true)} />
      </div>
      <SearchOverlay isOpen={searchOpen} onClose={closeSearch} />
      {children}
    </>
  );
}

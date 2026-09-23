"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { isFocusRoute } from "./navRoutes";
import type { User } from "@supabase/supabase-js";
import NavClient from "./NavClient";
import BottomNav from "./BottomNav";
import SearchOverlay from "@/components/ui/SearchOverlay";
import { useVisualViewportBottom } from "@/lib/useVisualViewportBottom";

interface NavigationShellProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url?: string | null;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin: boolean;
}

export default function NavigationShell({
  user,
  profile,
  isAdmin,
}: NavigationShellProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const pathname = usePathname();
  const focused = isFocusRoute(pathname);
  const closeSearch = useCallback(() => setIsSearchOpen(false), []);

  useVisualViewportBottom();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!focused && (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }

      if (event.key === "Escape") {
        setIsSearchOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [focused]);


  if (focused) return null;

  return (
    <>
      <NavClient
        user={user}
        profile={profile}
        isAdmin={isAdmin}
        onOpenSearch={() => setIsSearchOpen(true)}
      />
      <BottomNav
        username={profile?.username ?? null}
        userId={user?.id ?? null}
      />
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={closeSearch}
      />
    </>
  );
}

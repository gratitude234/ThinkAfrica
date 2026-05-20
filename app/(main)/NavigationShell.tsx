"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import NavClient from "./NavClient";
import BottomNav from "./BottomNav";
import SearchOverlay from "@/components/ui/SearchOverlay";

interface NavigationShellProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url?: string | null;
    points?: number;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin: boolean;
  canAccessReview: boolean;
  hasActiveDebate: boolean;
}

export default function NavigationShell({
  user,
  profile,
  isAdmin,
  canAccessReview,
  hasActiveDebate,
}: NavigationShellProps) {
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsSearchOpen(true);
      }

      if (event.key === "Escape") {
        setIsSearchOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <>
      <NavClient
        user={user}
        profile={profile}
        isAdmin={isAdmin}
        canAccessReview={canAccessReview}
        onOpenSearch={() => setIsSearchOpen(true)}
      />
      <BottomNav
        username={profile?.username ?? null}
        userId={user?.id ?? null}
        hasActiveDebate={hasActiveDebate}
      />
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}

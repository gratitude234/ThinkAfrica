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
    points?: number;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin: boolean;
  canAccessReview: boolean;
}

export default function NavigationShell({
  user,
  profile,
  isAdmin,
  canAccessReview,
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
      <BottomNav username={profile?.username ?? null} />
      <SearchOverlay
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
      />
    </>
  );
}

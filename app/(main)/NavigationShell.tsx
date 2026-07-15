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

  useEffect(() => {
    const root = document.documentElement;
    const visualViewport = window.visualViewport;

    if (!visualViewport) {
      root.style.setProperty("--mobile-visual-viewport-bottom", "0px");
      return () => root.style.removeProperty("--mobile-visual-viewport-bottom");
    }

    let animationFrame: number | null = null;

    const isEditableFocused = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable
      );
    };

    const syncVisualViewport = () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);

      animationFrame = requestAnimationFrame(() => {
        // Only account for the visual viewport shrinking when a keyboard is
        // plausibly open (an editable element is focused). Otherwise this
        // diff also picks up the mobile browser's address/toolbar collapsing
        // on scroll, which shoves fixed bottom UI (e.g. the compose FAB) out
        // of view until that chrome settles.
        if (!isEditableFocused()) {
          root.style.setProperty("--mobile-visual-viewport-bottom", "0px");
          return;
        }

        const layoutHeight = Math.max(
          window.innerHeight,
          document.documentElement.clientHeight
        );
        const obscuredBottom = Math.max(
          0,
          Math.round(
            layoutHeight - visualViewport.height - visualViewport.offsetTop
          )
        );

        root.style.setProperty(
          "--mobile-visual-viewport-bottom",
          `${obscuredBottom}px`
        );
      });
    };

    syncVisualViewport();
    visualViewport.addEventListener("resize", syncVisualViewport);
    visualViewport.addEventListener("scroll", syncVisualViewport);
    window.addEventListener("resize", syncVisualViewport);
    window.addEventListener("orientationchange", syncVisualViewport);
    document.addEventListener("focusin", syncVisualViewport);
    document.addEventListener("focusout", syncVisualViewport);

    return () => {
      if (animationFrame !== null) cancelAnimationFrame(animationFrame);
      visualViewport.removeEventListener("resize", syncVisualViewport);
      visualViewport.removeEventListener("scroll", syncVisualViewport);
      window.removeEventListener("resize", syncVisualViewport);
      window.removeEventListener("orientationchange", syncVisualViewport);
      document.removeEventListener("focusin", syncVisualViewport);
      document.removeEventListener("focusout", syncVisualViewport);
      root.style.removeProperty("--mobile-visual-viewport-bottom");
    };
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

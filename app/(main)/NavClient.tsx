"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { User } from "@supabase/supabase-js";
import BrandWordmark from "@/components/ui/BrandWordmark";
import NavUserMenu from "./NavUserMenu";
import CreateLauncher from "./CreateLauncher";
import NotificationBell from "@/components/ui/NotificationBell";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";
import { shouldShowMobilePrimaryNav } from "./navRoutes";
import { NAV_MATCH_PREFIXES, isNavItemActive } from "./navItems";
import { useHasScrolled } from "@/lib/useHasScrolled";
import { useNavAutoHide } from "@/lib/useNavAutoHide";

interface NavClientProps {
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
  onOpenSearch: () => void;
}

function navItemClass(isActive: boolean) {
  return `rounded-lg px-3 py-2 text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
    isActive
      ? "bg-canvas font-semibold text-ink"
      : "text-ink-muted hover:bg-canvas hover:text-ink"
  }`;
}

function MessageIcon({ className = "h-5 w-5" }: { className?: string }) {
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
        d="M7 8.5h10M7 12.25h6.5M5.75 19 9 15.75h8.25A2.75 2.75 0 0020 13V7.75A2.75 2.75 0 0017.25 5H6.75A2.75 2.75 0 004 7.75V13a2.75 2.75 0 002.75 2.75H7V19z"
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
  const navRef = useRef<HTMLDivElement>(null);
  // Once content is moving beneath the pinned nav, a flat bar reads as painted
  // on rather than floating above the page.
  const hasScrolled = useHasScrolled();

  // Focus landing anywhere inside the bar -- keyboard tabbing, or the
  // notification panel, which renders in this subtree -- pins it open. A nav
  // that slides away from the control you just reached for is a trap, not an
  // affordance.
  const [isNavFocused, setIsNavFocused] = useState(false);
  const isNavHidden = useNavAutoHide({
    disabled: isNavFocused,
    revealKey: pathname,
  });

  const navHeightRef = useRef(0);
  const isNavHiddenRef = useRef(false);

  // How much of the nav is currently occupying the top of the viewport. The bar
  // itself pins at (offset - height) and everything beneath it pins at offset,
  // so one number moves the whole stack and no sub-header can drift out of
  // register with the bar's bottom edge mid-animation.
  //
  // Published as a literal length rather than left to resolve through the
  // var() chain in globals.css because PostsFeedTabs reads it back with
  // getComputedStyle, and whether an unregistered custom property computes to a
  // substituted value or a raw token stream is engine territory.
  const publishOffset = useCallback(() => {
    const root = document.documentElement;
    if (isNavHiddenRef.current) {
      root.style.setProperty("--app-nav-offset", "0px");
    } else if (navHeightRef.current > 0) {
      root.style.setProperty("--app-nav-offset", `${navHeightRef.current}px`);
    } else {
      root.style.removeProperty("--app-nav-offset");
    }
  }, []);

  useEffect(() => {
    isNavHiddenRef.current = isNavHidden;
    publishOffset();
  }, [isNavHidden, publishOffset]);

  useEffect(() => {
    const root = document.documentElement;
    return () => {
      root.style.removeProperty("--app-nav-offset");
      root.style.removeProperty("--app-nav-height");
    };
  }, []);

  // Publish the real rendered height of the sticky nav as --app-nav-height so
  // sticky sub-headers (debate rooms, feed tabs) can pin flush beneath it.
  // Hardcoded offsets drifted out of sync with the nav and left sub-headers
  // sliding underneath it; measuring removes that whole class of bug and keeps
  // working when the announcement strip wraps at narrow widths.
  useEffect(() => {
    const node = navRef.current;
    if (!node) return;

    const root = document.documentElement;
    const publishHeight = () => {
      const height = Math.round(node.getBoundingClientRect().height);
      if (height > 0) {
        navHeightRef.current = height;
        root.style.setProperty("--app-nav-height", `${height}px`);
      }
      // The offset is derived from the height, so a re-measure has to restate
      // it -- otherwise a nav that grows keeps publishing its old offset.
      publishOffset();
    };

    publishHeight();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", publishHeight);
      return () => window.removeEventListener("resize", publishHeight);
    }

    const observer = new ResizeObserver(publishHeight);
    observer.observe(node);
    return () => observer.disconnect();
  }, [publishOffset]);

  const isHomeActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.home);
  const isExploreActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.explore);
  const isDebatesActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.debates);
  const isOpportunitiesActive = isNavItemActive(
    pathname,
    NAV_MATCH_PREFIXES.opportunities
  );
  const isWriteActive = pathname.startsWith("/write");
  const showMobilePrimaryNav = shouldShowMobilePrimaryNav(pathname);
  const messagesHref = user
    ? "/messages"
    : `/login?redirectTo=${encodeURIComponent("/messages")}`;

  return (
    <>
      {/* Outside the sticky wrapper: the positioning statement greets you at the
          top of the page, but it never changes, so pinning it cost 36px of
          vertical space on every screen and every scroll. */}
      <div className="bg-emerald-brand py-1.5 text-center">
        <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gold sm:text-[10.5px]">
          Africa&apos;s intellectual social network
        </span>
      </div>
      {/* Retreats off the top on a downward scroll and comes back the moment
          the reader scrolls up, so reading gets the full screen without putting
          search and notifications a page-scroll away. top rather than transform
          on purpose: a transform here would make this a containing block for
          the fixed notification panel and Create sheet rendered inside it. */}
      <div
        ref={navRef}
        onFocus={() => setIsNavFocused(true)}
        onBlur={() => setIsNavFocused(false)}
        className="sticky top-[calc(var(--app-nav-offset)-var(--app-nav-height))] z-50 transition-[top] duration-200 ease-out motion-reduce:transition-none"
      >
      <nav
        className={`h-[60px] border-b border-gray-200 bg-white transition-shadow duration-300 motion-reduce:transition-none ${
          hasScrolled ? "shadow-[0_1px_12px_rgb(0,0,0,0.08)]" : ""
        }`}
        aria-label="Primary navigation"
      >
      <div className="mx-auto flex h-full max-w-[1240px] items-center gap-7 px-4 sm:px-6 lg:px-8">
          <Link href="/" className="shrink-0" aria-label="Indegenius home">
            <BrandWordmark
              iconClassName="hidden h-6 w-6 md:block"
              textClassName="text-[18px] md:text-[19px]"
            />
          </Link>

          <div className="hidden min-w-0 flex-1 items-center gap-7 md:flex">
            {/* At xl the side rail owns these destinations, so the top bar drops
                them and hands the space to search. */}
            <div className="flex items-center gap-1 xl:hidden">
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
              // xl:ml-0 cancels the ml-auto that pushes search right of the nav
              // links; without it, dropping the links at xl would strand the
              // field on the right with a hole after the wordmark.
              className="ml-auto hidden min-h-11 w-full max-w-[340px] items-center gap-2 rounded-full border border-gray-200 bg-canvas px-3.5 py-2 text-[13px] text-ink-muted transition-colors hover:border-gray-300 hover:bg-white hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 lg:flex xl:ml-0 xl:max-w-[520px]"
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
              <span className="truncate">Search posts, articles, research, writers…</span>
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2.5">
            <Link
              href={messagesHref}
              className={`relative h-11 w-11 items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 ${
                showMobilePrimaryNav ? "hidden md:flex" : "flex"
              }`}
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
          </div>
      </div>
      </nav>
      </div>
    </>
  );
}

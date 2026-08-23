"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import BrandWordmark from "@/components/ui/BrandWordmark";
import NavUserMenu from "./NavUserMenu";
import CreateLauncher from "./CreateLauncher";
import NotificationBell from "@/components/ui/NotificationBell";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";
import { shouldShowMobilePrimaryNav } from "./navRoutes";
import { NAV_MATCH_PREFIXES, isNavItemActive } from "./navItems";
import { useHasScrolled } from "@/lib/useHasScrolled";
import { useAppChrome } from "./AppChromeProvider";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import { BRAND_TAGLINE } from "@/lib/brand";

interface NavClientProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    avatar_url?: string | null;
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
  const { registerNav, setInteractionLocked } = useAppChrome();
  // Once content is moving beneath the pinned nav, a flat bar reads as painted
  // on rather than floating above the page.
  const hasScrolled = useHasScrolled();

  // Focus landing anywhere inside the bar -- keyboard tabbing, or the
  // notification panel, which renders in this subtree -- pins it open. A nav
  // that slides away from the control you just reached for is a trap, not an
  // affordance.
  useEffect(() => {
    return () => setInteractionLocked(false);
  }, [setInteractionLocked]);

  const isHomeActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.home);
  const isExploreActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.explore);
  const isCampusActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.campus);
  const isResearchActive = isNavItemActive(
    pathname,
    NAV_MATCH_PREFIXES.research
  );
  const isDebatesActive = isNavItemActive(pathname, NAV_MATCH_PREFIXES.debates);
  const isResponsesActive = isNavItemActive(
    pathname,
    NAV_MATCH_PREFIXES.responses
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
          {BRAND_TAGLINE}
        </span>
      </div>
      {/* Retreats off the top on a downward scroll and comes back the moment
          the reader scrolls up, so reading gets the full screen without putting
          search and notifications a page-scroll away. top rather than transform
          on purpose: a transform here would make this a containing block for
          the fixed notification panel and Create sheet rendered inside it.

          The shared chrome controller owns its measured height and scroll
          state, so every mobile chrome surface moves from the same signal. */}
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
                For you
              </Link>
              <Link
                href="/explore"
                className={navItemClass(isExploreActive)}
                aria-current={isExploreActive ? "page" : undefined}
              >
                Discover
              </Link>
              <Link
                href="/responses"
                className={navItemClass(isResponsesActive)}
                aria-current={isResponsesActive ? "page" : undefined}
              >
                Responses
              </Link>
              <Link
                href="/campus"
                className={navItemClass(isCampusActive)}
                aria-current={isCampusActive ? "page" : undefined}
              >
                Campus
              </Link>
              {FEATURE_FLAGS.research ? (
                <Link
                  href="/research"
                  className={navItemClass(isResearchActive)}
                  aria-current={isResearchActive ? "page" : undefined}
                >
                  Research
                </Link>
              ) : null}
              {FEATURE_FLAGS.debates ? (
                <Link
                  href="/debates"
                  className={navItemClass(isDebatesActive)}
                  aria-current={isDebatesActive ? "page" : undefined}
                >
                  Debates
                </Link>
              ) : null}
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
              <span className="truncate">Search ideas, topics, and people…</span>
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

"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { isEnabled } from "@/lib/featureFlags";

interface MobileNavProps {
  user: User | null;
  profile: {
    username: string;
    full_name: string | null;
    points?: number;
    role?: "student" | "reviewer" | "editor" | "admin";
  } | null;
  isAdmin?: boolean;
  canAccessReview?: boolean;
}

const PRIMARY_LINKS = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover" },
  { label: "Debates", href: "/debates" },
  { label: "Opportunities", href: "/opportunities" },
  { label: "Write", href: "/write" },
] as const;

function itemClass(isActive: boolean) {
  return `block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
    isActive
      ? "bg-emerald-50 text-emerald-brand"
      : "text-gray-700 hover:bg-canvas hover:text-emerald-brand"
  }`;
}

export default function MobileNav({
  user,
  profile,
  isAdmin,
  canAccessReview,
}: MobileNavProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const profileHref = profile?.username ? `/${profile.username}` : "/settings";
  const profileActive = profile?.username
    ? pathname === profileHref || pathname.startsWith(`${profileHref}/`)
    : pathname === "/settings" || pathname.startsWith("/settings/");

  const moreLinks = [
    isEnabled("webinars") ? { label: "Webinars", href: "/webinars" } : null,
    isEnabled("fellowshipsSection") ? { label: "Fellowships", href: "/fellowships" } : null,
    isEnabled("ambassadors") ? { label: "Ambassadors", href: "/ambassadors" } : null,
    { label: "Leaderboard", href: "/leaderboard" },
    { label: "Alumni", href: "/alumni" },
    isEnabled("talentMarketplace") ? { label: "People", href: "/talent" } : null,
    { label: "Bookmarks", href: "/bookmarks" },
    { label: "Partners", href: "/partners" },
    { label: "Dashboard", href: "/dashboard" },
    canAccessReview ? { label: "Review", href: "/review" } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
        aria-label="Toggle menu"
      >
        {open ? (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-16 z-40 border-b border-gray-200 bg-white shadow-lg md:hidden">
          <nav className="space-y-1 px-4 py-3">
            {PRIMARY_LINKS.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={itemClass(isActive)}
                >
                  {item.label}
                </Link>
              );
            })}

            <Link
              href={profileHref}
              onClick={() => setOpen(false)}
              className={itemClass(profileActive)}
            >
              Me
            </Link>

            <div className="border-t border-gray-100 pt-3">
              <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
                More
              </p>
              <div className="space-y-1">
                {moreLinks.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={itemClass(
                      pathname === item.href || pathname.startsWith(`${item.href}/`)
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
                {user && isAdmin ? (
                  <Link
                    href="/admin/review"
                    onClick={() => setOpen(false)}
                    className={itemClass(pathname.startsWith("/admin"))}
                  >
                    Admin
                  </Link>
                ) : null}
              </div>
            </div>
          </nav>
        </div>
      ) : null}
    </>
  );
}

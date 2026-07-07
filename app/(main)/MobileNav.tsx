"use client";

import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

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

const GUEST_PRIMARY_LINKS = [
  { label: "Home", href: "/?guest=1" },
  { label: "Explore", href: "/explore" },
  { label: "Debates", href: "/debates" },
  { label: "Opportunities", href: "/opportunities" },
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
  const panelId = useId();
  const pathname = usePathname();
  const router = useRouter();
  const profileHref = profile?.username ? `/${profile.username}` : "/settings";
  const displayName =
    profile?.full_name ?? user?.email?.split("@")[0] ?? "Indegenius";
  const points = profile?.points ?? 0;
  const profileActive = profile?.username
    ? pathname === profileHref || pathname.startsWith(`${profileHref}/`)
    : pathname === "/settings" || pathname.startsWith("/settings/");

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setOpen(false);
    router.push("/login");
    router.refresh();
  };

  useEffect(() => {
    if (!open) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const accountLinks = [
    user ? { label: "My writing", href: "/dashboard" } : null,
    user ? { label: "Bookmarks", href: "/bookmarks" } : null,
    user ? { label: "Settings", href: "/settings" } : null,
    canAccessReview ? { label: "Review", href: "/review" } : null,
    user && isAdmin ? { label: "Admin", href: "/admin/review" } : null,
  ].filter(Boolean) as { label: string; href: string }[];

  const menuPanel = open ? (
    <div
      id={panelId}
      className="fixed bottom-[calc(60px+env(safe-area-inset-bottom))] left-0 right-0 top-[60px] z-40 overflow-y-auto border-b border-gray-200 bg-white shadow-lg md:hidden"
    >
      <nav className="space-y-1 px-4 py-3" aria-label="More navigation">
        {!user ? (
          <div className="rounded-xl border border-gray-100 bg-canvas p-2">
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Explore
            </p>
            {GUEST_PRIMARY_LINKS.map((item) => {
              const isActive =
                item.href === "/?guest=1"
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
          </div>
        ) : null}

        {user ? (
          <div className="rounded-xl border border-gray-100 bg-canvas p-3">
            <div className="mb-3 flex items-center gap-3 rounded-xl bg-white px-3 py-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-800">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-gray-900">
                  {displayName}
                </p>
                <p className="text-xs font-medium text-emerald-700">
                  {points.toLocaleString()} pts
                </p>
              </div>
            </div>
            <p className="px-2 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">
              Account
            </p>
            <div className="space-y-1">
              {accountLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={itemClass(
                    item.href === profileHref
                      ? profileActive
                      : pathname === item.href || pathname.startsWith(`${item.href}/`)
                  )}
                >
                  {item.label}
                </Link>
              ))}
              <button
                type="button"
                onClick={handleSignOut}
                className="block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Sign out
              </button>
            </div>
          </div>
        ) : null}

        {!user ? (
          <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
            <p className="text-xs leading-relaxed text-emerald-900">
              Create a profile to follow writers, save posts, and publish your first argument.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Link
                href="/signup"
                onClick={() => setOpen(false)}
                className="rounded-lg bg-emerald-brand px-3 py-2 text-center text-sm font-semibold text-white"
              >
                Join free
              </Link>
              <Link
                href="/login"
                onClick={() => setOpen(false)}
                className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-center text-sm font-semibold text-emerald-700"
              >
                Sign in
              </Link>
            </div>
          </div>
        ) : null}

      </nav>
    </div>
  ) : null;

  return (
    <>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 md:hidden"
        aria-label={open ? "Close menu" : "Open more menu"}
        aria-controls={open ? panelId : undefined}
        aria-expanded={open}
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

      {typeof document !== "undefined"
        ? createPortal(menuPanel, document.body)
        : menuPanel}
    </>
  );
}

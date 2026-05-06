"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  username: string | null;
  userId: string | null;
  hasActiveDebate: boolean;
}

function navLinkClass(isCurrent: boolean) {
  return `flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 ${
    isCurrent ? "text-emerald-brand" : "text-gray-500"
  }`;
}

export default function BottomNav({
  username,
  userId,
  hasActiveDebate,
}: BottomNavProps) {
  const pathname = usePathname();
  if (!userId || pathname.startsWith("/post/")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const profileHref = userId ? (username ? `/${username}` : "/settings") : "/signup";
  const profileActive = userId
    ? username
      ? pathname === profileHref || pathname.startsWith(`${profileHref}/`)
      : pathname === "/settings" || pathname.startsWith("/settings/")
    : pathname === "/signup";
  const profileLabel = userId ? "Me" : "Join";

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary navigation"
    >
      <div className="flex h-[60px] items-center justify-around px-2">
        <Link
          href="/"
          className={navLinkClass(isActive("/"))}
          aria-current={isActive("/") ? "page" : undefined}
        >
          <svg
            className="h-5 w-5"
            fill={isActive("/") ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10.75L12 3l9 7.75V21H14.75v-5.5h-5.5V21H3V10.75z"
            />
          </svg>
          <span className="text-[10px] font-medium">Home</span>
        </Link>

        <Link
          href="/discover"
          className={navLinkClass(isActive("/discover"))}
          aria-current={isActive("/discover") ? "page" : undefined}
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-4.35-4.35m1.1-5.4a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z"
            />
          </svg>
          <span className="text-[10px] font-medium">Discover</span>
        </Link>

        <Link
          href="/write"
          className={navLinkClass(isActive("/write"))}
          aria-current={isActive("/write") ? "page" : undefined}
        >
          <div className="-mt-5 flex h-[50px] w-[50px] items-center justify-center rounded-full bg-emerald-brand text-white shadow-[0_8px_18px_-4px_rgb(16_185_129/0.55)]">
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13.5 5.5l5 5M5 19l3.5-.5L18 9l-5-5-9.5 9.5L3 17l2 2z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.5 3.5v4m-2-2h4"
              />
            </svg>
          </div>
          <span className="text-[10px] font-medium">Write</span>
        </Link>

        <Link
          href="/debates"
          className={navLinkClass(isActive("/debates"))}
          aria-current={isActive("/debates") ? "page" : undefined}
        >
          <div className="relative">
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M7 8h10M7 12h6m-8 7 3.5-3.5H18A2.5 2.5 0 0020.5 13V7A2.5 2.5 0 0018 4.5H6A2.5 2.5 0 003.5 7v6A2.5 2.5 0 006 15.5h1V19z"
              />
            </svg>
            {hasActiveDebate ? (
              <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full border border-white bg-emerald-brand" />
            ) : null}
          </div>
          <span className="text-[10px] font-medium">Debates</span>
        </Link>

        <Link
          href={profileHref}
          className={navLinkClass(profileActive)}
          aria-current={profileActive ? "page" : undefined}
        >
          <svg
            className="h-5 w-5"
            fill={profileActive ? "currentColor" : "none"}
            stroke="currentColor"
            strokeWidth={2}
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20 21a8 8 0 10-16 0m12-11a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
          <span className="text-[10px] font-medium">{profileLabel}</span>
        </Link>
      </div>
    </nav>
  );
}

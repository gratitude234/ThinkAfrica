"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  username: string | null;
  userId: string | null;
  hasActiveDebate: boolean;
}

function navLinkClass(isCurrent: boolean) {
  return `flex h-full w-full flex-col items-center justify-center gap-1 pb-2 ${
    isCurrent ? "text-emerald-brand" : "text-gray-500"
  }`;
}

export default function BottomNav({
  username,
  hasActiveDebate,
}: BottomNavProps) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const profileHref = username ? `/${username}` : "/settings";
  const profileActive = username
    ? pathname === profileHref || pathname.startsWith(`${profileHref}/`)
    : pathname === "/settings" || pathname.startsWith("/settings/");

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary navigation"
    >
      <div className="flex h-16 items-end justify-around px-2">
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
          href="/search"
          className={navLinkClass(isActive("/search"))}
          aria-current={isActive("/search") ? "page" : undefined}
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
          <span className="text-[10px] font-medium">Search</span>
        </Link>

        <Link
          href="/write"
          className={navLinkClass(isActive("/write"))}
          aria-current={isActive("/write") ? "page" : undefined}
        >
          <div className="-mt-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-brand text-white shadow-md">
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
          <span className="pb-2 text-[10px] font-medium">Write</span>
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
                d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.275 2.903 2.875 2.903h.375a2.625 2.625 0 0 1 1.855.769l.396.396.396-.396A2.625 2.625 0 0 1 9.252 15.663h.375c1.6 0 2.875-1.302 2.875-2.903V8.25c0-1.6-1.275-2.903-2.875-2.903H5.625C4.025 5.347 2.75 6.65 2.75 8.25v4.51z"
              />
            </svg>
            {hasActiveDebate ? (
              <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
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
          <span className="text-[10px] font-medium">Profile</span>
        </Link>
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CreateLauncher from "./CreateLauncher";

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
  if (pathname.startsWith("/post/")) return null;

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const isExploreActive =
    pathname === "/explore" ||
    pathname.startsWith("/explore/") ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/");
  const profileHref = userId ? (username ? `/${username}` : "/settings") : "/signup";
  const profileActive = userId
    ? username
      ? pathname === profileHref || pathname.startsWith(`${profileHref}/`)
      : pathname === "/settings" || pathname.startsWith("/settings/")
    : pathname === "/signup";
  const profileLabel = userId ? "Me" : "Join";

  return (
    <>
      {userId ? <CreateLauncher userId={userId} variant="mobileFab" /> : null}

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
            href="/explore"
            className={navLinkClass(isExploreActive)}
            aria-current={isExploreActive ? "page" : undefined}
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
            <span className="text-[10px] font-medium">Explore</span>
          </Link>

          <Link
            href="/opportunities"
            className={navLinkClass(isActive("/opportunities"))}
            aria-current={isActive("/opportunities") ? "page" : undefined}
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
                d="M9 6.5V5a2 2 0 012-2h2a2 2 0 012 2v1.5M4.5 9A2.5 2.5 0 017 6.5h10A2.5 2.5 0 0119.5 9v8A2.5 2.5 0 0117 19.5H7A2.5 2.5 0 014.5 17V9zM4.5 12.5h15"
              />
            </svg>
            <span className="text-[10px] font-medium">Opportunities</span>
          </Link>

          <Link
            href="/debates"
            className={navLinkClass(isActive("/debates"))}
            aria-current={isActive("/debates") ? "page" : undefined}
          >
            <div className="relative">
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth={2.25}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 11.5a8.25 8.25 0 11-3.5-6.75M20.25 11.5a8.24 8.24 0 01-8.25 8.25 8.4 8.4 0 01-3.5-.77L4 20l1.02-4.5A8.4 8.4 0 014.25 12a8.24 8.24 0 018.25-8.25M8.25 10.25h7.5M8.25 14h5"
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
    </>
  );
}

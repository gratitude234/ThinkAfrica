"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface BottomNavProps {
  username: string | null;
}

function navLinkClass(isCurrent: boolean) {
  return `flex h-full w-full flex-col items-center justify-center gap-1 pb-2 ${
    isCurrent ? "text-emerald-brand" : "text-gray-500"
  }`;
}

export default function BottomNav({ username }: BottomNavProps) {
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
          href="/topics"
          className={navLinkClass(isActive("/topics"))}
          aria-current={isActive("/topics") ? "page" : undefined}
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
              d="M12 21a9 9 0 100-18 9 9 0 000 18z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3a12 12 0 014.5 9A12 12 0 0112 21 12 12 0 017.5 12 12 12 0 0112 3z"
            />
          </svg>
          <span className="text-[10px] font-medium">Discover</span>
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
              d="M4 8h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 8V6a3 3 0 016 0v2"
            />
          </svg>
          <span className="text-[10px] font-medium">Opportunities</span>
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
          <span className="text-[10px] font-medium">Me</span>
        </Link>
      </div>
    </nav>
  );
}

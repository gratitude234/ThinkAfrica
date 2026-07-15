"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import CreateLauncher from "./CreateLauncher";
import MessagesUnreadBadge from "@/components/ui/MessagesUnreadBadge";

interface BottomNavProps {
  username: string | null;
  userId: string | null;
  hasActiveDebate: boolean;
}

function navLinkClass(isCurrent: boolean) {
  return `flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-0.5 transition-colors duration-150 ${
    isCurrent ? "text-emerald-brand" : "text-gray-500 hover:text-gray-700"
  }`;
}

function navPillClass(isCurrent: boolean) {
  return `flex flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1 transition-colors duration-150 ${
    isCurrent ? "bg-emerald-50" : ""
  }`;
}

export default function BottomNav({
  username,
  userId,
  hasActiveDebate,
}: BottomNavProps) {
  const pathname = usePathname();
  const isPostPage = pathname.startsWith("/post/");
  const isMessagesThread = /^\/messages\/.+/.test(pathname);
  const isEditPage = pathname.startsWith("/edit/");
  const isResearchSubmitPage = pathname.startsWith("/submit/research");
  if (
    pathname.startsWith("/write") ||
    isEditPage ||
    isResearchSubmitPage ||
    isMessagesThread
  ) {
    return null;
  }

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const isExploreActive =
    pathname === "/explore" ||
    pathname.startsWith("/explore/") ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/");
  const profileHref = userId ? "/me" : "/signup";
  const resolvedProfileHref = username ? `/${username}` : "/settings";
  const profileActive = userId
    ? username
      ? pathname === profileHref ||
        pathname.startsWith(`${profileHref}/`) ||
        pathname === resolvedProfileHref ||
        pathname.startsWith(`${resolvedProfileHref}/`)
      : pathname === "/settings" || pathname.startsWith("/settings/")
    : pathname === "/signup";
  const profileLabel = userId ? "Me" : "Join";

  return (
    <>
      <CreateLauncher userId={userId} variant="mobileFab" isPostPage={isPostPage} />

      {!isPostPage ? (
        <nav
          className="fixed left-0 right-0 z-50 border-t border-gray-100 bg-white shadow-[0_-2px_12px_-2px_rgb(0_0_0/0.06)] md:hidden"
          style={{
            bottom: "var(--mobile-visual-viewport-bottom, 0px)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
          aria-label="Primary navigation"
        >
        <div className="flex h-[60px] items-center justify-around px-2">
          <Link
            href="/"
            className={navLinkClass(isActive("/"))}
            aria-current={isActive("/") ? "page" : undefined}
          >
            <span className={navPillClass(isActive("/"))}>
              <svg
                className="h-[22px] w-[22px]"
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
              <span className="text-[11px] font-medium">Home</span>
            </span>
          </Link>

          <Link
            href="/explore"
            className={navLinkClass(isExploreActive)}
            aria-current={isExploreActive ? "page" : undefined}
          >
            <span className={navPillClass(isExploreActive)}>
              <svg
                className="h-[22px] w-[22px]"
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
              <span className="text-[11px] font-medium">Explore</span>
            </span>
          </Link>

          <Link
            href="/opportunities"
            className={navLinkClass(isActive("/opportunities"))}
            aria-current={isActive("/opportunities") ? "page" : undefined}
          >
            <span className={navPillClass(isActive("/opportunities"))}>
              <svg
                className="h-[22px] w-[22px]"
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
              <span className="text-[11px] font-medium">Opportunities</span>
            </span>
          </Link>

          <Link
            href="/messages"
            className={navLinkClass(isActive("/messages"))}
            aria-current={isActive("/messages") ? "page" : undefined}
          >
            <span className={navPillClass(isActive("/messages"))}>
              <div className="relative">
                <svg
                  className="h-[22px] w-[22px]"
                  fill={isActive("/messages") ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3v-3z"
                  />
                </svg>
                {userId ? (
                  <MessagesUnreadBadge userId={userId} className="-right-1.5 -top-1.5" />
                ) : null}
              </div>
              <span className="text-[11px] font-medium">Messages</span>
            </span>
          </Link>

          <Link
            href={profileHref}
            className={navLinkClass(profileActive)}
            aria-current={profileActive ? "page" : undefined}
          >
            <span className={navPillClass(profileActive)}>
              <svg
                className="h-[22px] w-[22px]"
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
              <span className="text-[11px] font-medium">{profileLabel}</span>
            </span>
          </Link>
        </div>
        </nav>
      ) : null}
    </>
  );
}

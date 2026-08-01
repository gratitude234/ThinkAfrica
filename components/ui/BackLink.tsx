"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

interface BackLinkProps {
  /** Where to go when there's no in-app history to return to. */
  fallbackHref?: string;
  className?: string;
  children: ReactNode;
}

/**
 * Returns the reader to wherever they came from — the feed tab they were on,
 * a profile, search results — instead of always resetting them to the top of
 * the home feed. Stays a real anchor so middle-click, modifier-click and
 * keyboard activation keep working, and so it still means something with
 * JavaScript unavailable.
 */
export default function BackLink({
  fallbackHref = "/",
  className,
  children,
}: BackLinkProps) {
  const router = useRouter();

  const canGoBack = () => {
    if (typeof window === "undefined" || window.history.length <= 1) return false;
    // An external referrer means "back" leaves the site entirely, which is not
    // what a back-to-the-feed control should do.
    if (!document.referrer) return true;
    try {
      return new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  };

  return (
    <a
      href={fallbackHref}
      onClick={(event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        if (!canGoBack()) return;
        event.preventDefault();
        router.back();
      }}
      className={className}
    >
      {children}
    </a>
  );
}

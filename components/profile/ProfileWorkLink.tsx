"use client";

import Link from "next/link";
import {
  trackProfileFunnelEvent,
  type ProfileFunnelSurface,
  type ProfileViewerState,
  type ProfileWorkKind,
} from "@/lib/profileFunnel";

export interface ProfileWorkTracking {
  profileId: string;
  viewerState: ProfileViewerState;
  surface: ProfileFunnelSurface;
}

/**
 * The middle step of the profile funnel: a reader opened one of this author's
 * entries from their profile.
 *
 * Navigation is never made to wait on the beacon. `trackActivationEvent` uses
 * `sendBeacon` where it exists and a `keepalive` fetch otherwise, both of
 * which survive the page unloading, so the click handler can return
 * immediately and let the link do what the reader asked for.
 *
 * Server surfaces that have no funnel context (the record page rendered for a
 * crawler, say) pass no `tracking` and get a plain link back, which keeps this
 * component usable everywhere an entry links to its work.
 */
export default function ProfileWorkLink({
  href,
  workId,
  workKind,
  tracking,
  className,
  children,
}: {
  href: string;
  workId: string;
  workKind: ProfileWorkKind;
  tracking?: ProfileWorkTracking | null;
  className?: string;
  children: React.ReactNode;
}) {
  if (!tracking) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={className}
      onClick={() => {
        trackProfileFunnelEvent({
          event: "profile_work_opened",
          profileId: tracking.profileId,
          viewerState: tracking.viewerState,
          surface: tracking.surface,
          workId,
          workKind,
        });
      }}
    >
      {children}
    </Link>
  );
}

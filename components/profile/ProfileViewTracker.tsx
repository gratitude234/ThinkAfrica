"use client";

import { useEffect, useRef } from "react";
import {
  trackProfileFunnelEvent,
  type ProfileViewerState,
} from "@/lib/profileFunnel";

/**
 * The first step of the profile funnel.
 *
 * It fires from a client effect, which means the page has actually rendered
 * for a person. Counting the view in `generateMetadata` would have counted
 * every crawler and every `<Link>` prefetch as a visit, and prefetch is the
 * larger error: Next warms a profile route on hover, so the numerator would
 * have included readers who never arrived.
 *
 * The ref stops a rerender or a Strict Mode double-effect from sending twice
 * within a mount; `trackActivationEvent` separately dedupes profile views
 * per route for ten minutes, which covers a remount from a client navigation
 * back to the same profile.
 */
export default function ProfileViewTracker({
  profileId,
  viewerState,
}: {
  profileId: string;
  viewerState: ProfileViewerState;
}) {
  const sentFor = useRef<string | null>(null);

  useEffect(() => {
    const key = `${profileId}:${viewerState}`;
    if (sentFor.current === key) return;
    sentFor.current = key;

    trackProfileFunnelEvent({
      event: "profile_viewed",
      profileId,
      viewerState,
      surface: "profile_header",
    });
  }, [profileId, viewerState]);

  return null;
}

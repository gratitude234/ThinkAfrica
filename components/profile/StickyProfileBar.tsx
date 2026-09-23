"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useAppChrome } from "@/app/(main)/AppChromeProvider";
import FollowButton from "@/components/ui/FollowButton";
import type { ProfileTab } from "@/lib/profileTabs";
import ProfileTabs from "./ProfileTabs";

export default function StickyProfileBar({ username, name, profileId, currentUserId, initialFollowing, isBlocked, active }: {
  username: string; name: string; profileId: string; currentUserId: string | null;
  initialFollowing: boolean; isBlocked: boolean; active: ProfileTab;
}) {
  const own = currentUserId === profileId;
  const [visible, setVisible] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);
  const { navHeight } = useAppChrome();
  useEffect(() => {
    const node = anchor.current;
    if (!node || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(!entry.isIntersecting && entry.boundingClientRect.top < navHeight);
    }, { rootMargin: `-${navHeight}px 0px 0px 0px` });
    observer.observe(node);
    return () => observer.disconnect();
  }, [navHeight]);
  return <>
    <div ref={anchor} className="profile-sticky-anchor" aria-hidden="true" />
    {visible ? <div className="profile-compact" aria-label="Compact writer profile">
      <div className="profile-compact-inner">
        <p className="profile-compact-name" title={name}>{name}</p>
        <div className="profile-compact-tabs"><ProfileTabs username={username} active={active} isOwnProfile={own} compact /></div>
        <div className="profile-compact-action">
          {own ? <Link href="/settings/profile" className="focus-ring profile-edit-compact">Edit profile</Link>
            : !isBlocked ? <FollowButton followingId={profileId} currentUserId={currentUserId}
              initialFollowing={initialFollowing} authorName={name} source="profile" size="compact" /> : null}
        </div>
      </div>
    </div> : null}
  </>;
}

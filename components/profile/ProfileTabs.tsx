"use client";

import Link from "next/link";
import { useEffect, useRef, type KeyboardEvent } from "react";
import {
  OWNER_PROFILE_TABS, PROFILE_TAB_LABELS, PUBLIC_PROFILE_TABS,
  profileTabHref, type ProfileTab,
} from "@/lib/profileTabs";

export default function ProfileTabs({ username, active, isOwnProfile, compact = false }: {
  username: string; active: ProfileTab; isOwnProfile: boolean; compact?: boolean;
}) {
  const tabs = isOwnProfile ? OWNER_PROFILE_TABS : PUBLIC_PROFILE_TABS;
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const selected = list.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!selected || !list.current) return;
    // Scroll only the tab strip, never the document on initial load.
    const left = selected.offsetLeft - list.current.offsetLeft;
    if (left < list.current.scrollLeft) list.current.scrollLeft = left;
    else if (left + selected.offsetWidth > list.current.scrollLeft + list.current.clientWidth) {
      list.current.scrollLeft = left + selected.offsetWidth - list.current.clientWidth;
    }
  }, [active]);
  function handleKeys(event: KeyboardEvent<HTMLDivElement>) {
    const links = Array.from(event.currentTarget.querySelectorAll<HTMLAnchorElement>('[role="tab"]'));
    const current = links.indexOf(document.activeElement as HTMLAnchorElement);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % links.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + links.length) % links.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = links.length - 1;
    else if (event.key === " ") { event.preventDefault(); links[current]?.click(); return; }
    else return;
    event.preventDefault();
    links[next]?.focus();
  }
  return (
    <div ref={list} role="tablist" aria-label="Profile sections" onKeyDown={handleKeys}
      className={`profile-tabs ${compact ? "profile-tabs-compact" : ""}`}>
      {tabs.map(tab => (
        <Link key={tab} href={profileTabHref(username, tab)} scroll={false}
          role="tab" id={`${compact ? "compact" : "main"}-tab-${tab}`}
          aria-controls="profile-panel" aria-selected={tab === active}
          tabIndex={tab === active ? 0 : -1}
          className="focus-ring profile-tab">
          {PROFILE_TAB_LABELS[tab]}
        </Link>
      ))}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import BlockUserButton from "@/components/moderation/BlockUserButton";
import ReportButton from "@/components/moderation/ReportButton";
import ProfileViewTracker from "@/components/profile/ProfileViewTracker";
import ShareButton from "@/components/profile/ShareButton";
import FollowButton from "@/components/ui/FollowButton";
import UserAvatar from "@/components/ui/UserAvatar";
import {
  getProfileViewerState,
  trackProfileFunnelEvent,
} from "@/lib/profileFunnel";
import {
  getProfileDisplayName,
  getProfileHeadline,
  type PublicProfileIdentity,
} from "@/lib/profileIdentity";

export type { PublicProfileIdentity } from "@/lib/profileIdentity";

const ACTION_BASE =
  "focus-ring inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors";

/** The single filled action. Only ever one of these is on screen at a time. */
const ACTION_PRIMARY = `${ACTION_BASE} bg-emerald-brand text-white hover:bg-[#0E4B37]`;

interface ProfileHeaderProps {
  profile: PublicProfileIdentity;
  followerCount: number;
  followingCount: number;
  isOwnProfile: boolean;
  currentUserId: string | null;
  initialFollowing: boolean;
  initialBlocked?: boolean;
}

function MoreMenu({
  profile,
  currentUserId,
  initialBlocked,
}: {
  profile: PublicProfileIdentity;
  currentUserId: string | null;
  initialBlocked: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const displayName = getProfileDisplayName(profile);

  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="More profile actions"
        className="focus-ring inline-flex h-11 w-11 items-center justify-center rounded-lg border border-card-border bg-card text-xl text-ink-soft hover:border-card-border-hover hover:text-ink"
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open ? (
        <div
          role="group"
          aria-label="More profile actions"
          className="absolute right-0 z-30 mt-2 w-52 rounded-xl border border-card-border bg-card p-2 shadow-xl"
        >
          <ShareButton
            label="Share profile"
            className="min-h-11 w-full justify-start border-0 px-3 shadow-none"
          />
          {currentUserId ? (
            <>
              <ReportButton
                targetType="user"
                targetId={profile.id}
                targetLabel={displayName}
                variant="text"
                className="min-h-11 w-full px-3 text-left text-sm"
              />
              <BlockUserButton
                targetUserId={profile.id}
                targetName={displayName}
                currentUserId={currentUserId}
                initialBlocked={initialBlocked}
                variant="text"
                className="min-h-11 w-full px-3 text-left text-sm"
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The platform's own confirmation that an account belongs to who it says, set
 * by an admin. The name of the state is the accessible name, on the element
 * itself, so touch and keyboard users get it too.
 */
function VerifiedMark({ profile }: { profile: PublicProfileIdentity }) {
  if (!profile.verified) return null;
  const label = profile.verified_type
    ? `Verified ${profile.verified_type}`
    : "Verified profile";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-brand text-[11px] font-bold leading-none text-white"
    >
      ✓
    </span>
  );
}

/**
 * A writer's profile header: photo, name, username, an optional headline or
 * bio, the two relationship counts, and what the reader can do.
 *
 * The publishing reset, Phase 2G, reduced it to that. The cover band, record
 * metrics, "Writes about" topics, the intellectual focus line and the sticky
 * follow bar are gone, and nothing on it measures or ranks the writer.
 *
 * The counts are single text nodes rather than an emphasised number beside a
 * label: an element whose whole text is "0" reads as a metric of zero.
 */
export default function ProfileHeader({
  profile,
  followerCount,
  followingCount,
  isOwnProfile,
  currentUserId,
  initialFollowing,
  initialBlocked = false,
}: ProfileHeaderProps) {
  const displayName = getProfileDisplayName(profile);
  const headline = getProfileHeadline(profile);
  const bio = profile.bio?.trim() || null;
  const viewerState = getProfileViewerState({
    viewerId: currentUserId,
    profileId: profile.id,
  });

  const actions = isOwnProfile ? (
    <>
      <Link href="/settings/profile" className={ACTION_PRIMARY}>
        Edit profile
      </Link>
      <ShareButton className="min-h-11" />
    </>
  ) : initialBlocked ? (
    <MoreMenu
      profile={profile}
      currentUserId={currentUserId}
      initialBlocked={initialBlocked}
    />
  ) : (
    <>
      <FollowButton
        followingId={profile.id}
        authorName={displayName}
        currentUserId={currentUserId}
        initialFollowing={initialFollowing}
        source="profile"
        /* Fires only once the server has confirmed the follow, so the funnel
           counts relationships rather than clicks. */
        onFollowCompleted={() =>
          trackProfileFunnelEvent({
            event: "profile_follow_completed",
            profileId: profile.id,
            viewerState,
            surface: "profile_header",
          })
        }
      />
      <MoreMenu
        profile={profile}
        currentUserId={currentUserId}
        initialBlocked={initialBlocked}
      />
    </>
  );

  const countLinkClass = "tap-target focus-ring font-medium text-ink-soft hover:text-ink";

  return (
    <>
      <ProfileViewTracker profileId={profile.id} viewerState={viewerState} />
      <section aria-labelledby="profile-name" className="pb-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <UserAvatar
              name={displayName}
              src={profile.avatar_url}
              size={80}
              className="shrink-0 overflow-hidden rounded-full"
            />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1
                  id="profile-name"
                  className="font-display text-[26px] font-semibold leading-tight text-ink [overflow-wrap:anywhere] sm:text-[30px]"
                >
                  {displayName}
                </h1>
                <VerifiedMark profile={profile} />
              </div>
              <p className="mt-1 text-sm text-ink-muted [overflow-wrap:anywhere]">
                @{profile.username}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        </div>

        {headline ? (
          <p className="mt-4 max-w-measure text-[15px] font-medium leading-6 text-ink-soft">
            {headline}
          </p>
        ) : bio ? (
          <p className="mt-4 line-clamp-3 max-w-measure whitespace-pre-line text-[15px] leading-6 text-ink-soft">
            {bio}
          </p>
        ) : null}

        <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
          <Link href={`/${profile.username}/followers`} className={countLinkClass}>
            {`${followerCount.toLocaleString()} follower${followerCount === 1 ? "" : "s"}`}
          </Link>
          <Link href={`/${profile.username}/following`} className={countLinkClass}>
            {`${followingCount.toLocaleString()} following`}
          </Link>
        </p>
      </section>
    </>
  );
}

"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";
import BlockUserButton from "@/components/moderation/BlockUserButton";
import ReportButton from "@/components/moderation/ReportButton";
import ContactInquiryModal from "@/components/profile/ContactInquiryModal";
import ProfileIdentityPanel from "@/components/profile/ProfileIdentityPanel";
import ProfileViewTracker from "@/components/profile/ProfileViewTracker";
import ShareButton from "@/components/profile/ShareButton";
import { findOrCreateConversation } from "@/lib/messaging";
import type { PublicProfileIdentity } from "@/lib/profileIdentity";
import {
  getProfileViewerState,
  trackProfileFunnelEvent,
} from "@/lib/profileFunnel";
import type { ProfileRecordSummary } from "@/lib/profileRecord";
import type { DemonstratedTopic } from "@/lib/profileTopics";
import { createClient } from "@/lib/supabase/client";

export type { PublicProfileIdentity } from "@/lib/profileIdentity";

/**
 * The header's own action buttons, in one place so Message, Edit profile and
 * the overflow trigger cannot drift apart.
 *
 * The radius is deliberately `rounded-lg` rather than the mockup's pill. The
 * Follow control sitting beside these is `AuthorRelationshipControls`, which
 * is shared with the mobile sticky bar, the feed interludes and the V2
 * variant, and it sets its own radius internally. Rounding only the buttons
 * this file owns would put a pill next to a rectangle; rounding the shared
 * control instead would restyle four other surfaces to settle a corner on
 * this one. The mockup's restraint is carried here by weight and colour
 * instead: one filled primary, one outlined secondary, everything else quiet.
 */
const ACTION_BASE =
  "focus-ring inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-semibold transition-colors";

/** The single filled action. Only ever one of these is on screen at a time. */
const ACTION_PRIMARY = `${ACTION_BASE} bg-emerald-brand text-white hover:bg-[#0E4B37]`;

/** Outlined in the brand, the way the mockup sets Message beside Follow. */
const ACTION_SECONDARY = `${ACTION_BASE} border border-emerald-brand/40 bg-card text-emerald-ink hover:border-emerald-brand hover:bg-green-tint`;

interface ProfileHeaderProps {
  profile: PublicProfileIdentity;
  /**
   * Topics this author has published on. Declared interests are deliberately
   * not accepted here: the header is the most-read claim on the page, and a
   * ticked checkbox rendered beside published work reads as published work.
   */
  demonstratedTopics: DemonstratedTopic[];
  recordSummary: ProfileRecordSummary;
  followerCount: number;
  /**
   * Counted from `follows` on every request, like the follower count beside
   * it. Neither is stored: both are a single indexed head query, and a
   * denormalised counter would need triggers and a reconciliation job to earn
   * its keep.
   */
  followingCount?: number | null;
  isOwnProfile: boolean;
  currentUserId: string | null;
  initialFollowing: boolean;
  initialSubscribed?: boolean;
  initialBlocked?: boolean;
  isOpenToOpportunities: boolean;
  canContact: boolean;
  talentProfileId: string | null;
  messagingEligibility?: { eligible: boolean; reason: string | null } | null;
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
  const displayName = profile.full_name ?? profile.username;

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
 * The public profile's header: relationship behaviour wrapped around the
 * shared identity presentation.
 *
 * The card itself lives in ProfileIdentityPanel, which the Command Center's
 * preview renders with no actions. Keeping one implementation is what stops
 * the preview from quietly becoming a different page than the one it claims
 * to show.
 */
export default function ProfileHeader({
  profile,
  demonstratedTopics,
  recordSummary,
  followerCount,
  followingCount = null,
  isOwnProfile,
  currentUserId,
  initialFollowing,
  initialSubscribed = false,
  initialBlocked = false,
  isOpenToOpportunities,
  canContact,
  talentProfileId,
  messagingEligibility,
}: ProfileHeaderProps) {
  const router = useRouter();
  const [showInquiry, setShowInquiry] = useState(false);
  const displayName = profile.full_name ?? profile.username;
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
      <AuthorRelationshipControls
        authorId={profile.id}
        authorName={displayName}
        currentUserId={currentUserId}
        initialFollowing={initialFollowing}
        initialSubscribed={initialSubscribed}
        source="profile"
        variant="icon"
        /* Fires only once the server has confirmed the follow, so the funnel
           counts relationships rather than clicks: a click that fails, or
           that redirects an anonymous reader to sign in, is not a
           conversion. */
        onFollowCompleted={() =>
          trackProfileFunnelEvent({
            event: "profile_follow_completed",
            profileId: profile.id,
            viewerState,
            surface: "profile_header",
          })
        }
      />
      {!currentUserId ? (
        <button
          type="button"
          onClick={() =>
            router.push(`/login?redirectTo=${encodeURIComponent(`/${profile.username}`)}`)
          }
          className={ACTION_SECONDARY}
        >
          Message
        </button>
      ) : messagingEligibility?.eligible ? (
        <MessageButton
          currentUserId={currentUserId}
          targetUserId={profile.id}
          reason={messagingEligibility.reason}
        />
      ) : null}
      <MoreMenu
        profile={profile}
        currentUserId={currentUserId}
        initialBlocked={initialBlocked}
      />
    </>
  );

  const availability = isOpenToOpportunities ? (
    isOwnProfile ? (
      <Link
        href="/settings/profile#opportunities"
        className="tap-target focus-ring inline-flex items-center rounded-full border border-green-wash-border bg-green-tint px-3 py-1 text-xs font-semibold text-emerald-ink"
      >
        Open to opportunities
      </Link>
    ) : canContact ? (
      <button
        type="button"
        onClick={() => {
          if (!currentUserId) {
            router.push(`/login?redirectTo=/${profile.username}`);
            return;
          }
          setShowInquiry(true);
        }}
        className="tap-target focus-ring inline-flex items-center rounded-full border border-green-wash-border bg-green-tint px-3 py-1 text-xs font-semibold text-emerald-ink hover:bg-green-wash"
      >
        Open to opportunities
      </button>
    ) : (
      <span className="inline-flex items-center rounded-full border border-green-wash-border bg-green-tint px-3 py-1 text-xs font-semibold text-emerald-ink">
        Open to opportunities
      </span>
    )
  ) : null;

  return (
    <>
      <ProfileViewTracker profileId={profile.id} viewerState={viewerState} />
      <ProfileIdentityPanel
        profile={profile}
        demonstratedTopics={demonstratedTopics}
        recordSummary={recordSummary}
        followerCount={followerCount}
        followingCount={followingCount}
        isOwnProfile={isOwnProfile}
        actions={actions}
        availability={availability}
      />

      {talentProfileId ? (
        <ContactInquiryModal
          talentProfileId={talentProfileId}
          open={showInquiry}
          onClose={() => setShowInquiry(false)}
          source="profile_header"
          funnel={{
            profileId: profile.id,
            viewerState,
            surface: "profile_header",
          }}
        />
      ) : null}
    </>
  );
}

function MessageButton({
  currentUserId,
  targetUserId,
  reason,
}: {
  currentUserId: string;
  targetUserId: string;
  reason: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpeningThread, startOpeningThread] = useTransition();
  const isBusy = loading || isOpeningThread;

  const handleMessage = async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const conversationId = await findOrCreateConversation(
        supabase,
        currentUserId,
        targetUserId
      );
      if (!conversationId) {
        setError("Unable to start conversation.");
        return;
      }
      startOpeningThread(() => router.push(`/messages/${conversationId}`));
    } catch (messageError) {
      setError(
        messageError instanceof Error
          ? messageError.message
          : "Unable to start conversation."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={handleMessage}
        disabled={isBusy}
        aria-busy={isBusy || undefined}
        title={reason ?? undefined}
        className={`${ACTION_SECONDARY} disabled:opacity-50`}
      >
        {isBusy ? "Opening…" : "Message"}
      </button>
      {error ? (
        <p className="mt-1 text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";
import BlockUserButton from "@/components/moderation/BlockUserButton";
import ReportButton from "@/components/moderation/ReportButton";
import ContactInquiryModal from "@/components/profile/ContactInquiryModal";
import ShareButton from "@/components/profile/ShareButton";
import UserAvatar from "@/components/ui/UserAvatar";
import { createClient } from "@/lib/supabase/client";
import { findOrCreateConversation } from "@/lib/messaging";

const VERIFIED_COLORS: Record<string, string> = {
  student: "text-emerald-600",
  researcher: "text-purple-600",
  faculty: "text-amber-500",
  institution: "text-blue-600",
};

const VERIFIED_CHIP_COLORS: Record<string, string> = {
  student: "border-emerald-100 bg-emerald-50 text-emerald-700",
  researcher: "border-purple-100 bg-purple-50 text-purple-700",
  faculty: "border-amber-100 bg-amber-50 text-amber-700",
  institution: "border-blue-100 bg-blue-50 text-blue-700",
};

interface ProfileHeaderProps {
  profile: {
    id: string;
    username: string;
    full_name: string | null;
    university: string | null;
    field_of_study: string | null;
    graduation_year?: number | null;
    is_alumni?: boolean;
    bio: string | null;
    avatar_url: string | null;
    cover_image_url?: string | null;
    verified: boolean;
    verified_type: string | null;
    points: number;
    created_at: string;
  };
  isOwnProfile: boolean;
  currentUserId: string | null;
  initialFollowing: boolean;
  initialSubscribed?: boolean;
  initialBlocked?: boolean;
  isOpenToOpportunities: boolean;
  canContact: boolean;
  talentProfileId: string | null;
  writingSince: string;
  messagingEligibility?: { eligible: boolean; reason: string | null } | null;
}

export default function ProfileHeader({
  profile,
  isOwnProfile,
  currentUserId,
  initialFollowing,
  initialSubscribed = false,
  initialBlocked = false,
  isOpenToOpportunities,
  canContact,
  talentProfileId,
  writingSince,
  messagingEligibility,
}: ProfileHeaderProps) {
  const router = useRouter();
  const [showInquiry, setShowInquiry] = useState(false);
  const [showAvatarLightbox, setShowAvatarLightbox] = useState(false);
  const displayName = profile.full_name ?? profile.username;
  const affiliationBits = [
    profile.university,
    profile.field_of_study,
    profile.is_alumni && profile.graduation_year
      ? `Graduated ${profile.graduation_year}`
      : `Writing since ${writingSince}`,
  ].filter(Boolean);
  // The header carries identity only. Contribution counts live in exactly one
  // place -- RecordPanel -- so the same figure is never stated twice on the
  // page in two different vocabularies.
  const verifiedLabel = profile.verified_type
    ? profile.verified_type.charAt(0).toUpperCase() +
      profile.verified_type.slice(1)
    : "Verified";
  const verifiedType = profile.verified_type ?? "student";

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-card-border bg-card">
        {profile.cover_image_url ? (
          <div className="h-20 overflow-hidden bg-canvas sm:h-24 lg:h-32">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profile.cover_image_url}
              alt={`${displayName} cover`}
              className="h-full w-full object-cover"
            />
          </div>
        ) : (
          <div className="h-12 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.14),transparent_38%),linear-gradient(135deg,#FFFFFF,#FAF8F5)] sm:h-14" />
        )}

        <div
          className={`flex flex-col gap-5 p-5 sm:p-6 md:flex-row md:items-start md:p-7 ${
            profile.avatar_url ? "pt-0 sm:pt-0 md:pt-0" : ""
          }`}
        >
          {profile.avatar_url ? (
            <button
              type="button"
              onClick={() => setShowAvatarLightbox(true)}
              className="-mt-11 shrink-0 cursor-zoom-in rounded-full md:-mt-12"
              aria-label="View full profile picture"
            >
              <UserAvatar
                name={displayName}
                src={profile.avatar_url}
                size={88}
                className="border-4 border-card shadow-md"
              />
            </button>
          ) : null}

          <div className="min-w-0 flex-1">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {profile.verified ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${
                    VERIFIED_CHIP_COLORS[verifiedType] ??
                    "border-emerald-100 bg-emerald-50 text-emerald-700"
                  }`}
                >
                  Verified {verifiedLabel}
                </span>
              ) : null}
              {isOpenToOpportunities ? (
                canContact && !isOwnProfile ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUserId) { router.push("/login"); return; }
                      setShowInquiry(true);
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 transition-colors hover:bg-emerald-100"
                  >
                    Open to opportunities
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </button>
                ) : (
                  <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                    Open to opportunities
                  </span>
                )
              ) : null}
              {profile.is_alumni && profile.graduation_year ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                  Alumni &apos;{String(profile.graduation_year).slice(-2)}
                </span>
              ) : null}
            </div>

            <h1 className="font-display flex flex-wrap items-center gap-2 text-3xl font-semibold leading-tight text-ink">
              <span>{displayName}</span>
              {/* Decorative: the chip above already states the verified type
                  in text, so announcing the mark too would repeat it. */}
              {profile.verified ? (
                <span
                  aria-hidden="true"
                  className={`text-sm font-bold ${
                    VERIFIED_COLORS[verifiedType] ??
                    "text-emerald-600"
                  }`}
                >
                  {"\u2713"}
                </span>
              ) : null}
            </h1>

            <p className="mt-1 text-sm text-ink-muted">@{profile.username}</p>

            {profile.bio ? (
              <p className="mt-3 max-w-prose text-[15px] leading-6 text-ink-soft">
                {profile.bio}
              </p>
            ) : null}

            {affiliationBits.length > 0 ? (
              <p className="mt-3 text-sm text-ink-muted">
                {affiliationBits.join(" / ")}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[200px]">
            {isOwnProfile ? (
              <>
                <Link
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-xl bg-emerald-brand px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#0E4B37]"
                >
                  Edit profile
                </Link>
                <ShareButton label="Share profile" className="w-full" />
              </>
            ) : initialBlocked ? (
              <>
                <BlockUserButton
                  targetUserId={profile.id}
                  targetName={displayName}
                  currentUserId={currentUserId}
                  initialBlocked
                />
                <ShareButton className="w-full" />
              </>
            ) : (
              <>
                <AuthorRelationshipControls
                  authorId={profile.id}
                  authorName={displayName}
                  currentUserId={currentUserId}
                  initialFollowing={initialFollowing}
                  initialSubscribed={initialSubscribed}
                  source="profile"
                  className="mt-0"
                />
                <div className="flex gap-2">
                  {currentUserId ? (
                    messagingEligibility?.eligible ? (
                      <MessageButton
                        currentUserId={currentUserId}
                        targetUserId={profile.id}
                        reason={messagingEligibility.reason}
                        className="flex-1"
                      />
                    ) : (
                      <div className="flex-1 rounded-lg border border-dashed border-card-border px-3 py-2 text-center text-xs text-ink-muted">
                        {messagingEligibility?.reason ?? "Messaging unavailable"}
                      </div>
                    )
                  ) : null}
                  <ShareButton className={currentUserId ? "flex-1" : "w-full"} />
                </div>
                {currentUserId ? (
                  <div className="flex items-center justify-center gap-3 pt-1">
                    <ReportButton
                      targetType="user"
                      targetId={profile.id}
                      targetLabel={displayName}
                      variant="text"
                    />
                    <span className="text-divider">|</span>
                    <BlockUserButton
                      targetUserId={profile.id}
                      targetName={displayName}
                      currentUserId={currentUserId}
                      initialBlocked={false}
                      variant="text"
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>

      </section>

      {talentProfileId ? (
        <ContactInquiryModal
          talentProfileId={talentProfileId}
          open={showInquiry}
          onClose={() => setShowInquiry(false)}
          source="profile_header"
        />
      ) : null}

      {showAvatarLightbox && profile.avatar_url ? (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setShowAvatarLightbox(false)}
        >
          <div className="relative max-h-[90vw] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={profile.avatar_url}
              alt={displayName}
              className="max-h-[85vh] max-w-[85vw] rounded-xl object-contain shadow-2xl"
            />
            <button
              type="button"
              onClick={() => setShowAvatarLightbox(false)}
              className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-card shadow-md hover:bg-canvas"
              aria-label="Close"
            >
              <svg className="h-4 w-4 text-ink-soft" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function MessageButton({
  currentUserId,
  targetUserId,
  reason,
  className = "",
}: {
  currentUserId: string;
  targetUserId: string;
  reason: string | null;
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Resolving the conversation and opening the thread are two separate
  // waits. `loading` only covers the first: it used to be cleared in a
  // finally block that ran the instant the conversation id came back, so the
  // button flipped from "Opening..." back to "Message" while the thread was
  // still loading and looked like the click had failed.
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

      if (conversationId) {
        startOpeningThread(() => {
          router.push(`/messages/${conversationId}`);
        });
      } else {
        setError("Unable to start conversation.");
      }
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
    <div className={className}>
      {reason ? (
        <p className="mb-1 text-center text-[10px] text-ink-muted">{reason}</p>
      ) : null}
      <button
        type="button"
        onClick={handleMessage}
        disabled={isBusy}
        aria-busy={isBusy || undefined}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-card-border bg-card px-4 py-2 text-sm font-medium text-ink-soft transition-colors hover:border-card-border-hover hover:text-ink disabled:opacity-50"
      >
        {isBusy ? "Opening..." : "Message"}
      </button>
      {error ? (
        <p className="mt-1 text-center text-[10px] text-red-500">{error}</p>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import FollowButton from "@/app/(main)/[username]/FollowButton";
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
    created_at: string;
  };
  isOwnProfile: boolean;
  currentUserId: string | null;
  initialFollowing: boolean;
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
  isOpenToOpportunities,
  canContact,
  talentProfileId,
  writingSince,
  messagingEligibility,
}: ProfileHeaderProps) {
  const router = useRouter();
  const [showInquiry, setShowInquiry] = useState(false);
  const displayName = profile.full_name ?? profile.username;
  const affiliationBits = [
    profile.university,
    profile.field_of_study,
    profile.is_alumni && profile.graduation_year
      ? `Graduated ${profile.graduation_year}`
      : `Writing since ${writingSince}`,
  ].filter(Boolean);

  return (
    <>
      {profile.cover_image_url ? (
        <div className="mb-4 overflow-hidden rounded-2xl border border-gray-200">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={profile.cover_image_url}
            alt={`${displayName} cover`}
            className="h-20 w-full object-cover"
          />
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-start">
          <UserAvatar
            name={displayName}
            src={profile.avatar_url}
            size={96}
            className="border border-gray-100"
          />

          <div className="min-w-0 flex-1">
            <h1 className="font-display flex flex-wrap items-center gap-2 text-2xl font-bold text-ink">
              <span>{displayName}</span>
              {profile.verified ? (
                <span
                  title={
                    profile.verified_type
                      ? `Verified ${profile.verified_type}`
                      : "Verified"
                  }
                  className={`text-sm font-bold ${
                    VERIFIED_COLORS[profile.verified_type ?? "student"] ??
                    "text-emerald-600"
                  }`}
                >
                  ✓
                </span>
              ) : null}
              {profile.is_alumni && profile.graduation_year ? (
                <span className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  🎓 Alumni &apos;{String(profile.graduation_year).slice(-2)}
                </span>
              ) : null}
            </h1>

            <p className="mt-1 text-sm text-gray-500">@{profile.username}</p>

            {profile.bio ? (
              <p className="mt-2 max-w-prose text-base italic text-gray-700">
                {profile.bio}
              </p>
            ) : null}

            {affiliationBits.length > 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                {affiliationBits.join(" · ")}
              </p>
            ) : null}
          </div>

          <div className="flex w-full flex-col gap-3 md:w-auto md:min-w-[200px]">
            {isOwnProfile ? (
              <>
                <Link
                  href="/settings"
                  className="inline-flex items-center justify-center rounded-lg bg-emerald-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-600"
                >
                  Edit profile
                </Link>
                <ShareButton label="Share profile" className="w-full" />
              </>
            ) : (
              <>
                <FollowButton
                  targetUserId={profile.id}
                  currentUserId={currentUserId}
                  initialFollowing={initialFollowing}
                  className="mt-0"
                />
                {!isOwnProfile && currentUserId ? (
                  messagingEligibility?.eligible ? (
                    <MessageButton
                      currentUserId={currentUserId}
                      targetUserId={profile.id}
                      reason={messagingEligibility.reason}
                    />
                  ) : (
                    <div className="w-full rounded-lg border border-dashed border-gray-200 px-4 py-2 text-center text-xs text-gray-400">
                      Message after following each other
                    </div>
                  )
                ) : null}
                <ShareButton className="w-full" />
                {isOpenToOpportunities && canContact ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!currentUserId) {
                        router.push("/login");
                        return;
                      }
                      setShowInquiry(true);
                    }}
                    className="inline-flex items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900"
                  >
                    Contact
                  </button>
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

  const handleMessage = async () => {
    setLoading(true);

    try {
      const supabase = createClient();
      const conversationId = await findOrCreateConversation(
        supabase,
        currentUserId,
        targetUserId
      );

      if (conversationId) {
        router.push(`/messages/${conversationId}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      {reason ? (
        <p className="mb-1 text-center text-[10px] text-gray-400">{reason}</p>
      ) : null}
      <button
        type="button"
        onClick={handleMessage}
        disabled={loading}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-gray-400 hover:text-gray-900 disabled:opacity-50"
      >
        {loading ? "Opening..." : "Message"}
      </button>
    </div>
  );
}

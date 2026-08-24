"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import AuthorRelationshipControls from "@/components/profile/AuthorRelationshipControls";
import BlockUserButton from "@/components/moderation/BlockUserButton";
import ReportButton from "@/components/moderation/ReportButton";
import ContactInquiryModal from "@/components/profile/ContactInquiryModal";
import ShareButton from "@/components/profile/ShareButton";
import UserAvatar from "@/components/ui/UserAvatar";
import { findOrCreateConversation } from "@/lib/messaging";
import {
  getProfileIdentityLines,
  type PublicProfileIdentity,
} from "@/lib/profileIdentity";
import { buildProfileRecordHref, type ProfileRecordSummary } from "@/lib/profileRecord";
import { createClient } from "@/lib/supabase/client";

export type { PublicProfileIdentity } from "@/lib/profileIdentity";

interface ProfileHeaderProps {
  profile: PublicProfileIdentity;
  topics: string[];
  recordSummary: ProfileRecordSummary;
  followerCount: number;
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
        className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-card-border bg-card text-xl text-ink-soft hover:border-card-border-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
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

function RecordOverview({ username, summary }: { username: string; summary: ProfileRecordSummary }) {
  const metrics = [
    {
      label: "Publications",
      value: summary.publicationCount,
      href: buildProfileRecordHref({ username, filter: "publications" }),
      description: "Original published work, including accepted co-authored work.",
    },
    {
      label: "Source-backed",
      value: summary.sourceBackedCount,
      href: buildProfileRecordHref({ username, filter: "publications", quality: "source_backed" }),
      description: "Publications with at least one structured source.",
    },
    {
      label: "Citable",
      value: summary.citableCount,
      href: buildProfileRecordHref({ username, filter: "publications", quality: "citable" }),
      description: "Publications with a stable citation record.",
    },
  ];

  return (
    <div className="border-t border-card-border bg-canvas/70 px-5 py-4 sm:px-7">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-gold-ink">
        Intellectual Record
      </p>
      <dl className="grid grid-cols-3 divide-x divide-card-border">
        {metrics.map((metric) => (
          <div key={metric.label} className="px-3 first:pl-0 last:pr-0 sm:px-5">
            <dt className="text-[11px] text-ink-muted sm:text-xs">{metric.label}</dt>
            <dd>
              <Link
                href={metric.href}
                aria-label={`${metric.value} ${metric.label}. ${metric.description}`}
                className="mt-1 inline-flex min-h-11 items-center font-display text-2xl font-semibold tabular-nums text-ink hover:text-emerald-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
              >
                {metric.value.toLocaleString()}
              </Link>
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function ProfileHeader({
  profile,
  topics,
  recordSummary,
  followerCount,
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
  const [aboutExpanded, setAboutExpanded] = useState(false);
  const displayName = profile.full_name ?? profile.username;
  const identity = getProfileIdentityLines(profile);
  const verifiedLabel = profile.verified_type
    ? `Verified ${profile.verified_type}`
    : "Verified profile";
  const showAboutToggle = (profile.bio?.trim().length ?? 0) > 180;

  return (
    <>
      <section className="overflow-hidden rounded-xl border border-card-border bg-card">
        {profile.cover_image_url ? (
          <div className="relative h-20 overflow-hidden bg-canvas sm:h-24 lg:h-28">
            <Image
              src={profile.cover_image_url}
              alt=""
              fill
              sizes="(max-width: 960px) 100vw, 900px"
              className="object-cover"
            />
          </div>
        ) : (
          <div className="h-14 bg-[radial-gradient(circle_at_18%_0%,rgba(16,185,129,0.14),transparent_38%),linear-gradient(135deg,#FFFFFF,#FAF8F5)] sm:h-16" />
        )}

        <div className="p-5 sm:p-7">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <UserAvatar
              name={displayName}
              src={profile.avatar_url}
              size={88}
              className="-mt-12 shrink-0 border-4 border-card shadow-sm sm:-mt-14"
            />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl font-semibold leading-tight text-ink">{displayName}</h1>
                {profile.verified ? (
                  <span
                    role="img"
                    aria-label={verifiedLabel}
                    title={verifiedLabel}
                    className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-brand text-xs font-bold text-white"
                  >
                    ✓
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink-muted">@{profile.username}</p>
              <p className="mt-3 text-[15px] font-medium text-ink-soft">{identity.headline}</p>
              {identity.affiliation ? (
                <p className="mt-1 text-sm text-ink-muted">{identity.affiliation}</p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <Link href={`/${profile.username}/followers`} className="inline-flex min-h-11 items-center font-medium text-ink-soft hover:text-ink">
                  {followerCount.toLocaleString()} follower{followerCount === 1 ? "" : "s"}
                </Link>
                {isOpenToOpportunities ? (
                  isOwnProfile ? (
                    <Link
                      href="/opportunities#opportunity-profile"
                      className="inline-flex min-h-11 items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700"
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
                      className="min-h-11 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                    >
                      Open to opportunities
                    </button>
                  ) : (
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      Open to opportunities
                    </span>
                  )
                ) : null}
              </div>

              {topics.length > 0 ? (
                <ul className="mt-4 flex flex-wrap gap-2" aria-label="Topics">
                  {topics.slice(0, 3).map((topic) => (
                    <li key={topic}>
                      <Link
                        href={`/topics/${encodeURIComponent(topic)}`}
                        className="inline-flex min-h-11 items-center rounded-full bg-green-tint px-3 text-xs font-medium text-emerald-brand hover:opacity-80"
                      >
                        {topic}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            <div className="flex shrink-0 flex-wrap items-start gap-2 sm:max-w-[290px] sm:justify-end">
              {isOwnProfile ? (
                <>
                  <Link
                    href="/settings?tab=profile#profile-identity"
                    className="inline-flex min-h-11 items-center justify-center rounded-lg bg-emerald-brand px-4 text-sm font-semibold text-white hover:bg-[#0E4B37]"
                  >
                    Edit profile
                  </Link>
                  <ShareButton className="min-h-11" />
                </>
              ) : initialBlocked ? null : (
                <>
                  <AuthorRelationshipControls
                    authorId={profile.id}
                    authorName={displayName}
                    currentUserId={currentUserId}
                    initialFollowing={initialFollowing}
                    initialSubscribed={initialSubscribed}
                    source="profile"
                    variant="icon"
                  />
                  {!currentUserId ? (
                    <button
                      type="button"
                      onClick={() =>
                        router.push(
                          `/login?redirectTo=${encodeURIComponent(`/${profile.username}`)}`
                        )
                      }
                      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:border-card-border-hover hover:text-ink"
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
                </>
              )}
              {!isOwnProfile ? (
                <MoreMenu
                  profile={profile}
                  currentUserId={currentUserId}
                  initialBlocked={initialBlocked}
                />
              ) : null}
            </div>
          </div>

          {profile.bio ? (
            <div className="mt-5 border-t border-card-border pt-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-ink">About</h2>
                {isOwnProfile ? (
                  <Link href="/settings?tab=profile#profile-about" className="inline-flex min-h-11 items-center text-xs font-semibold text-emerald-brand">
                    Edit
                  </Link>
                ) : null}
              </div>
              <p className={`max-w-[72ch] whitespace-pre-line text-sm leading-6 text-ink-soft ${aboutExpanded ? "" : "line-clamp-3"}`}>
                {profile.bio}
              </p>
              {showAboutToggle ? (
                <button
                  type="button"
                  onClick={() => setAboutExpanded((current) => !current)}
                  aria-expanded={aboutExpanded}
                  className="mt-1 inline-flex min-h-11 items-center text-xs font-semibold text-emerald-brand"
                >
                  {aboutExpanded ? "Show less" : "See more"}
                </button>
              ) : null}
            </div>
          ) : isOwnProfile ? (
            <Link href="/settings?tab=profile#profile-about" className="mt-5 inline-flex min-h-11 items-center text-sm font-semibold text-emerald-brand">
              Add an About section
            </Link>
          ) : null}
        </div>

        <RecordOverview username={profile.username} summary={recordSummary} />
      </section>

      {talentProfileId ? (
        <ContactInquiryModal
          talentProfileId={talentProfileId}
          open={showInquiry}
          onClose={() => setShowInquiry(false)}
          source="profile_header"
        />
      ) : null}
    </>
  );
}

function MessageButton({ currentUserId, targetUserId, reason }: { currentUserId: string; targetUserId: string; reason: string | null }) {
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
      const conversationId = await findOrCreateConversation(supabase, currentUserId, targetUserId);
      if (!conversationId) {
        setError("Unable to start conversation.");
        return;
      }
      startOpeningThread(() => router.push(`/messages/${conversationId}`));
    } catch (messageError) {
      setError(messageError instanceof Error ? messageError.message : "Unable to start conversation.");
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
        className="inline-flex min-h-11 items-center justify-center rounded-lg border border-card-border bg-card px-4 text-sm font-semibold text-ink-soft hover:border-card-border-hover hover:text-ink disabled:opacity-50"
      >
        {isBusy ? "Opening…" : "Message"}
      </button>
      {error ? <p className="mt-1 text-xs text-red-600" role="alert">{error}</p> : null}
    </div>
  );
}
